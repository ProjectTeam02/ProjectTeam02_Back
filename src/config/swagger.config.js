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
    servers: [{ url: '/' }],
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
        SignupRequest: { type: 'object', required: ['email', 'password', 'nickname'], properties: { email: { type: 'string', format: 'email', maxLength: 255, example: 'learner@example.com' }, password: { type: 'string', format: 'password', minLength: 8, maxLength: 128, example: 'password123' }, passwordConfirm: { type: 'string', format: 'password', description: '선택. 보내면 password와 같아야 함' }, nickname: { type: 'string', minLength: 1, maxLength: 30, example: 'leren-user' } } },
        LoginRequest: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email', maxLength: 255 }, password: { type: 'string', format: 'password', maxLength: 128 } } },
        TokenResponse: { type: 'object', required: ['user', 'accessToken', 'refreshToken', 'tokenType', 'expiresIn'], properties: { accessToken: { type: 'string' }, refreshToken: { type: 'string', description: '재발급 때마다 새 값으로 교체(회전)' }, tokenType: { type: 'string', enum: ['Bearer'] }, expiresIn: { type: 'integer', description: 'accessToken 유효 시간(초)', example: 900 }, user: { $ref: '#/components/schemas/User' } } },
        KakaoLoginRequest: {
          type: 'object', required: ['authorizationCode', 'redirectUri'],
          properties: {
            authorizationCode: { type: 'string', minLength: 1, maxLength: 4096, description: '카카오에서 발급받은 일회용 인가 코드' },
            redirectUri: { type: 'string', format: 'uri', minLength: 1, maxLength: 2048, description: '서버 허용 목록 및 인가 요청의 URI와 정확히 일치하는 HTTP(S) URI' },
          },
        },
        KakaoLoginResponse: {
          type: 'object', required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', example: true },
            data: { allOf: [{ $ref: '#/components/schemas/TokenResponse' }, {
              type: 'object', required: ['accessToken', 'refreshToken', 'user', 'isNewUser'],
              properties: { isNewUser: { type: 'boolean' } },
            }] },
          },
        },
        User: { type: 'object', properties: { userId: { type: 'string', format: 'uuid' }, nickname: { type: 'string' }, email: { type: 'string', nullable: true, description: '카카오 전용 회원은 null' }, level: { type: 'integer', description: '전체 레벨' }, totalExp: { type: 'integer' }, economyLevel: { type: 'integer' }, economyExp: { type: 'integer' }, plan: { type: 'string', enum: ['FREE', 'PREMIUM'] }, onboardingCompleted: { type: 'boolean', description: '직업 선택 완료 여부. false면 직업 선택 화면으로 이동' } } },
        NotificationSetting: { type: 'object', properties: { userId: { type: 'string', format: 'uuid' }, learningOn: { type: 'boolean' }, reminderEnabled: { type: 'boolean' }, reminderTime: { type: 'string', nullable: true, example: '20:00:00' }, timezone: { type: 'string', example: 'Asia/Seoul' }, dailyGoalCount: { type: 'integer', nullable: true }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } } },
        Quiz: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, title: { type: 'string' }, explanation: { type: 'string' }, difficulty: { type: 'string' }, choices: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' }, content: { type: 'string' } } } } } },
      },
    },
    paths: {
      '/health': { get: { tags: ['Health'], summary: 'Node.js 프로세스 상태', responses: { 200: { description: 'UP' } } } },
      '/api/v1/health/ready': { get: { tags: ['Health'], summary: 'DB와 FastAPI 준비 상태', responses: { 200: { description: 'READY' }, 503: errorResponse } } },
      '/api/v1/health/dependencies': { get: { tags: ['Health'], summary: '의존성 연결 상태', responses: { 200: { description: '상태 조회' } } } },
      '/api/v1/auth/signup': { post: { tags: ['Auth'], summary: '일반 회원가입', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SignupRequest' } } } }, responses: { 201: { description: '가입 및 토큰 발급', content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenResponse' } } } }, 409: errorResponse, 422: errorResponse } } },
      '/api/v1/auth/login': { post: { tags: ['Auth'], summary: '로그인', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } }, responses: { 200: { description: '로그인 성공', content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenResponse' } } } }, 401: errorResponse, 422: errorResponse } } },
      '/api/v1/auth/logout': { post: { tags: ['Auth'], security: auth, summary: '모든 세션 로그아웃', responses: { 200: { description: '로그아웃 성공' }, 401: errorResponse } } },
      '/api/v1/auth/refresh': { post: { tags: ['Auth'], summary: 'Access Token 재발급', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } } } }, responses: { 200: { description: '재발급 성공' }, 401: errorResponse } } },
      '/api/v1/auth/kakao': { post: {
        tags: ['Auth'], summary: '카카오 Authorization Code 로그인',
        description: '카카오 인가 코드를 교환하고 LEREN JWT와 프로필을 반환합니다. 이메일 자동 계정 연결은 수행하지 않습니다. URI와 키 설정이 필요하며 OAuth state 검증은 프론트엔드 계약 및 서버 발급 흐름 협의가 필요합니다.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/KakaoLoginRequest' } } } },
        responses: {
          200: { description: 'LEREN 로그인 성공 (카카오 토큰은 반환하지 않음)', content: { 'application/json': { schema: { $ref: '#/components/schemas/KakaoLoginResponse' } } } },
          401: { ...errorResponse, description: '카카오 사용자 조회 인증 실패' },
          403: { ...errorResponse, description: '정지/잠금/탈퇴 회원 또는 연결 해제된 소셜 계정' },
          422: { ...errorResponse, description: '요청 검증, 허용 목록 불일치 또는 인가 코드 교환 실패' },
          503: { ...errorResponse, description: '설정 누락, 카카오 장애/잘못된 응답/타임아웃 또는 DB 연결 실패' },
        },
      } },
      '/api/v1/users/me': { get: { tags: ['Users'], security: auth, summary: '마이페이지', responses: { 200: { description: '사용자 정보' }, 401: errorResponse, 404: errorResponse } } },
      '/api/v1/users/me/notifications': { patch: { tags: ['Notifications'], security: auth, summary: '학습 알림 설정', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['learningOn'], properties: { learningOn: { type: 'boolean' } } } } } }, responses: { 200: { description: '설정 저장', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/NotificationSetting' } } } } } }, 401: errorResponse, 422: errorResponse } } },
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

const mobileOAuth = require('./kakao-mobile.swagger');
Object.assign(module.exports.definition.components.schemas, mobileOAuth.schemas);
Object.assign(module.exports.definition.paths, mobileOAuth.paths);
Object.assign(module.exports.definition.paths['/api/v1/auth/kakao'].post, {
  deprecated: true,
  description: '기존 요청/응답 계약은 보존합니다. state 없는 직접 로그인은 기본 차단이며, 개발/테스트에서 KAKAO_LEGACY_DIRECT_LOGIN_ENABLED=true일 때만 사용 가능합니다. 운영은 항상 403. 모바일은 start/callback/exchange를 사용하세요.',
});

const calendar = require('./calendar.swagger');
module.exports.definition.tags.push({ name: 'Calendar', description: '내 학습 일정 관리' });
Object.assign(module.exports.definition.components.schemas, calendar.schemas);
Object.assign(module.exports.definition.paths, calendar.paths);

const learningHistory = require('./learning-history.swagger');
module.exports.definition.tags.push({ name: 'Learning History', description: '본인의 실제 학습 시도·제출 이력' });
Object.assign(module.exports.definition.components.schemas, learningHistory.schemas);
Object.assign(module.exports.definition.paths, learningHistory.paths);

const calendarRead = require('./calendar-read.swagger');
Object.assign(module.exports.definition.components.schemas, calendarRead.schemas);
Object.assign(module.exports.definition.paths, calendarRead.paths);

// Figma 19-01 response schema. Existing endpoint/path/security remain unchanged.
const myPage = require('./mypage.swagger');
Object.assign(module.exports.definition.components.schemas, myPage.schemas);
const characterOnboarding = require('./character-onboarding.swagger');
Object.assign(module.exports.definition.components.schemas, characterOnboarding.schemas);
Object.assign(module.exports.definition.paths, characterOnboarding.paths);
module.exports.definition.paths['/api/v1/users/me'].get.responses[200] = {
  description: '마이페이지 기본 화면 (DB 실제 값)',
  content: { 'application/json': { schema: {
    type: 'object', required: ['success', 'data'],
    properties: {
      success: { type: 'boolean' },
      data: { $ref: '#/components/schemas/MyPage' },
    },
  } } },
};

const normalStageQuiz = require('./normal-stage-quiz.swagger');
Object.assign(module.exports.definition.components.schemas, normalStageQuiz.schemas);
Object.assign(module.exports.definition.paths, normalStageQuiz.paths);

const economyContent = require('./economy-content.swagger');
module.exports.definition.tags.push({ name: 'Economy Content', description: '공개 주제, Stage 및 학습 카드 조회' });
Object.assign(module.exports.definition.components.schemas, economyContent.schemas);
Object.assign(module.exports.definition.paths, economyContent.paths);

const submit = module.exports.definition.paths['/api/v1/quizzes/{id}/submit'].post;
module.exports.definition.components.schemas.Quiz.properties.explanation = {
  type: 'string', nullable: true, description: '레거시 승인 문제 조회에서는 제출 전 해설을 숨기기 위해 항상 null. 일반 Stage 채점 응답에서 해설 제공',
};
module.exports.definition.components.schemas.Quiz.properties.conceptId = { type: 'string', format: 'uuid' };
const legacyGenerate = module.exports.definition.paths['/api/v1/quizzes/generate'].get;
legacyGenerate.description = '기존 승인(APPROVED) 문제 조회 경로입니다. Stage 응시와 연결되지 않습니다. explanation 필드는 유지하지만 값은 null이며, 정답 여부도 반환하지 않습니다. 진행·채점·보상은 일반 Stage 응시 API를 사용하세요.';
legacyGenerate.responses[200].content['application/json'] = {
  schema: { type: 'object', required: ['success', 'data'], properties: {
    success: { type: 'boolean' }, data: { $ref: '#/components/schemas/Quiz' },
  } },
  example: { success: true, data: {
    id: '123e4567-e89b-42d3-a456-426614174001', title: '기회비용은 무엇인가요?',
    explanation: null, difficulty: 'BEGINNER', conceptId: '123e4567-e89b-42d3-a456-426614174010',
    choices: [
      { id: '123e4567-e89b-42d3-a456-426614174011', label: 'A', content: '선택지 A' },
      { id: '123e4567-e89b-42d3-a456-426614174012', label: 'B', content: '선택지 B' },
    ],
  } },
};
submit.description = '진행 중인 본인 응시의 현재 문항만 제출할 수 있습니다. 정답일 때 HP가 1 감소하며 0이면 즉시 PASSED, 3문항 후 미통과면 FAILED입니다. 종료 후 새 제출은 409입니다. Idempotency-Key를 보냈다면 같은 키·문항·선택지의 재요청은 원래 채점 결과와 duplicate=true를 반환합니다. 같은 키를 다른 답안에 재사용하면 409입니다.';
submit.parameters[1].schema.maxLength = 200;
submit.requestBody.content['application/json'].schema.required = ['choiceId', 'attemptId'];
submit.responses[201] = responseForSubmission();
submit.responses[201].content['application/json'].example = {
  success: true, data: {
    attemptId: '123e4567-e89b-42d3-a456-426614174020',
    quizId: '123e4567-e89b-42d3-a456-426614174001',
    choiceId: '123e4567-e89b-42d3-a456-426614174012',
    isCorrect: true, score: 100, explanation: '기회비용 해설',
    hpBefore: 1, hpAfter: 0, submittedCount: 2, correctCount: 2,
    status: 'PASSED', endReason: 'MONSTER_DEFEATED', rewardGranted: true,
  },
};
submit.responses[401] = { description: '인증 실패' };
submit.responses[404] = { description: '본인 응시를 찾을 수 없음' };
submit.responses[503] = { description: 'Stage 보상 또는 문항 설정 오류' };

function responseForSubmission() {
  return { description: '채점 및 상태 저장', content: { 'application/json': { schema: {
    type: 'object', required: ['success', 'data'], properties: {
      success: { type: 'boolean' }, data: { type: 'object', required: ['attemptId', 'quizId', 'choiceId', 'isCorrect', 'hpBefore', 'hpAfter', 'submittedCount', 'correctCount', 'status'], properties: {
        attemptId: { type: 'string', format: 'uuid' }, quizId: { type: 'string', format: 'uuid' },
        choiceId: { type: 'string', format: 'uuid' }, isCorrect: { type: 'boolean' },
        score: { type: 'integer' }, explanation: { type: 'string' },
        hpBefore: { type: 'integer' }, hpAfter: { type: 'integer' },
        submittedCount: { type: 'integer' }, correctCount: { type: 'integer' },
        status: { type: 'string', enum: ['IN_PROGRESS', 'PASSED', 'FAILED'] },
        endReason: { type: 'string', nullable: true }, rewardGranted: { type: 'boolean' },
        duplicate: { type: 'boolean', description: '같은 Idempotency-Key의 재요청이면 true' },
      } },
    },
  } } } };
}

const tutor = require('./tutor.swagger');
Object.assign(module.exports.definition.components.schemas, tutor.schemas);
Object.assign(module.exports.definition.paths, tutor.paths);
