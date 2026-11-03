/**
 * FastAPI AI 서버 통신
 * 백엔드 작업: AI 서버 요청·응답과 Timeout 정책을 관리
 * 주의: URL·인증 토큰은 환경변수로만 관리한다.
 */
const AppError = require('../common/errors/AppError');
const env = require('../config/env');

async function requestJson(path, options = {}, config = env) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.fastapiTimeoutMs);
  try {
    const response = await fetch(`${config.fastapiBaseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(config.fastapiInternalToken
          ? { 'x-internal-api-key': config.fastapiInternalToken }
          : {}),
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch (_error) {
      throw AppError.unavailable('AI 서버가 잘못된 응답을 반환했습니다.');
    }
    if (!response.ok) {
      const error = AppError.unavailable(
        response.status === 504 ? '튜터가 바쁩니다.' : 'AI 서버 요청에 실패했습니다.',
      );
      error.details = { upstreamStatus: response.status };
      throw error;
    }
    return body;
  } catch (error) {
    if (error.name === 'AbortError') throw AppError.unavailable('튜터가 바쁩니다.');
    if (error.code === 'SERVICE_UNAVAILABLE') throw error;
    throw AppError.unavailable('AI 서버에 연결할 수 없습니다.');
  } finally {
    clearTimeout(timer);
  }
}

class FastApiClient {
  constructor(options = {}) {
    this.config = {
      ...env,
      ...(options.baseUrl ? { fastapiBaseUrl: options.baseUrl } : {}),
      ...(options.timeoutMs ? { fastapiTimeoutMs: options.timeoutMs } : {}),
      ...(options.internalToken ? { fastapiInternalToken: options.internalToken } : {}),
    };
  }

  async answer(payload) {
    const body = await requestJson('/internal/v1/tutor/answer', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, this.config);
    if (!body || typeof body.answer !== 'string' || !body.requestId) {
      throw AppError.unavailable('AI 서버 응답 형식이 올바르지 않습니다.');
    }
    return body;
  }

  async health() {
    try {
      await requestJson('/health', {}, this.config);
      return { status: 'CONNECTED' };
    } catch (_error) {
      return { status: 'DISCONNECTED' };
    }
  }
}

module.exports = FastApiClient;
module.exports.requestJson = requestJson;
