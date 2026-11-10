const uuid = { type: 'string', format: 'uuid' };
const timestamp = { type: 'string', format: 'date-time', nullable: true };
const integer = { type: 'integer' };
const nullableText = { type: 'string', nullable: true };
const topic = { type: 'object', nullable: true, required: ['topicId', 'title'], properties: { topicId: uuid, title: { type: 'string' } } };
const concept = { type: 'object', nullable: true, required: ['conceptId', 'conceptCode', 'version', 'title'], properties: {
  conceptId: uuid, conceptCode: { type: 'string' }, version: integer, title: { type: 'string' },
} };
const summaryFields = {
  recordType: { type: 'string', enum: ['LEARNING'] }, recordId: uuid,
  attemptNo: integer, attemptType: { type: 'string', enum: ['PLAY', 'RELEARN'] }, mode: { type: 'string', enum: ['START', 'RETRY'] },
  status: { type: 'string', enum: ['IN_PROGRESS', 'PASSED', 'FAILED', 'ABANDONED'] },
  endReason: { type: 'string', nullable: true, enum: ['MONSTER_DEFEATED', 'QUESTIONS_EXHAUSTED', 'ABANDONED', null] },
  isFinished: { type: 'boolean', description: '저장된 상태가 PASSED/FAILED/ABANDONED이면 true. 성공 통과 여부는 status=PASSED로 구분' },
  learningDate: { type: 'string', format: 'date', nullable: true, description: 'startedAt을 Asia/Seoul 날짜로 변환. 완료 날짜가 아님' },
  timeZone: { type: 'string', enum: ['Asia/Seoul'] },
  startedAt: timestamp, endedAt: timestamp,
  completedAt: { ...timestamp, description: 'PASSED 상태일 때 저장된 endedAt. 시각이 없으면 null이며 새로 생성하지 않음' },
  elapsedSeconds: { type: 'number', nullable: true, minimum: 0, description: '종료-시작 경과 초(소수 가능). 활동 시간이 아님. 시각 누락/잘못된 순서는 null' },
  topic,
  stage: { type: 'object', nullable: true, required: ['stageId', 'stageCode', 'title', 'stageType'], properties: {
    stageId: uuid, stageCode: { type: 'string' }, title: { type: 'string' }, stageType: { type: 'string', enum: ['NORMAL', 'BOSS'] },
  } },
  submittedCount: { ...integer, minimum: 0, description: '실제 QuestionSubmission 행 수. LearningAttempt 집계값을 대체 기록하지 않음' },
  correctCount: { ...integer, minimum: 0, description: '실제 제출 행 중 isCorrect=true의 수' },
  accuracyPercentage: { type: 'number', nullable: true, minimum: 0, maximum: 100, description: '정답/실제 제출 수×100, 소수 첫째 자리 반올림. 제출 0개는 null', example: 66.7 },
};
const response = name => ({ content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } } });
const error = description => ({ description, ...response('Error') });
const commonErrors = { 401: error('JWT 없음/유효하지 않은 인증 세션'), 422: error('조회 조건 또는 경로 형식 오류'), 503: error('DB 연결/쿼리 실패') };
const listExamples = {
  populated: { summary: '데이터가 있는 경우', value: { success: true, data: {
    items: [{ recordType: 'LEARNING', recordId: '11111111-1111-4111-8111-111111111111',
      attemptNo: 1, attemptType: 'PLAY', mode: 'START', status: 'PASSED', endReason: 'MONSTER_DEFEATED',
      isFinished: true, learningDate: '2026-11-02', timeZone: 'Asia/Seoul',
      startedAt: '2026-11-01T15:00:00.000Z', endedAt: '2026-11-01T15:02:00.000Z',
      completedAt: '2026-11-01T15:02:00.000Z', elapsedSeconds: 120,
      topic: { topicId: '22222222-2222-4222-8222-222222222222', title: '경제' },
      stage: { stageId: '33333333-3333-4333-8333-333333333333', stageCode: '1-1', title: '금리', stageType: 'NORMAL' },
      submittedCount: 1, correctCount: 1, accuracyPercentage: 100 }],
    page: 1, pageSize: 20, total: 1, totalPages: 1,
  } } },
  empty: { summary: '데이터가 없는 경우', value: { success: true, data: {
    items: [], page: 1, pageSize: 20, total: 0, totalPages: 0,
    emptyMessage: '아직 학습 기록이 없습니다.',
  } } },
};

module.exports = {
  schemas: {
    LearningHistorySummary: { type: 'object', required: Object.keys(summaryFields), properties: summaryFields },
    LearningHistorySubmission: { type: 'object', required: ['submissionId', 'sequenceNo', 'questionId', 'question', 'selectedAnswer', 'isCorrect', 'explanation', 'displayedChoiceOrder', 'submittedAt', 'responseTimeMs'], properties: {
      submissionId: uuid, sequenceNo: integer, questionId: uuid,
      question: { type: 'object', nullable: true, required: ['questionId', 'questionCode', 'version', 'questionText', 'concept'], properties: {
        questionId: uuid, questionCode: { type: 'string' }, version: integer, questionText: nullableText, concept,
      } },
      selectedAnswer: { type: 'object', required: ['choiceId', 'choiceText', 'selectedPosition'], properties: {
        choiceId: uuid, choiceText: nullableText, selectedPosition: { type: 'integer', minimum: 1, maximum: 4 },
      } },
      isCorrect: { type: 'boolean', description: '제출 당시 저장된 값. 현재 선택지 정답 플래그로 다시 채점하지 않음' },
      explanation: { ...nullableText, description: '해당 submission.questionId 버전의 저장된 해설. 없으면 null' },
      displayedChoiceOrder: { type: 'array', nullable: true, items: uuid, description: '저장된 순서 원문. 빈 배열이면 과거 화면 순서를 추측해 채우지 않음' },
      submittedAt: timestamp, responseTimeMs: { type: 'integer', nullable: true },
    } },
    LearningHistoryDetail: { allOf: [{ $ref: '#/components/schemas/LearningHistorySummary' }, {
      type: 'object', required: ['submissions'], properties: { submissions: { type: 'array', items: { $ref: '#/components/schemas/LearningHistorySubmission' } } },
    }] },
    LearningHistoryListResponse: { type: 'object', required: ['success', 'data'], properties: {
      success: { type: 'boolean', example: true },
      data: { type: 'object', required: ['items', 'page', 'pageSize', 'total', 'totalPages'], properties: {
        items: { type: 'array', items: { $ref: '#/components/schemas/LearningHistorySummary' } },
        page: integer, pageSize: integer, total: integer, totalPages: integer,
        emptyMessage: { type: 'string', description: '조회 조건에 해당하는 전체 이력이 없을 때(total=0)만 반환. 페이지 범위 초과로 items만 비면 생략' },
      } },
    } },
    LearningHistoryDetailResponse: { type: 'object', required: ['success', 'data'], properties: {
      success: { type: 'boolean', example: true }, data: { $ref: '#/components/schemas/LearningHistoryDetail' },
    } },
  },
  paths: {
    '/api/v1/learning/history': { get: {
      tags: ['Learning History'], security: [{ bearerAuth: [] }], summary: '내 학습 이력 목록',
      description: 'LearningAttempt의 일반/BOSS/재학습 시도를 조회합니다. 복습 ReviewAttempt는 통합하지 않습니다. 기본은 모든 상태이며 startedAt 내림차순, 동률이면 attemptId 내림차순입니다. 빈 목록은 200, totalPages=0입니다. 사용자 조건은 JWT에서만 받으며 알 수 없는 query는 422입니다.',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 2147483647, default: 1 } },
        { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        { name: 'status', in: 'query', schema: summaryFields.status },
      ],
      responses: { 200: { description: '본인 이력 목록', content: { 'application/json': {
        schema: { $ref: '#/components/schemas/LearningHistoryListResponse' }, examples: listExamples,
      } } }, ...commonErrors },
    } },
    '/api/v1/learning/history/{recordType}/{recordId}': { get: {
      tags: ['Learning History'], security: [{ bearerAuth: [] }], summary: '내 학습 이력 상세',
      description: 'recordType은 현재 LEARNING만 지원합니다. 부모 응시의 소유권 확인 후 실제 제출만 sequenceNo/submissionId 오름차순으로 반환합니다. 제출이 참조한 과거 Question·Concept·Choice ID를 사용하며 최신 버전으로 바꾸거나 미제출 문항의 정답을 반환하지 않습니다.',
      parameters: [
        { name: 'recordType', in: 'path', required: true, schema: { type: 'string', enum: ['LEARNING'] } },
        { name: 'recordId', in: 'path', required: true, schema: uuid },
      ],
      responses: { 200: { description: '응시 요약과 실제 답안', ...response('LearningHistoryDetailResponse') },
        ...commonErrors, 404: error('존재하지 않거나 타인 소유인 이력을 동일하게 처리') },
    } },
  },
};
