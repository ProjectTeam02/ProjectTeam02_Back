/**
 * Swagger API 문서 설정
 * 백엔드 작업: 실제 API 경로·Schema·인증 정보를 관리
 * 주의: 문서와 실제 라우터의 Method를 일치시킨다.
 */
const errorResponse = {
  description: '오류 응답',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
};

const auth = [{ bearerAuth: [] }];

module.exports = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Leren Backend API',
      version: '1.0.0',
      description: 'Leren 1차 USECASE REST API. 실제 DB·FastAPI 상태는 health API로 확인합니다.',
    },
    servers: [{ url: 'http://localhost:3000' }],
    tags: [
      { name: 'Auth', description: '회원가입 및 토큰' },
      { name: 'Users', description: '마이페이지 및 알림' },
      { name: 'AI Tutor', description: 'Multi-turn AI Tutor' },
      { name: 'Quizzes', description: '문제 생성 및 채점' },
      { name: 'Notifications', description: '학습 알림 설정' },
      { name: 'Health', description: '서비스 연결 상태' },
    ],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        Error: { type: 'object', properties: { success: { type: 'boolean', example: false }, message: { type: 'string' }, code: { type: 'string' } } },
        SignupRequest: { type: 'object', required: ['email', 'password', 'nickname'], properties: { email: { type: 'string', format: 'email', example: 'learner@example.com' }, password: { type: 'string', format: 'password', minLength: 8, example: 'password123' }, nickname: { type: 'string', example: 'leren-user' } } },
        LoginRequest: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' } } },
        TokenResponse: { type: 'object', properties: { accessToken: { type: 'string' }, refreshToken: { type: 'string' }, user: { $ref: '#/components/schemas/User' } } },
        User: { type: 'object', properties: { userId: { type: 'string', format: 'uuid' }, nickname: { type: 'string' }, email: { type: 'string' }, level: { type: 'integer' }, totalExp: { type: 'integer' }, economyLevel: { type: 'integer' }, economyExp: { type: 'integer' }, plan: { type: 'string', example: 'FREE' } } },
        Conversation: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, entryPoint: { type: 'string', nullable: true }, status: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } } },
        TutorMessageRequest: { type: 'object', required: ['conversationId', 'question'], properties: { conversationId: { type: 'string', format: 'uuid' }, question: { type: 'string', minLength: 1 }, modelTier: { type: 'string', enum: ['BASIC', 'ADVANCED'] }, clientMessageId: { type: 'string' }, context: { type: 'object', nullable: true }, knowledgeScope: { type: 'object', nullable: true } } },
        Quiz: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, title: { type: 'string' }, explanation: { type: 'string' }, difficulty: { type: 'string' }, choices: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' }, content: { type: 'string' } } } } } },
      },
    },
    paths: {
      '/health': { get: { tags: ['Health'], summary: 'Node.js 프로세스 상태', responses: { 200: { description: 'UP' } } } },
      '/api/v1/health/ready': { get: { tags: ['Health'], summary: 'DB와 FastAPI 준비 상태', responses: { 200: { description: 'READY' }, 503: errorResponse } } },
      '/api/v1/health/dependencies': { get: { tags: ['Health'], summary: '의존성 연결 상태', responses: { 200: { description: '상태 조회' } } } },
      '/api/v1/auth/signup': { post: { tags: ['Auth'], summary: '일반 회원가입', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SignupRequest' } } } }, responses: { 201: { description: '가입 및 토큰 발급', content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenResponse' } } } }, 409: errorResponse, 422: errorResponse } } },
      '/api/v1/auth/login': { post: { tags: ['Auth'], summary: '로그인', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } }, responses: { 200: { description: '로그인 성공' }, 401: errorResponse, 422: errorResponse } } },
      '/api/v1/auth/logout': { post: { tags: ['Auth'], security: auth, summary: '모든 세션 로그아웃', responses: { 200: { description: '로그아웃 성공' }, 401: errorResponse } } },
      '/api/v1/auth/refresh': { post: { tags: ['Auth'], summary: 'Access Token 재발급', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } } } }, responses: { 200: { description: '재발급 성공' }, 401: errorResponse } } },
      '/api/v1/auth/kakao': { post: { tags: ['Auth'], summary: 'Kakao OAuth 로그인', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['accessToken'], properties: { accessToken: { type: 'string' } } } } } }, responses: { 200: { description: '로그인 성공' }, 401: errorResponse, 503: errorResponse } } },
      '/api/v1/users/me': { get: { tags: ['Users'], security: auth, summary: '마이페이지', responses: { 200: { description: '사용자 정보' }, 401: errorResponse, 404: errorResponse } } },
      '/api/v1/users/me/notifications': { patch: { tags: ['Notifications'], security: auth, summary: '학습 알림 설정', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['learningOn'], properties: { learningOn: { type: 'boolean' } } } } } }, responses: { 200: { description: '설정 저장' }, 401: errorResponse, 422: errorResponse } } },
      '/api/v1/tutor/conversations': { post: { tags: ['AI Tutor'], security: auth, summary: '대화방 생성', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { entryPoint: { type: 'string' }, contextTopicId: { type: 'string' }, contextStageId: { type: 'string' }, contextConceptId: { type: 'string' } } } } } }, responses: { 201: { description: '생성 성공' }, 401: errorResponse } }, get: { tags: ['AI Tutor'], security: auth, summary: '대화방 목록', parameters: [{ $ref: '#/components/parameters/page' }, { $ref: '#/components/parameters/pageSize' }], responses: { 200: { description: '목록 조회' }, 401: errorResponse } } },
      '/api/v1/tutor/conversations/{id}/messages': { get: { tags: ['AI Tutor'], security: auth, summary: '대화 메시지 목록', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, { $ref: '#/components/parameters/page' }, { $ref: '#/components/parameters/pageSize' }], responses: { 200: { description: '목록 조회' }, 404: errorResponse } } },
      '/api/v1/tutor/messages': { post: { tags: ['AI Tutor'], security: auth, summary: 'AI Tutor 질문', parameters: [{ name: 'Idempotency-Key', in: 'header', schema: { type: 'string', maxLength: 200 } }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TutorMessageRequest' } } } }, responses: { 201: { description: '답변 저장' }, 401: errorResponse, 409: errorResponse, 429: errorResponse, 503: errorResponse } } },
      '/api/v1/tutor/usage': { get: { tags: ['AI Tutor'], security: auth, summary: '일일 AI 사용량', responses: { 200: { description: '사용량' }, 401: errorResponse } } },
      '/api/v1/quizzes/generate': { get: { tags: ['Quizzes'], security: auth, summary: '승인된 문제 조회', parameters: [{ name: 'conceptId', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: '정답을 제외한 문제', content: { 'application/json': { schema: { $ref: '#/components/schemas/Quiz' } } } }, 404: errorResponse } } },
      '/api/v1/quizzes/{id}/submit': { post: { tags: ['Quizzes'], security: auth, summary: '문제 제출 및 채점', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['choiceId'], properties: { choiceId: { type: 'string', format: 'uuid' }, attemptId: { type: 'string', format: 'uuid' } } } } } }, responses: { 201: { description: '채점 결과' }, 409: errorResponse, 422: errorResponse } } },
    },
  },
  apis: [],
};

module.exports.definition.components.parameters = {
  page: { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  pageSize: { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
};
