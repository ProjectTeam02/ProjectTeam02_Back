/**
 * Expo 푸시 발송 클라이언트
 * 백엔드 작업: Expo 푸시 API(POST /--/api/v2/push/send)로 메시지를 보내고 기기별 결과(ticket)를 돌려준다
 * 주의: 한 요청에 최대 100개라 나눠 보낸다. 토큰·응답 원문은 로그에 남기지 않는다
 *       결과 순서는 보낸 메시지 순서와 같다 (Expo 응답 data 배열 순서)
 */
const env = require('../../config/env');

const CHUNK_SIZE = 100;

class PushSendError extends Error {
  constructor(code) {
    super(`Expo 푸시 요청 실패 (${code})`);
    this.code = code;
  }
}

function createPushClient({ fetchImpl = (...args) => globalThis.fetch(...args), config = env } = {}) {
  async function sendChunk(messages) {
    const headers = { 'content-type': 'application/json', accept: 'application/json', 'accept-encoding': 'gzip, deflate' };
    if (config.expoAccessToken) headers.authorization = `Bearer ${config.expoAccessToken}`;
    let response;
    try {
      response = await fetchImpl(config.expoPushUrl, {
        method: 'POST', headers, body: JSON.stringify(messages), signal: AbortSignal.timeout(config.expoPushTimeoutMs),
      });
    } catch (error) {
      throw new PushSendError(error?.name === 'TimeoutError' ? 'EXPO_TIMEOUT' : 'EXPO_NETWORK');
    }
    if (!response.ok) throw new PushSendError(`EXPO_HTTP_${response.status}`);
    const body = await response.json().catch(() => null);
    if (!Array.isArray(body?.data) || body.data.length !== messages.length) throw new PushSendError('EXPO_BAD_RESPONSE');
    return body.data;
  }

  return {
    /** messages: [{ to, title, body, data, sound, channelId }] → tickets: [{ status: 'ok' | 'error', details?: { error } }] */
    async send(messages) {
      const tickets = [];
      for (let index = 0; index < messages.length; index += CHUNK_SIZE) {
        tickets.push(...await sendChunk(messages.slice(index, index + CHUNK_SIZE)));
      }
      return tickets;
    },
  };
}

module.exports = { createPushClient, PushSendError, CHUNK_SIZE };
