const auth = [{ bearerAuth: [] }];
const error = { description: '오류 응답', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const uuid = name => ({ name, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });
const query = (name, schema = { type: 'string' }) => ({ name, in: 'query', schema });
const body = (properties, required = Object.keys(properties)) => ({ required: true, content: { 'application/json': { schema: { type: 'object', required, additionalProperties: false, properties } } } });
// /study-plans 요청: /calendar/plans와 같은 규칙이고 목표 필드 이름만 title (goal과 함께 보내면 422)
const studyPlanBody = required => ({ required: true, content: { 'application/json': { schema: {
  type: 'object', additionalProperties: false, required, ...(required.length ? {} : { minProperties: 1 }),
  properties: {
    scheduledDate: { type: 'string', format: 'date' },
    title: { type: 'string', minLength: 1, maxLength: 30, description: '일정 목표 (StudyPlan.title). /calendar/plans의 goal과 같음' },
    stageId: { type: 'string', format: 'uuid', nullable: true },
    conceptId: { type: 'string', format: 'uuid', nullable: true },
    topicId: { type: 'string', format: 'uuid', description: '선택. 보내면 Stage/Concept의 주제와 일치해야 함' },
    planType: { type: 'string', enum: ['NEW_LEARNING', 'REVIEW'], default: 'NEW_LEARNING' },
  },
  description: required.length ? 'Stage 또는 Concept 중 하나 이상 필요' : '보내지 않은 필드는 유지. 최종적으로 Stage 또는 Concept 하나 이상 남아야 함',
} } } });
const success = (description = '성공') => ({ description, content: { 'application/json': { schema: { $ref: '#/components/schemas/ExtendedSuccess' } } } });
const secure = (summary, parameters = [], requestBody, responses = {}) => ({ tags: ['Extended API'], security: auth, summary, parameters, ...(requestBody ? { requestBody } : {}), responses: { 200: success(), 201: success('생성 성공'), 401: error, 403: error, 404: error, 409: error, 422: error, 503: error, ...responses } });

const bossCombatProperties = {
  consecutiveCorrectCount: { type: 'integer', minimum: 0 },
  criticalUsed: { type: 'boolean' },
  defeatedAtQuestion: { type: 'integer', minimum: 1, maximum: 7, nullable: true },
  bonusQuestionCount: { type: 'integer', minimum: 0, description: '격파한 문항 뒤에 남았던 보너스 대상 문항 수' },
  bonusCorrectCount: { type: 'integer', minimum: 0 },
};
const bossCombatSchema = properties => ({ type: 'object', required: Object.keys(properties), properties });
const bossResponse = (description, schema) => ({ description, content: { 'application/json': { schema: {
  type: 'object', required: ['success', 'data'], properties: { success: { type: 'boolean' }, data: { $ref: `#/components/schemas/${schema}` } },
} } } });

const classCodeField = { type: 'string', enum: ['WARRIOR', 'MAGE', 'ARCHER'], description: '직업 코드 (GET /api/v1/character-classes의 classCode)' };
const notificationSettingsResponse = { description: '알림 설정', content: { 'application/json': { schema: { type: 'object', required: ['success', 'data'], properties: {
  success: { type: 'boolean' },
  data: { type: 'object', required: ['reminderEnabled', 'reminderTime', 'timezone', 'updatedAt'], properties: {
    reminderEnabled: { type: 'boolean' },
    reminderTime: { type: 'string', nullable: true, example: '20:00:00' },
    timezone: { type: 'string', example: 'Asia/Seoul' },
    updatedAt: { type: 'string', format: 'date-time', nullable: true },
  } },
} } } } };
// 실제로 나오는 응답 코드만 남긴다 (secure()는 공통 코드를 모두 붙이므로)
const only = (operation, codes) => ({ ...operation, responses: Object.fromEntries(Object.entries(operation.responses).filter(([code]) => codes.includes(Number(code)))) });

module.exports = {
  schemas: {
    ConceptStatisticsResponse: {
      type: 'object', required: ['success', 'data'], properties: {
        success: { type: 'boolean', example: true },
        data: { type: 'object', required: ['items', 'sort'], properties: {
          items: { type: 'array', items: { type: 'object', required: ['conceptId', 'title', 'attempts', 'correct', 'accuracy'], properties: {
            conceptId: { type: 'string', format: 'uuid' }, title: { type: 'string' },
            attempts: { type: 'integer', minimum: 0, description: '실제 제출 문항 수. 0이면 미응시' },
            correct: { type: 'integer', minimum: 0 },
            accuracy: { type: 'number', minimum: 0, maximum: 1, description: '정답/제출 수. 미응시의 숫자 0은 호환용 값' },
          } } },
          sort: { type: 'string', enum: ['title', 'accuracy', 'attempts'] },
        } },
      },
    },
    ExtendedSuccess: { type: 'object', required: ['success', 'data'], properties: { success: { type: 'boolean', example: true }, data: { type: 'object', additionalProperties: true } } },
    BossAttempt: { allOf: [{ $ref: '#/components/schemas/NormalStageAttempt' }, { type: 'object', properties: {
      bossCombat: bossCombatSchema(bossCombatProperties),
    } }] },
    BossAnswer: { allOf: [{ $ref: '#/components/schemas/NormalStageAnswer' }, { type: 'object', properties: {
      bossCombat: bossCombatSchema({ ...bossCombatProperties, isBonusQuestion: { type: 'boolean' }, criticalTriggered: { type: 'boolean' } }),
    } }] },
  },
  paths: {
    '/api/v1/topics/tree': { get: secure('공개 주제 트리') },
    '/api/v1/topics/{topicId}': { get: secure('주제 상세', [uuid('topicId')]) },
    '/api/v1/concepts/{conceptId}': { get: secure('개념 상세', [uuid('conceptId')]) },
    '/api/v1/stages/{stageId}/relearn': { post: secure('통과 Stage 재학습', [uuid('stageId')]) },
    '/api/v1/bosses/{bossId}': { get: { ...secure('Boss Stage 상세', [uuid('bossId')]),
      description: '신규 응시는 7문항과 HP 6으로 시작합니다. requiredCorrectCount는 크리티컬을 포함해 격파하는 데 필요한 최소 정답 수(5)이며 최종 결과는 7번째 제출 후 확정합니다. 이전 응시는 저장된 구성을 유지합니다.',
    } },
    '/api/v1/bosses/{bossId}/attempts': { post: { ...secure('Boss 응시 시작', [uuid('bossId')], body({ mode: { type: 'string', enum: ['START', 'RETRY'] } }, ['mode']), {
      200: bossResponse('진행 중 응시 복구', 'BossAttempt'), 201: bossResponse('랜덤 7문항을 저장한 신규 응시', 'BossAttempt'),
      503: { ...error, description: '적격 공개 문항 부족 또는 Boss 설정/서비스 사용 불가. 새 응시는 저장되지 않습니다.' },
    }), description: '동일 주제의 공개 문항 중 일반 Stage에 배정된 문항을 제외하고 7개를 선정합니다. 진행 중 응시는 기존 구성과 답안을 유지합니다. bossCombat 필드는 새 전투 규칙으로 시작한 응시에 제공됩니다.',
    } },
    '/api/v1/boss-attempts/{attemptId}': { get: only(secure('Boss 응시 조회', [uuid('attemptId')], undefined, {
      200: bossResponse('Boss 응시 상태와 현재 문항', 'BossAttempt'),
    }), [200, 401, 404, 422, 503]) },
    '/api/v1/boss-attempts/{attemptId}/answers': { post: only(secure('Boss 답안 제출', [uuid('attemptId')], {
      required: true,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/NormalStageAnswerRequest' } } },
    }, {
      201: bossResponse('Boss 답안 채점 결과. 새 규칙에서는 HP가 0이어도 7번째 제출까지 진행합니다. 같은 답안 재전송에는 원래 채점 결과와 duplicate가 반환됩니다.', 'BossAnswer'),
    }), [201, 401, 404, 409, 422, 503]) },
    '/api/v1/attempts/{attemptId}/current-question': { get: secure('현재 문항', [uuid('attemptId')]) },
    '/api/v1/attempts/{attemptId}/answers': { post: secure('일반 Stage 답안 제출', [uuid('attemptId')], body({ questionId: { type: 'string', format: 'uuid' }, choiceId: { type: 'string', format: 'uuid' }, submissionId: { type: 'string', format: 'uuid' } })) },
    '/api/v1/attempts/{attemptId}': { get: secure('응시 결과 상세', [uuid('attemptId')]) },
    '/api/v1/reviews/due': { get: secure('복습 예정 임무', [query('date', { type: 'string', format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })]) },
    '/api/v1/reviews/items': { get: {
      ...secure('복습 문항 목록', [query('source', { type: 'string', enum: ['BOOKMARK', 'WRONG'] }), query('conceptId', { type: 'string', format: 'uuid' }), query('topicId', { type: 'string', format: 'uuid' }), query('page', { type: 'integer', minimum: 1 }), query('size', { type: 'integer', minimum: 1, maximum: 100 }), query('limit', { type: 'integer', minimum: 1, maximum: 100 })]),
      description: '본인의 PUBLISHED 문항만 조회합니다. WRONG에는 일반 Stage와 Boss에서 실제 제출한 오답이 자동으로 반영됩니다. 북마크와 오답 이력은 같은 항목에 함께 존재할 수 있습니다.',
    } },
    '/api/v1/reviews/missions/{missionId}': { get: secure('복습 임무 상세', [uuid('missionId')]) },
    '/api/v1/reviews/missions/{missionId}/attempts': { post: { ...secure('복습 임무 응시 시작', [uuid('missionId')]),
      description: 'PUBLISHED 문항으로만 복습 응시를 생성합니다. 복습할 공개 문항이 없으면 409입니다.',
    } },
    '/api/v1/review-attempts/{reviewAttemptId}': { get: { ...secure('복습 응시 상세', [uuid('reviewAttemptId')]),
      description: '이 응시에 공개가 철회된 문항이 있으면 404입니다.',
    } },
    '/api/v1/review-attempts/{reviewAttemptId}/answers': { post: { ...secure('복습 답안 제출', [uuid('reviewAttemptId')], body({ questionId: { type: 'string', format: 'uuid' }, choiceId: { type: 'string', format: 'uuid' }, submissionId: { type: 'string', format: 'uuid', description: '복습 응시 시작·조회 응답의 문항별 submissionId를 그대로 보냄 (앱이 새로 만들지 않음)' } })), description: '퀴즈 답안 제출과 달리 submissionId는 서버가 복습 시작 때 문항마다 미리 만든 값입니다. 같은 submissionId·같은 선택지 재요청은 duplicate=true로 처리합니다. 이 응시에 공개가 철회된 문항이 있으면 404입니다.' } },
    '/api/v1/questions/{questionId}/bookmark': {
      put: { ...secure('문항 북마크 등록', [uuid('questionId')]), description: 'PUBLISHED 문항만 북마크할 수 있습니다. 문항의 정오답과 관계없이 등록할 수 있습니다.' },
      delete: { ...secure('문항 북마크 해제', [uuid('questionId')]), description: '북마크 표시를 해제하며 오답 이력은 보존합니다.' },
    },
    '/api/v1/statistics/overall': { get: secure('전체 학습 통계', [query('from', { type: 'string', format: 'date' }), query('to', { type: 'string', format: 'date' })]) },
    '/api/v1/statistics/concepts': { get: {
      ...secure('개념별 학습 통계', [query('sort', { type: 'string', enum: ['title', 'accuracy', 'attempts'] }), query('limit', { type: 'integer', minimum: 1, maximum: 100 }), query('topicId', { type: 'string', format: 'uuid' })],
        undefined, { 200: { description: '본인 개념별 통계', content: { 'application/json': { schema: { $ref: '#/components/schemas/ConceptStatisticsResponse' } } } } }),
      description: 'attempts는 본인이 실제로 제출한 문항 수이고 correct는 정답 제출 수입니다. attempts가 0이면 미응시로 표시하세요(accuracy는 호환을 위해 숫자 0). attempts가 1 이상이고 accuracy가 0이면 실제 정답률 0%입니다. sort=accuracy에서는 미응시 개념을 응시한 개념 뒤에 둡니다.',
    } },
    '/api/v1/home/summary': { get: secure('홈 요약') },
    '/api/v1/mypage/summary': { get: secure('마이페이지 요약') },
    '/api/v1/growth/me': { get: secure('성장 정보') },
    '/api/v1/users/me/reward-ledger': { get: secure('보상 원장', [query('page'), query('size')]) },
    '/api/v1/users/me/character/class': {
      put: { ...only(secure('직업 최초 선택 (호환 경로)', [], body({ classCode: classCodeField })), [200, 401, 404, 409, 422, 503]), deprecated: true, description: '공식 경로는 PATCH /api/v1/users/me/character-class이며 동작과 응답이 같습니다.' },
      patch: { ...only(secure('직업 변경', [], body({ classCode: classCodeField })), [200, 401, 404, 409, 422, 503]), description: '직업을 처음 선택한 뒤에만 변경할 수 있습니다(아니면 409). 활성 직업만 선택할 수 있고(아니면 404), 같은 직업이면 변경 없이 현재 값을 반환합니다. 응답: userId, classId, classCode' },
    },
    '/api/v1/users/me/notification-settings': {
      get: only(secure('알림 설정 조회', [], undefined, { 200: notificationSettingsResponse }), [200, 401, 422, 503]),
      patch: { ...only(secure('알림 설정 변경', [], { required: true, content: { 'application/json': { schema: {
        type: 'object', additionalProperties: false, minProperties: 1,
        properties: {
          reminderEnabled: { type: 'boolean' },
          reminderTime: { type: 'string', nullable: true, pattern: '^([01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?$', description: 'HH:MM 또는 HH:MM:SS (사용자 시간대 기준). null이면 알림 시각 해제' },
          timezone: { type: 'string', minLength: 1, maxLength: 50, description: 'IANA 시간대 (예: Asia/Seoul)' },
        },
      } } } }, { 200: notificationSettingsResponse }), [200, 401, 422, 503]), description: '보낸 필드만 바꾸고 나머지는 유지합니다. 최소 1개 필드가 필요합니다.' },
    },
    '/api/v1/users/me': { patch: secure('사용자 프로필 변경', [], body({ nickname: { type: 'string', minLength: 1, maxLength: 30 } })) },
    '/api/v1/learning/progress/active': { get: secure('활성 학습 진행') },
    '/api/v1/learning/progress/{stageId}': { put: secure('학습 진행 위치 저장', [uuid('stageId')], body({ contentPosition: { type: 'integer', minimum: 1 } })) },
    '/api/v1/learning/history/{historyId}': { get: { ...only(secure('학습 이력 상세 (호환 경로)', [uuid('historyId')], undefined, { 200: { description: '응시 요약과 실제 답안', content: { 'application/json': { schema: { $ref: '#/components/schemas/LearningHistoryDetailResponse' } } } } }), [200, 401, 404, 422, 503]), deprecated: true, description: '앱은 /api/v1/learning/history/LEARNING/{recordId}를 사용합니다. 응답은 같습니다.' } },
    '/api/v1/inventory': { get: secure('인벤토리 조회') },
    '/api/v1/inventory/{itemId}/equip': { put: secure('코스튬 장착', [uuid('itemId')]) },
    '/api/v1/shop/costumes': { get: secure('코스튬 상점', [query('category', { type: 'string', enum: ['TOP', 'BOTTOM'] }), query('page', { type: 'integer', minimum: 1 }), query('size', { type: 'integer', minimum: 1, maximum: 100 }), query('limit', { type: 'integer', minimum: 1, maximum: 100 })]) },
    '/api/v1/shop/costumes/{itemId}': { get: secure('코스튬 상세', [uuid('itemId')]) },
    '/api/v1/shop/purchases': { post: secure('코스튬 구매', [], body({ itemId: { type: 'string', format: 'uuid' }, requestId: { type: 'string', minLength: 1, maxLength: 100 } })) },
    '/api/v1/study-plans': { post: { ...secure('학습 일정 생성 (호환 경로)', [], studyPlanBody(['scheduledDate', 'title'])), deprecated: true, description: '앱은 /api/v1/calendar/plans를 사용합니다. 이 경로는 목표를 title로 받아 같은 규칙으로 저장하며, 응답 필드는 goal입니다.' } },
    '/api/v1/study-plans/{planId}': {
      patch: { ...secure('학습 일정 변경 (호환 경로)', [uuid('planId')], studyPlanBody([])), deprecated: true, description: '앱은 /api/v1/calendar/plans/{planId}를 사용합니다. 보내지 않은 필드는 유지합니다.' },
      delete: { ...secure('학습 일정 삭제 (호환 경로)', [uuid('planId')]), deprecated: true },
    },
    '/api/v1/auth/password-reset/request': { post: { tags: ['Auth'], summary: '비밀번호 재설정 요청', requestBody: body({ email: { type: 'string', format: 'email' } }), responses: { 200: { description: '접수됨' }, 422: error } } },
    '/api/v1/auth/password-reset/confirm': { post: { tags: ['Auth'], summary: '비밀번호 재설정 확정', requestBody: body({ resetToken: { type: 'string', minLength: 1, maxLength: 4096 }, newPassword: { type: 'string', format: 'password', minLength: 8, maxLength: 128 } }), responses: { 200: { description: '변경됨' }, 401: error, 422: error } } },
    '/api/v1/auth/refresh': { post: { tags: ['Auth'], summary: 'Cookie 또는 Body Refresh Token 재발급', parameters: [{ name: 'refreshToken', in: 'cookie', schema: { type: 'string' } }], responses: { 200: { description: '재발급 성공' }, 401: error } } },
    '/api/v1/auth/logout': { post: { tags: ['Auth'], summary: 'Cookie 또는 Bearer 로그아웃', security: auth, parameters: [{ name: 'refreshToken', in: 'cookie', schema: { type: 'string' } }], responses: { 200: { description: '로그아웃 성공' }, 401: error } } },
  },
};
