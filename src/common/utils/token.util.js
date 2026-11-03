const crypto = require('node:crypto');
const env = require('../../config/env');
const AppError = require('../errors/AppError');

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(payload, secret, ttlSeconds) {
  if (!secret) throw AppError.unavailable('인증 서버 설정이 완료되지 않았습니다.');
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const encodedHeader = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const encodedPayload = base64url(JSON.stringify(body));
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', secret).update(input).digest('base64url');
  return `${input}.${signature}`;
}

function verify(token, secret) {
  if (!secret || typeof token !== 'string') throw new Error('Invalid token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [header, payload, signature] = parts;
  const expected = crypto.createHmac('sha256', secret)
    .update(`${header}.${payload}`).digest('base64url');
  if (signature.length !== expected.length
    || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error('Invalid signature');
  }
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!decoded.exp || decoded.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('Expired token');
  }
  return decoded;
}

function issueAccessToken(user, sessionId) {
  return sign({ sub: user.id || user.userId, email: user.email, sid: sessionId, type: 'access' }, env.jwtAccessSecret, env.accessTokenTtlSeconds);
}

function issueRefreshToken(user, sessionId) {
  return sign({ sub: user.id || user.userId, sid: sessionId, type: 'refresh' }, env.jwtRefreshSecret, env.refreshTokenTtlSeconds);
}

function verifyAccessToken(token) {
  const payload = verify(token, env.jwtAccessSecret);
  if (payload.type !== 'access') throw new Error('Invalid token type');
  return payload;
}

function verifyRefreshToken(token) {
  const payload = verify(token, env.jwtRefreshSecret);
  if (payload.type !== 'refresh') throw new Error('Invalid token type');
  return payload;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  issueAccessToken,
  issueRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
};
