const bearer = [{ bearerAuth: [] }];
const error = { description: '오류 응답', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const uuid = { type: 'string', format: 'uuid' };
const count = { type: 'integer', minimum: 0 };

const question = {
  type: 'object', required: ['id', 'title', 'choices'],
  description: '제출 전 응답에는 정답과 해설을 포함하지 않습니다.',
  properties: {
    id: uuid, title: { type: 'string' }, difficulty: { type: 'string', nullable: true }, conceptId: uuid,
    choices: { type: 'array', items: { type: 'object', required: ['id', 'label', 'content'], properties: {
      id: uuid, label: { type: 'string' }, content: { type: 'string' },
    } } },
  },
};
const attempt = {
  type: 'object', required: ['attemptId', 'stageId', 'status', 'mode', 'attemptNo', 'maxQuestionCount', 'submittedCount', 'correctCount', 'hp', 'currentQuestion'],
  properties: {
    attemptId: uuid, stageId: uuid,
    status: { type: 'string', enum: ['IN_PROGRESS', 'PASSED', 'FAILED'] },
    mode: { type: 'string', enum: ['START', 'RETRY'] },
    attemptNo: count, maxQuestionCount: count, submittedCount: count, correctCount: count, hp: count,
    endReason: { type: 'string', nullable: true, enum: ['MONSTER_DEFEATED', 'QUESTIONS_EXHAUSTED', null] },
    endedAt: { type: 'string', format: 'date-time', nullable: true }, rewardGranted: { type: 'boolean' },
    currentQuestion: { ...question, nullable: true },
    resumed: { type: 'boolean', description: '응시 시작 응답에서만 제공' },
  },
};
const result = {
  type: 'object', required: ['attemptId', 'stageId', 'status', 'submittedCount', 'correctCount', 'hp', 'endReason', 'endedAt', 'rewardGranted'],
  properties: { ...attempt.properties },
};
const answerRequest = {
  type: 'object', required: ['questionId', 'choiceId', 'submissionId'], additionalProperties: false,
  properties: { questionId: uuid, choiceId: uuid, submissionId: uuid },
};
const answer = {
  type: 'object', required: ['attemptId', 'quizId', 'choiceId', 'isCorrect', 'score', 'explanation',
    'hpBefore', 'hpAfter', 'submittedCount', 'correctCount', 'status', 'endReason', 'rewardGranted'],
  properties: {
    attemptId: uuid, quizId: uuid, choiceId: uuid, isCorrect: { type: 'boolean' }, score: { type: 'integer' },
    explanation: { type: 'string', nullable: true }, hpBefore: count, hpAfter: count,
    submittedCount: count, correctCount: count,
    status: { type: 'string', enum: ['IN_PROGRESS', 'PASSED', 'FAILED'] },
    endReason: { type: 'string', nullable: true, enum: ['MONSTER_DEFEATED', 'QUESTIONS_EXHAUSTED', null] },
    rewardGranted: { type: 'boolean' }, duplicate: { type: 'boolean' },
    nextQuestion: { ...question, nullable: true },
  },
};
const attemptDetails = {
  ...result,
  required: [...result.required, 'passed', 'answers', 'wrongQuestionIds', 'passHistory', 'reward'],
  properties: {
    ...result.properties,
    passed: { type: 'boolean' },
    answers: { type: 'array', items: { type: 'object' } },
    wrongQuestionIds: { type: 'array', items: uuid },
    passHistory: { type: 'object', required: ['firstPassedAt', 'firstPassAttemptId', 'isFirstPass'], properties: {
      firstPassedAt: { type: 'string', format: 'date-time', nullable: true },
      firstPassAttemptId: { ...uuid, nullable: true }, isFirstPass: { type: 'boolean' },
    } },
    reward: { type: 'object', required: ['granted'], properties: { granted: { type: 'boolean' } } },
  },
};
delete result.properties.currentQuestion;
delete result.properties.resumed;
const response = schema => ({
  description: '성공', content: { 'application/json': { schema: { type: 'object', required: ['success', 'data'], properties: {
    success: { type: 'boolean', example: true }, data: schema,
  } } } },
});
const attemptId = { name: 'attemptId', in: 'path', required: true, schema: uuid };
const sampleQuestion = {
  id: '123e4567-e89b-42d3-a456-426614174001', title: '기회비용은 무엇인가요?',
  difficulty: 'BEGINNER', conceptId: '123e4567-e89b-42d3-a456-426614174010',
  choices: [
    { id: '123e4567-e89b-42d3-a456-426614174011', label: 'A', content: '선택지 A' },
    { id: '123e4567-e89b-42d3-a456-426614174012', label: 'B', content: '선택지 B' },
    { id: '123e4567-e89b-42d3-a456-426614174013', label: 'C', content: '선택지 C' },
    { id: '123e4567-e89b-42d3-a456-426614174014', label: 'D', content: '선택지 D' },
  ],
};
const sampleAttempt = {
  attemptId: '123e4567-e89b-42d3-a456-426614174020',
  stageId: '123e4567-e89b-42d3-a456-426614174030', status: 'IN_PROGRESS',
  mode: 'START', attemptNo: 1, maxQuestionCount: 3, submittedCount: 0,
  correctCount: 0, hp: 2, endReason: null, endedAt: null,
  rewardGranted: false, currentQuestion: sampleQuestion,
};

module.exports = {
  schemas: {
    NormalStageQuestion: question,
    NormalStageAttempt: attempt,
    NormalStageResult: result,
    NormalStageAnswerRequest: answerRequest,
    NormalStageAnswer: answer,
    NormalStageAttemptDetails: attemptDetails,
  },
  paths: {
    '/api/v1/stages/{stageId}/attempts': { post: {
      tags: ['Quizzes'], security: bearer, summary: '일반 Stage 응시 시작 또는 재도전',
      description: 'mode는 처음 시작 START 또는 이전 응시의 재도전 RETRY입니다. 진행 중 응시는 기존 응시를 재개합니다. 일반 Stage는 3문항·HP 2·정답 2개 즉시 통과 규칙을 사용합니다.',
      parameters: [{ name: 'stageId', in: 'path', required: true, schema: uuid }],
      requestBody: { required: true, content: { 'application/json': { schema: {
        type: 'object', required: ['mode'], additionalProperties: false,
        properties: { mode: { type: 'string', enum: ['START', 'RETRY'] } },
      } } } },
      responses: { 200: response({ $ref: '#/components/schemas/NormalStageAttempt' }), 201: response({ $ref: '#/components/schemas/NormalStageAttempt' }),
        401: error, 403: error, 404: error, 409: error, 422: error, 503: error },
    } },
    '/api/v1/attempts/{attemptId}/current-question': { get: {
      tags: ['Quizzes'], security: bearer, summary: '현재 일반 Stage 문항 조회',
      description: '본인 응시의 현재 문항과 HP/카운터를 반환합니다. 정답과 해설은 반환하지 않습니다.',
      parameters: [attemptId], responses: { 200: response({ $ref: '#/components/schemas/NormalStageAttempt' }), 401: error, 404: error, 422: error, 503: error },
    } },
    '/api/v1/attempts/{attemptId}/answers': { post: {
      tags: ['Quizzes'], security: bearer, summary: '일반 Stage 답안 제출·서버 채점',
      description: 'submissionId는 앱이 생성하는 UUID입니다. 같은 submissionId의 동일 요청은 duplicate=true로 원래 결과를 반환하며, 다른 답안에 재사용하면 409입니다.',
      parameters: [attemptId],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NormalStageAnswerRequest' } } } },
      responses: { 201: response({ $ref: '#/components/schemas/NormalStageAnswer' }), 401: error, 404: error, 409: error, 422: error, 503: error },
    } },
    '/api/v1/attempts/{attemptId}': { get: {
      tags: ['Quizzes'], security: bearer, summary: '일반 Stage 응시 결과·답안 이력 조회',
      description: '본인 응시의 PASS/FAIL, 종료 원인, 답안, 오답 문항 ID, 최초 통과·보상 이력을 반환합니다.',
      parameters: [attemptId], responses: { 200: response({ $ref: '#/components/schemas/NormalStageAttemptDetails' }), 401: error, 404: error, 422: error, 503: error },
    } },
    '/api/v1/quizzes/stages/{stageId}/attempts': { post: {
      tags: ['Quizzes'], security: bearer, summary: '일반 Stage 응시 시작 또는 진행 중 응시 재개',
      description: '공개된 일반 Stage, 잠금 상태, 공개 문항 3개와 선택지를 확인합니다. 진행 중 응시가 있으면 새로 만들지 않고 200으로 재개합니다. 처음 시작하면 201입니다.',
      parameters: [{ name: 'stageId', in: 'path', required: true, schema: uuid }],
      responses: { 200: response({ $ref: '#/components/schemas/NormalStageAttempt' }), 201: response({ $ref: '#/components/schemas/NormalStageAttempt' }),
        401: error, 403: error, 404: error, 409: error, 422: error, 503: error },
    } },
    '/api/v1/quizzes/attempts/{attemptId}': { get: {
      tags: ['Quizzes'], security: bearer, summary: '내 응시 상태와 현재 문항 조회',
      description: '진행 중이면 Stage에 저장된 순서의 다음 문항을 반환합니다. 완료 후 currentQuestion은 null입니다. 정답과 해설은 제출 전 반환하지 않습니다.',
      parameters: [attemptId], responses: { 200: response({ $ref: '#/components/schemas/NormalStageAttempt' }), 401: error, 404: error, 422: error, 503: error },
    } },
    '/api/v1/quizzes/attempts/{attemptId}/result': { get: {
      tags: ['Quizzes'], security: bearer, summary: '완료된 일반 Stage 응시 결과',
      description: 'PASSED 또는 FAILED 상태에서만 결과를 제공합니다. 진행 중이면 409입니다.',
      parameters: [attemptId], responses: { 200: response({ $ref: '#/components/schemas/NormalStageResult' }), 401: error, 404: error, 409: error, 422: error },
    } },
  },
};

const start = module.exports.paths['/api/v1/quizzes/stages/{stageId}/attempts'].post.responses;
start[201].content['application/json'].examples = { started: { value: { success: true, data: { ...sampleAttempt, resumed: false } } } };
start[200].content['application/json'].examples = { resumed: { value: { success: true, data: { ...sampleAttempt, resumed: true } } } };
module.exports.paths['/api/v1/quizzes/attempts/{attemptId}'].get.responses[200].content['application/json'].examples = {
  inProgress: { value: { success: true, data: sampleAttempt } },
  finished: { value: { success: true, data: { ...sampleAttempt, status: 'PASSED', submittedCount: 2,
    correctCount: 2, hp: 0, endReason: 'MONSTER_DEFEATED', endedAt: '2026-11-08T12:00:00.000Z',
    rewardGranted: true, currentQuestion: null } } },
};
module.exports.paths['/api/v1/quizzes/attempts/{attemptId}/result'].get.responses[200].content['application/json'].example = {
  success: true, data: { attemptId: sampleAttempt.attemptId, stageId: sampleAttempt.stageId,
    status: 'PASSED', mode: 'START', attemptNo: 1, maxQuestionCount: 3, submittedCount: 2,
    correctCount: 2, hp: 0, endReason: 'MONSTER_DEFEATED', endedAt: '2026-11-08T12:00:00.000Z',
    rewardGranted: true },
};
