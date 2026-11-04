const crypto = require('node:crypto');
const AppError = require('../../common/errors/AppError');
const env = require('../../config/env');
const authSchema = require('./auth.schema');
const { MemoryOAuthStore } = require('./kakao-oauth.store');
const kakaoRequest = require('./dto/kakaoRequest.dto');

const challengeFor = verifier => crypto.createHash('sha256').update(verifier).digest('base64url');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string'
  && Buffer.byteLength(a) === Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const object = value => value && typeof value === 'object' && !Array.isArray(value);

function service(auth, { config = env, store = new MemoryOAuthStore() } = {}) {
  function configuration() {
    // A shared persistent adapter has not been approved/provisioned. Production fails closed.
    if (!['development', 'test'].includes(config.nodeEnv) || config.kakaoOauthStoreMode !== 'memory') {
      throw AppError.unavailable('OAuth 상태 저장소가 준비되지 않았습니다.');
    }
    if (![config.kakaoRestApiKey, config.kakaoClientSecret].every(v => typeof v === 'string' && v.trim())) {
      throw AppError.unavailable('Kakao OAuth 설정이 완료되지 않았습니다.');
    }
    const callback = config.kakaoOauthCallbackUrl;
    // Reuse exact-match HTTP(S) allow-list policy. No client-supplied redirect target.
    authSchema.kakao({ body: { authorizationCode: 'configuration-check', redirectUri: callback } });
    let url;
    let deepLink;
    try { url = new URL(callback); deepLink = new URL(config.kakaoAppDeepLink); } catch (_error) {
      throw AppError.unavailable('OAuth 콜백 또는 앱 복귀 주소 설정이 올바르지 않습니다.');
    }
    if (url.pathname !== '/api/v1/auth/kakao/callback' || url.search || url.hash
      || !['leren:', 'https:'].includes(deepLink.protocol) || deepLink.username || deepLink.password
      || deepLink.search || deepLink.hash || !deepLink.hostname
      || !config.kakaoAllowedAppDeepLinks.includes(config.kakaoAppDeepLink)) {
      throw AppError.unavailable('OAuth 콜백 또는 앱 복귀 주소 설정이 올바르지 않습니다.');
    }
    for (const [ttl, max] of [[config.kakaoOauthStateTtlSeconds, 600], [config.kakaoOauthExchangeTtlSeconds, 120]]) {
      if (!Number.isInteger(ttl) || ttl < 1 || ttl > max) throw AppError.unavailable('OAuth 유효기간 설정이 올바르지 않습니다.');
    }
  }

  function appUrl(attempt, params) {
    const url = new URL(attempt.deepLink);
    url.searchParams.set('loginAttemptId', attempt.loginAttemptId);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    return url.toString();
  }

  return {
    start(body) {
      configuration();
      const { codeChallenge } = kakaoRequest.parseStart(body);
      const attempt = {
        loginAttemptId: crypto.randomUUID(), challenge: codeChallenge,
        redirectUri: config.kakaoOauthCallbackUrl, deepLink: config.kakaoAppDeepLink,
      };
      const state = store.put('state', attempt, config.kakaoOauthStateTtlSeconds);
      const url = new URL('https://kauth.kakao.com/oauth/authorize');
      url.search = new URLSearchParams({ response_type: 'code', client_id: config.kakaoRestApiKey,
        redirect_uri: attempt.redirectUri, state }).toString();
      return { authorizationUrl: url.toString(), loginAttemptId: attempt.loginAttemptId, expiresIn: config.kakaoOauthStateTtlSeconds };
    },

    async callback(query) {
      configuration();
      if (!object(query) || !kakaoRequest.isOAuthState(query.state)) {
        throw AppError.validation('유효한 OAuth state가 필요합니다.');
      }
      // Consume before network I/O so concurrent/replayed callbacks never exchange the code twice.
      const attempt = store.consume('state', query.state);
      if (!attempt) throw AppError.validation('OAuth state가 유효하지 않거나 만료되었습니다.');
      if (attempt.deepLink !== config.kakaoAppDeepLink || attempt.redirectUri !== config.kakaoOauthCallbackUrl) {
        throw AppError.validation('OAuth 설정이 변경되었습니다. 로그인을 다시 시작하세요.');
      }
      if (typeof query.error === 'string') {
        return appUrl(attempt, { error: query.error === 'access_denied' ? 'login_cancelled' : 'login_failed' });
      }
      if (typeof query.code !== 'string' || !query.code.trim() || query.code.length > 4096) {
        throw AppError.validation('카카오 인가 코드가 필요합니다.');
      }
      try {
        const identity = await auth.prepareKakaoLogin({ authorizationCode: query.code, redirectUri: attempt.redirectUri });
        const loginCode = store.put('exchange', { ...attempt, ...identity }, config.kakaoOauthExchangeTtlSeconds);
        return appUrl(attempt, { loginCode });
      } catch (_error) {
        // Never reflect provider/DB messages, credentials, codes or personal data into URLs.
        return appUrl(attempt, { error: 'login_failed' });
      }
    },

    async exchange(body) {
      configuration();
      const { loginCode, codeVerifier, loginAttemptId } = kakaoRequest.parseExchange(body);
      const identity = store.consume('exchange', loginCode, entry =>
        equal(entry.challenge, challengeFor(codeVerifier)) && equal(entry.loginAttemptId, loginAttemptId));
      if (!identity) throw AppError.unauthorized('로그인 교환 정보가 유효하지 않거나 만료되었습니다.');
      // A failed DB/session issuance burns the code. Restart login; never retry consumed credentials.
      return auth.completeKakaoLogin(identity);
    },
  };
}

module.exports = service;
