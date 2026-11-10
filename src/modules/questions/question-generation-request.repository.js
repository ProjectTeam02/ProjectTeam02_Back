const { AiRequest, Question } = require('@leren/database');
const AppError = require('../../common/errors/AppError');
const conflict = (code, message) => new AppError(message, 409, code);

module.exports = function repository(dataSource) {
  const repo = manager => manager.getRepository(AiRequest);
  return {
    find: key => repo(dataSource.manager).findOneBy({ idempotencyKey: key }),
    async reserve(key, input, fingerprint) {
      // Returning from this awaited transaction means COMMIT has completed.
      return dataSource.transaction(async manager => {
        const scope = { generationInput: input, idempotency: { version: 1, requestFingerprint: fingerprint } };
        const rows = await manager.query(`INSERT INTO app.ai_requests
          (request_type, status, model_tier, idempotency_key, knowledge_scope)
          VALUES ('QUESTION_GEN', 'RESERVED', 'BASIC', $1, $2::jsonb)
          ON CONFLICT (idempotency_key) DO NOTHING RETURNING request_id`, [key, JSON.stringify(scope)]);
        const job = rows.length
          ? await repo(manager).findOneByOrFail({ requestId: rows[0].request_id })
          : await repo(manager).findOneByOrFail({ idempotencyKey: key });
        return { inserted: rows.length === 1, job };
      });
    },
    replay(job, fingerprint) {
      if (job.requestType !== 'QUESTION_GEN') throw conflict('IDEMPOTENCY_NAMESPACE_CONFLICT', '다른 종류의 AI 요청과 저장 키가 충돌했습니다. 관리자 확인이 필요합니다.');
      const metadata = job.knowledgeScope?.idempotency;
      if (metadata?.version !== 1 || metadata.requestFingerprint !== fingerprint) {
        throw conflict('IDEMPOTENCY_PAYLOAD_CONFLICT', '동일한 Idempotency-Key에 다른 요청 내용이 등록되어 있습니다.');
      }
      if (job.status === 'RESERVED') throw conflict('QUESTION_GENERATION_IN_PROGRESS', '동일한 요청이 처리 중입니다. 새 AI 호출은 실행하지 않았습니다.');
      const snapshot = metadata.response;
      const expectedStatus = job.status === 'SUCCEEDED' ? 201 : job.status === 'FAILED' ? 503 : null;
      if (expectedStatus === null || !snapshot || snapshot.httpStatus !== expectedStatus || !snapshot.body
        || snapshot.body.success !== (job.status === 'SUCCEEDED')) {
        throw AppError.unavailable('생성 작업의 응답 기록이 일치하지 않습니다. 새로 생성하지 않고 관리자 확인을 기다립니다.');
      }
      return snapshot;
    },
    async complete(manager, job, generationResult, sourceDocuments, snapshot, elapsed) {
      const result = await repo(manager).update({ requestId: job.requestId, requestType: 'QUESTION_GEN', status: 'RESERVED' }, {
        status: 'SUCCEEDED', completedAt: new Date(), latencyMs: elapsed,
        knowledgeScope: { ...job.knowledgeScope, generationResult, sourceDocuments,
          idempotency: { ...job.knowledgeScope.idempotency, response: snapshot } },
      });
      if (result.affected !== 1) throw conflict('QUESTION_GENERATION_STATE_CHANGED', '작업 상태가 변경되어 생성 결과를 저장하지 않았습니다.');
    },
    async fail(job, snapshot, elapsed) {
      const result = await repo(dataSource.manager).update({ requestId: job.requestId, requestType: 'QUESTION_GEN', status: 'RESERVED' }, {
        status: 'FAILED', completedAt: new Date(), latencyMs: elapsed, errorCode: snapshot.body.code,
        knowledgeScope: { ...job.knowledgeScope,
          idempotency: { ...job.knowledgeScope.idempotency, response: snapshot } },
      });
      return result.affected === 1;
    },
    async inspect(requestId) {
      const job = await repo(dataSource.manager).findOneBy({ requestId, requestType: 'QUESTION_GEN' });
      if (!job) throw AppError.notFound('해당 문제 생성 작업을 찾을 수 없습니다.');
      const questionCount = await dataSource.getRepository(Question).countBy({ generationRequestId: requestId });
      return { requestId: job.requestId, status: job.status, reservedAt: job.reservedAt.toISOString(),
        completedAt: job.completedAt?.toISOString() || null, questionCount,
        recoverable: job.status === 'RESERVED' && questionCount === 0 && job.knowledgeScope?.idempotency?.version === 1 };
    },
    async recover(requestId, expectedReservedAt, reason) {
      if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500
        || typeof expectedReservedAt !== 'string' || !Number.isFinite(Date.parse(expectedReservedAt))) {
        throw AppError.validation('등록 시각과 1~500자의 복구 사유가 필요합니다.');
      }
      reason = reason.trim();
      return dataSource.transaction(async manager => {
        const job = await repo(manager).findOne({ where: { requestId, requestType: 'QUESTION_GEN' }, lock: { mode: 'pessimistic_write' } });
        if (!job) throw AppError.notFound('해당 문제 생성 작업을 찾을 수 없습니다.');
        if (job.status !== 'RESERVED' || job.reservedAt.toISOString() !== expectedReservedAt
          || job.knowledgeScope?.idempotency?.version !== 1) {
          throw conflict('QUESTION_RECOVERY_CONFLICT', '작업 상태 또는 등록 시각이 달라 수동 복구를 중단했습니다.');
        }
        if (await manager.getRepository(Question).countBy({ generationRequestId: requestId })) {
          throw conflict('QUESTION_RECOVERY_CONFLICT', '연결된 문제가 있어 자동으로 실패 처리할 수 없습니다.');
        }
        const snapshot = { httpStatus: 503, body: { success: false, code: 'QUESTION_GENERATION_INTERRUPTED',
          message: '중단된 생성 작업을 수동 종료했습니다. AI 처리 결과가 불명확하므로 같은 키로 재호출하지 않습니다.',
          details: { requestId } } };
        await repo(manager).update(requestId, { status: 'FAILED', completedAt: new Date(), errorCode: snapshot.body.code,
          knowledgeScope: { ...job.knowledgeScope,
            manualRecovery: { recoveredAt: new Date().toISOString(), reason, upstreamOutcome: 'UNKNOWN' },
            idempotency: { ...job.knowledgeScope.idempotency, response: snapshot } } });
        return snapshot;
      });
    },
  };
};
