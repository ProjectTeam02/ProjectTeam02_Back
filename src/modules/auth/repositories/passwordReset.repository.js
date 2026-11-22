/**
 * 인증 PostgreSQL 접근 계층 파일
 * 백엔드 작업: 조회·저장 로직과 쿼리를 관리
 * 주의: 기존 DB 스키마와 환경변수 유지
 * 발송이 접수될 때까지 sendCount가 0이며 토큰 사용을 허용하지 않습니다.
 */
const { AccountToken } = require('@leren/database');
const { IsNull, LessThanOrEqual, MoreThanOrEqual, Not } = require('typeorm');

const tokenType = 'PASSWORD_RESET';

function repository(manager) {
  const tokens = manager.getRepository(AccountToken);
  return {
    byHash: tokenHash => tokens.findOneBy({ tokenHash, tokenType }),
    byId: (userId, tokenId) => tokens.findOneBy({ userId, tokenId, tokenType }),
    recentAttempts: (userId, since, limit) => tokens.find({
      where: { userId, tokenType, createdAt: MoreThanOrEqual(since) }, select: { createdAt: true },
      order: { createdAt: 'DESC' }, take: limit,
    }),
    reserve: data => tokens.save({ ...data, tokenType, sendCount: 0 }),
    discard: (tokenId, now) => tokens.update({ tokenId, tokenType, sendCount: 0, usedAt: IsNull() }, { usedAt: now }),
    recordSent: (tokenId, now) => tokens.update({ tokenId, tokenType }, { sendCount: 1, lastSentAt: now }),
    revokeOlder: (row, now) => tokens.update({ userId: row.userId, tokenType, usedAt: IsNull(),
      createdAt: LessThanOrEqual(row.createdAt), tokenId: Not(row.tokenId) }, { usedAt: now }),
    revokeAll: (userId, now) => tokens.update({ userId, tokenType, usedAt: IsNull() }, { usedAt: now }),
  };
}

module.exports = repository;
