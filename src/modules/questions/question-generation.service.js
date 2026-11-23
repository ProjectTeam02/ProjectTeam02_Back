const { Concept, AiRequest } = require('@leren/database');
const { AppDataSource } = require('../../config/database');
const FastApiClient = require('../../clients/fastapi.client');
const env = require('../../config/env');
const AppError = require('../../common/errors/AppError');
const schema = require('./question-generation.schema');
const { questionKey, fingerprint } = require('../../common/utils/ai-idempotency.util');
const requestRepository = require('./question-generation-request.repository');
const { loadEvidence } = require('./question-evidence');
const { saveDraft } = require('./question.repository');

// 실패 원인 코드 (tutor.ai_requests.error_code, 응답 details.reason)
//   AI_TIMEOUT · AI_REQUEST_REJECTED(AI 422) · AI_HTTP_ERROR · AI_UNREACHABLE : AI 호출 단계
//   AI_GENERATION_FAILED(AI가 status FAILED 반환) · AI_INVALID_RESPONSE(규격·검증 불일치)
//   EVIDENCE_NOT_APPROVED(출처가 승인 근거에 없음) · SAVE_FAILED(문제 저장·작업 확정 실패)
function failureReason(error, stage) {
  if (error?.reason) return error.reason;
  if (stage === 'SAVE') return 'SAVE_FAILED';
  if (stage === 'VALIDATE') return 'AI_INVALID_RESPONSE';
  return 'AI_UNREACHABLE';
}

module.exports = function service(dataSource = AppDataSource, options = {}) {
  const config = options.config || env;
  const client = options.client || new FastApiClient({ timeoutMs: config.questionGenerationTimeoutMs });
  const jobs = requestRepository(dataSource);
  return {
    async generate(payload, idempotencyKey) {
      const input = schema.request(payload);
      // AI 서버 상한보다 많으면 예약 전에 거부: AI 422 → FAILED로 키가 소모되는 일을 막음
      const maxCount = config.questionGenerationMaxCount ?? 20;
      if (input.questionCount > maxCount) {
        throw AppError.validation(`questionCount는 1~${maxCount} 사이여야 합니다 (AI 서버 설정 상한).`);
      }
      const key = questionKey(idempotencyKey);
      const digest = fingerprint(input);
      if (!config.questionGenerationEnabled) throw AppError.unavailable('문제 생성 기능이 비활성화되어 있습니다.');
      const existing = await jobs.find(key);
      if (existing) return jobs.replay(existing, digest);
      const evidence = await loadEvidence(config.questionGenerationEvidencePath);
      if (!await dataSource.getRepository(Concept).findOneBy({ conceptId: input.conceptId })) {
        throw AppError.notFound('해당 경제 개념을 찾을 수 없습니다.');
      }
      // COMMIT the reservation before the AI call. No network I/O inside that transaction.
      const reservation = await jobs.reserve(key, input, digest);
      if (!reservation.inserted) return jobs.replay(reservation.job, digest);
      const job = reservation.job;
      const started = Date.now();
      let stage = 'AI_CALL';
      let aiError = null;
      try {
        const { conceptId, ...aiRequest } = input;
        const result = await client.generateQuestions(aiRequest);
        stage = 'VALIDATE';
        if (result?.status === 'FAILED') {
          aiError = typeof result.error === 'string' ? result.error.slice(0, 100) : null;
          throw Object.assign(new Error('AI generation failed'), { reason: 'AI_GENERATION_FAILED' });
        }
        const drafts = schema.response(result, input, ids => {
          try { return evidence.resolve(ids); }
          catch (error) { error.reason = 'EVIDENCE_NOT_APPROVED'; throw error; }
        });
        stage = 'SAVE';
        return await dataSource.transaction(async manager => {
          const questions = [];
          for (const draft of drafts) {
            questions.push(await saveDraft(manager, draft, { status: 'REVIEW_PENDING', generationRequestId: job.requestId }));
          }
          const snapshot = { httpStatus: 201, body: { success: true, data: { requestId: job.requestId, status: 'COMPLETED', questions } } };
          await jobs.complete(manager, job, result, evidence.metadata(result.sourceIds), snapshot, Date.now() - started);
          return snapshot;
        });
      } catch (error) {
        const reason = failureReason(error, stage);
        // 원인만 기록 (요청 본문·응답 원문·접속 정보는 남기지 않음)
        console.error(`[question-generation] 실패 requestId=${job.requestId} reason=${reason}${aiError ? ` aiError=${aiError}` : ''}`
          + `${error?.details?.upstreamStatus ? ` upstreamStatus=${error.details.upstreamStatus}` : ''}`);
        const snapshot = { httpStatus: 503, body: { success: false, code: 'QUESTION_GENERATION_FAILED',
          message: '문제 생성 또는 저장에 실패했습니다. 같은 키의 요청은 다시 실행하지 않습니다.', details: { requestId: job.requestId, reason } } };
        let changed;
        try { changed = await jobs.fail(job, snapshot, Date.now() - started, { reason, aiError }); }
        catch (_failure) {
          throw AppError.unavailable('생성 결과 또는 작업 상태를 확정하지 못했습니다. 같은 키로 상태를 확인하거나 수동 복구를 진행해 주세요.');
        }
        if (changed) return snapshot;
        // A recovery or an ambiguous COMMIT may already have finalized this job.
        const current = await dataSource.getRepository(AiRequest).findOneByOrFail({ requestId: job.requestId });
        return jobs.replay(current, digest);
      }
    },
  };
};
