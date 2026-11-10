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

module.exports = function service(dataSource = AppDataSource, options = {}) {
  const config = options.config || env;
  const client = options.client || new FastApiClient({ timeoutMs: config.questionGenerationTimeoutMs });
  const jobs = requestRepository(dataSource);
  return {
    async generate(payload, idempotencyKey) {
      const input = schema.request(payload);
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
      try {
        const { conceptId, ...aiRequest } = input;
        const result = await client.generateQuestions(aiRequest);
        const drafts = schema.response(result, input, ids => evidence.resolve(ids));
        return await dataSource.transaction(async manager => {
          const questions = [];
          for (const draft of drafts) {
            questions.push(await saveDraft(manager, draft, { status: 'REVIEW_PENDING', generationRequestId: job.requestId }));
          }
          const snapshot = { httpStatus: 201, body: { success: true, data: { requestId: job.requestId, status: 'COMPLETED', questions } } };
          await jobs.complete(manager, job, result, evidence.metadata(result.sourceIds), snapshot, Date.now() - started);
          return snapshot;
        });
      } catch (_error) {
        const snapshot = { httpStatus: 503, body: { success: false, code: 'QUESTION_GENERATION_FAILED',
          message: '문제 생성 또는 저장에 실패했습니다. 같은 키의 요청은 다시 실행하지 않습니다.', details: { requestId: job.requestId } } };
        let changed;
        try { changed = await jobs.fail(job, snapshot, Date.now() - started); }
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
