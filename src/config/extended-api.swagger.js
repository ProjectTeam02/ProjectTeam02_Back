const auth = [{ bearerAuth: [] }];
const error = { description: '오류 응답', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const uuid = name => ({ name, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });
const query = (name, schema = { type: 'string' }) => ({ name, in: 'query', schema });
const body = (properties, required = Object.keys(properties)) => ({ required: true, content: { 'application/json': { schema: { type: 'object', required, additionalProperties: false, properties } } } });
const success = (description = '성공') => ({ description, content: { 'application/json': { schema: { $ref: '#/components/schemas/ExtendedSuccess' } } } });
const secure = (summary, parameters = [], requestBody, responses = {}) => ({ tags: ['Extended API'], security: auth, summary, parameters, ...(requestBody ? { requestBody } : {}), responses: { 200: success(), 201: success('생성 성공'), 401: error, 403: error, 404: error, 409: error, 422: error, 503: error, ...responses } });

module.exports = {
  schemas: {
    ExtendedSuccess: { type: 'object', required: ['success', 'data'], properties: { success: { type: 'boolean', example: true }, data: { type: 'object', additionalProperties: true } } },
  },
  paths: {
    '/api/v1/topics/tree': { get: secure('공개 주제 트리') },
    '/api/v1/topics/{topicId}': { get: secure('주제 상세', [uuid('topicId')]) },
    '/api/v1/concepts/{conceptId}': { get: secure('개념 상세', [uuid('conceptId')]) },
    '/api/v1/stages/{stageId}/relearn': { post: secure('통과 Stage 재학습', [uuid('stageId')]) },
    '/api/v1/bosses/{bossId}': { get: secure('Boss Stage 상세', [uuid('bossId')]) },
    '/api/v1/bosses/{bossId}/attempts': { post: secure('Boss 응시 시작', [uuid('bossId')], body({ mode: { type: 'string', enum: ['START', 'RETRY'] } }, ['mode'])) },
    '/api/v1/boss-attempts/{attemptId}': { get: secure('Boss 응시 조회', [uuid('attemptId')], undefined, {
      200: { description: 'Boss 응시 상태와 현재 문항', content: { 'application/json': { schema: {
        type: 'object', required: ['success', 'data'], properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/NormalStageAttempt' } },
      } } } },
    }) },
    '/api/v1/boss-attempts/{attemptId}/answers': { post: secure('Boss 답안 제출', [uuid('attemptId')], {
      required: true,
      content: { 'application/json': { schema: {
        type: 'object', required: ['questionId', 'choiceId', 'submissionId'], additionalProperties: false,
        properties: {
          questionId: { type: 'string', format: 'uuid' },
          choiceId: { type: 'string', format: 'uuid' },
          submissionId: { type: 'string', format: 'uuid', description: '앱이 생성하는 제출 멱등성 식별자' },
        },
      } } },
    }, {
      201: { description: 'Boss 답안 채점 결과', content: { 'application/json': { schema: {
        type: 'object', required: ['success', 'data'], properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/NormalStageAnswer' } },
      } } } },
    }) },
    '/api/v1/attempts/{attemptId}/current-question': { get: secure('현재 문항', [uuid('attemptId')]) },
    '/api/v1/attempts/{attemptId}/answers': { post: secure('일반 Stage 답안 제출', [uuid('attemptId')], body({ questionId: { type: 'string', format: 'uuid' }, choiceId: { type: 'string', format: 'uuid' }, submissionId: { type: 'string', format: 'uuid' } })) },
    '/api/v1/attempts/{attemptId}': { get: secure('응시 결과 상세', [uuid('attemptId')]) },
    '/api/v1/reviews/due': { get: secure('복습 예정 임무', [query('date', { type: 'string', format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })]) },
    '/api/v1/reviews/items': { get: secure('복습 문항 목록', [query('source', { type: 'string', enum: ['BOOKMARK', 'WRONG'] }), query('conceptId', { type: 'string', format: 'uuid' }), query('topicId', { type: 'string', format: 'uuid' }), query('page', { type: 'integer', minimum: 1 }), query('size', { type: 'integer', minimum: 1, maximum: 100 }), query('limit', { type: 'integer', minimum: 1, maximum: 100 })]) },
    '/api/v1/reviews/missions/{missionId}': { get: secure('복습 임무 상세', [uuid('missionId')]) },
    '/api/v1/reviews/missions/{missionId}/attempts': { post: secure('복습 임무 응시 시작', [uuid('missionId')]) },
    '/api/v1/review-attempts/{reviewAttemptId}': { get: secure('복습 응시 상세', [uuid('reviewAttemptId')]) },
    '/api/v1/review-attempts/{reviewAttemptId}/answers': { post: secure('복습 답안 제출', [uuid('reviewAttemptId')], body({ questionId: { type: 'string', format: 'uuid' }, choiceId: { type: 'string', format: 'uuid' }, submissionId: { type: 'string', format: 'uuid' } })) },
    '/api/v1/questions/{questionId}/bookmark': { put: secure('문항 북마크 등록', [uuid('questionId')]), delete: secure('문항 북마크 해제', [uuid('questionId')]) },
    '/api/v1/statistics/overall': { get: secure('전체 학습 통계', [query('from', { type: 'string', format: 'date' }), query('to', { type: 'string', format: 'date' })]) },
    '/api/v1/statistics/concepts': { get: secure('개념별 학습 통계', [query('sort', { type: 'string', enum: ['title', 'accuracy', 'attempts'] }), query('limit', { type: 'integer', minimum: 1, maximum: 100 }), query('topicId', { type: 'string', format: 'uuid' })]) },
    '/api/v1/home/summary': { get: secure('홈 요약') },
    '/api/v1/mypage/summary': { get: secure('마이페이지 요약') },
    '/api/v1/growth/me': { get: secure('성장 정보') },
    '/api/v1/users/me/reward-ledger': { get: secure('보상 원장', [query('page'), query('size')]) },
    '/api/v1/users/me/character/class': { put: secure('직업 최초 선택', [], body({ classId: { type: 'string', format: 'uuid' } })), patch: secure('직업 변경', [], body({ classId: { type: 'string', format: 'uuid' } })) },
    '/api/v1/users/me/notification-settings': { get: secure('알림 설정 조회'), patch: secure('알림 설정 변경', [], body({ reminderEnabled: { type: 'boolean' }, reminderTime: { type: 'string', nullable: true, pattern: '^([01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?$' }, timezone: { type: 'string', minLength: 1, maxLength: 50 } }, ['reminderEnabled'])) },
    '/api/v1/users/me': { patch: secure('사용자 프로필 변경', [], body({ nickname: { type: 'string', minLength: 1, maxLength: 30 } })) },
    '/api/v1/learning/progress/active': { get: secure('활성 학습 진행') },
    '/api/v1/learning/progress/{stageId}': { put: secure('학습 진행 위치 저장', [uuid('stageId')], body({ contentPosition: { type: 'integer', minimum: 1 } })) },
    '/api/v1/learning/history/{historyId}': { get: secure('학습 이력 상세', [uuid('historyId')]) },
    '/api/v1/inventory': { get: secure('인벤토리 조회') },
    '/api/v1/inventory/{itemId}/equip': { put: secure('코스튬 장착', [uuid('itemId')]) },
    '/api/v1/shop/costumes': { get: secure('코스튬 상점', [query('category', { type: 'string', enum: ['TOP', 'BOTTOM'] }), query('page', { type: 'integer', minimum: 1 }), query('size', { type: 'integer', minimum: 1, maximum: 100 }), query('limit', { type: 'integer', minimum: 1, maximum: 100 })]) },
    '/api/v1/shop/costumes/{itemId}': { get: secure('코스튬 상세', [uuid('itemId')]) },
    '/api/v1/shop/purchases': { post: secure('코스튬 구매', [], body({ itemId: { type: 'string', format: 'uuid' }, requestId: { type: 'string', minLength: 1, maxLength: 100 } })) },
    '/api/v1/study-plans': { post: secure('학습 일정 생성', [], body({ scheduledDate: { type: 'string', format: 'date' }, stageId: { type: 'string', format: 'uuid' }, conceptId: { type: 'string', format: 'uuid' }, title: { type: 'string' } }, ['scheduledDate', 'title'])) },
    '/api/v1/study-plans/{planId}': { patch: secure('학습 일정 변경', [uuid('planId')]), delete: secure('학습 일정 삭제', [uuid('planId')]) },
    '/api/v1/auth/password-reset/request': { post: { tags: ['Auth'], summary: '비밀번호 재설정 요청', requestBody: body({ email: { type: 'string', format: 'email' } }), responses: { 200: { description: '접수됨' }, 422: error } } },
    '/api/v1/auth/password-reset/confirm': { post: { tags: ['Auth'], summary: '비밀번호 재설정 확정', requestBody: body({ resetToken: { type: 'string', minLength: 1, maxLength: 4096 }, newPassword: { type: 'string', format: 'password', minLength: 8, maxLength: 128 } }), responses: { 200: { description: '변경됨' }, 401: error, 422: error } } },
    '/api/v1/auth/refresh': { post: { tags: ['Auth'], summary: 'Cookie 또는 Body Refresh Token 재발급', parameters: [{ name: 'refreshToken', in: 'cookie', schema: { type: 'string' } }], responses: { 200: { description: '재발급 성공' }, 401: error } } },
    '/api/v1/auth/logout': { post: { tags: ['Auth'], summary: 'Cookie 또는 Bearer 로그아웃', security: auth, parameters: [{ name: 'refreshToken', in: 'cookie', schema: { type: 'string' } }], responses: { 200: { description: '로그아웃 성공' }, 401: error } } },
  },
};
