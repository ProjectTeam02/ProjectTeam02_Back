/**
 * 비밀번호 재설정 토큰 전달 경계.
 * 메일 provider가 연결되기 전에는 토큰을 저장하지 않고 로그에도 남기지 않는다.
 * 운영에서는 이 함수만 메일 provider adapter로 교체한다.
 */
async function send(_message) {
  return { delivered: false, provider: 'not-configured' };
}

module.exports = { send };
