const error = (description) => ({ description, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } });
const request = name => ({ required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } } });
const attemptId = { type: 'string', format: 'uuid', minLength: 36, maxLength: 36, pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' };
const scalar = { type: 'string', minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]{43}$' };

module.exports = {
  schemas: {
    KakaoStartRequest: { type: 'object', additionalProperties: false, required: ['codeChallenge', 'codeChallengeMethod'], properties: {
      codeChallenge: { ...scalar, description: '앱에 보관한 verifier의 SHA-256을 base64url(패딩 없음) 인코딩. 카카오 PKCE 파라미터가 아님' },
      codeChallengeMethod: { type: 'string', enum: ['S256'] },
    } },
    KakaoStartResponse: { type: 'object', required: ['success', 'data'], properties: {
      success: { type: 'boolean', example: true },
      data: { type: 'object', required: ['authorizationUrl', 'loginAttemptId', 'expiresIn'], properties: {
        authorizationUrl: { type: 'string', format: 'uri' }, loginAttemptId: attemptId, expiresIn: { type: 'integer', description: 'state 유효기간(초)' },
      } },
    } },
    KakaoExchangeRequest: { type: 'object', additionalProperties: false, required: ['loginCode', 'codeVerifier', 'loginAttemptId'], properties: {
      loginCode: scalar,
      codeVerifier: { type: 'string', minLength: 43, maxLength: 128, pattern: '^[A-Za-z0-9._~-]{43,128}$' },
      loginAttemptId: attemptId,
    } },
  },
  paths: {
    '/api/v1/auth/kakao/start': { post: {
      tags: ['Auth'], security: [], summary: '모바일 카카오 로그인 시작 (제안 계약)',
      description: 'Bearer 인증 불필요. 서버 설정의 콜백/앱 복귀 주소만 사용합니다. state와 앱 challenge를 결합하며 카카오에는 challenge를 전달하지 않습니다. 개발/테스트에서는 memory 또는 postgres, 운영에서는 마이그레이션이 적용된 postgres를 설정해야 합니다.',
      requestBody: request('KakaoStartRequest'), responses: {
        200: { description: '앱이 열 카카오 인증 URL과 로그인 시도 ID', content: { 'application/json': { schema: { $ref: '#/components/schemas/KakaoStartResponse' } } } },
        422: error('입력 또는 허용 목록 검증 실패'), 503: error('OAuth 설정/안전한 저장소 미준비 또는 요청 수용 한도 초과'),
        500: error('예상하지 못한 서버 내부 오류'),
      },
    } },
    '/api/v1/auth/kakao/callback': { get: {
      tags: ['Auth'], security: [], summary: '카카오 인증 서버 콜백',
      description: '브라우저용 GET. state를 검증·소비하고 회원을 준비하지만 JWT/세션은 발급하지 않습니다. 성공은 loginCode와 loginAttemptId, 실패는 고정 error와 loginAttemptId만 서버 설정 앱 주소에 전달합니다. state가 없거나 위조/만료/재사용된 경우 앱으로 리다이렉트하지 않습니다.',
      parameters: ['code', 'state', 'error', 'error_description'].map(name => ({ name, in: 'query', required: name === 'state', schema: { type: 'string' } })),
      responses: {
        302: { description: '등록한 앱 복귀 주소로 이동. error=login_cancelled 또는 login_failed 가능. JWT는 URL에 없음', headers: { Location: { schema: { type: 'string', format: 'uri' }, description: '서버에서 허용한 주소' } } },
        422: error('state/인가 코드 누락, 위조, 만료, 재사용'), 503: error('저장소 또는 콜백 설정 미준비'),
        500: error('설정/입력 검증 등에서 발생한 예상하지 못한 내부 오류. 회원 준비 중 오류는 302 login_failed로 처리'),
      },
    } },
    '/api/v1/auth/kakao/exchange': { post: {
      tags: ['Auth'], security: [], summary: '일회용 코드와 앱 verifier 검증 후 LEREN 로그인',
      description: 'Bearer 인증 불필요. verifier와 로그인 시도 ID가 일치한 경우만 코드를 원자적으로 소비한 뒤 회원 상태를 재확인하고 JWT/Refresh Token을 발급합니다. 실패한 세션 발급도 코드를 재사용할 수 없으므로 로그인부터 다시 시작합니다.',
      requestBody: request('KakaoExchangeRequest'), responses: {
        200: { description: 'LEREN 인증 결과', content: { 'application/json': { schema: { $ref: '#/components/schemas/KakaoLoginResponse' } } } },
        401: error('교환 코드 만료/재사용 또는 앱 증명 불일치'), 403: error('연결 해제 또는 비활성 회원'),
        422: error('요청 형식 또는 loginAttemptId UUID 오류'), 503: error('안전한 저장소/서버 설정 또는 DB 미준비'),
        500: error('예상하지 못한 서버 내부 오류'),
      },
    } },
  },
};
