const AppError = require('../common/errors/AppError');

class KakaoClient {
  async getProfile(accessToken) {
    try {
      const response = await fetch('https://kapi.kakao.com/v2/user/me', { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw AppError.unauthorized('Kakao 토큰이 유효하지 않습니다.');
      return response.json();
    } catch (error) {
      if (error.code === 'UNAUTHORIZED') throw error;
      throw AppError.unavailable('Kakao 인증 서버에 연결할 수 없습니다.');
    }
  }
}

module.exports = KakaoClient;
