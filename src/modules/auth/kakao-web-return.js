const AppError = require('../../common/errors/AppError');

const loopbackHosts = ['localhost', '127.0.0.1', '[::1]'];

// loopback HTTP 복귀 허용 여부
// - 개발·테스트: localhost, 127.0.0.1, [::1] 허용 (기존 동작)
// - 그 외(운영): KAKAO_ALLOW_LOOPBACK_WEB_RETURN=true이고 http://localhost:<포트> 형태일 때만 허용
//   허용되는 주소는 설정된 KAKAO_WEB_RETURN_URL 하나뿐이며, 요청에서 복귀 주소를 받지 않는다.
function loopbackHttpAllowed(config, url) {
  if (url.protocol !== 'http:' || !loopbackHosts.includes(url.hostname)) return false;
  if (['development', 'test'].includes(config.nodeEnv)) return true;
  return config.kakaoAllowLoopbackWebReturn === true && url.hostname === 'localhost' && url.port !== '';
}

function webReturnUrl(config) {
  let url;
  try { url = new URL(config.kakaoWebReturnUrl); } catch (_error) { return null; }
  const localHttp = loopbackHttpAllowed(config, url);
  if (!url.hostname || (url.protocol !== 'https:' && !localHttp)
    || url.username || url.password || url.search || url.hash || url.pathname !== '/auth/callback'
    || !url.href.endsWith('/auth/callback')) return null;
  return url;
}

function webLoginCors(config) {
  return (req, res, next) => {
    if (req.path !== '/' || !['POST', 'OPTIONS'].includes(req.method)) return next();
    res.vary('Origin');
    const origin = req.get('Origin');
    const allowedOrigin = webReturnUrl(config)?.origin;
    const allowed = Boolean(origin && origin === allowedOrigin);

    if (req.method === 'OPTIONS') {
      res.vary('Access-Control-Request-Method').vary('Access-Control-Request-Headers');
      const headers = (req.get('Access-Control-Request-Headers') || '')
        .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
      if (!allowed || req.get('Access-Control-Request-Method') !== 'POST' || headers.some(name => name !== 'content-type')) {
        return next(AppError.forbidden('허용되지 않은 웹 로그인 Origin 또는 요청입니다.'));
      }
      return res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      }).status(204).end();
    }
    if (allowed) res.set('Access-Control-Allow-Origin', origin);
    return next();
  };
}

module.exports = { webReturnUrl, webLoginCors };
