/**
 * 페이지네이션 유틸리티
 * 백엔드 작업: page·limit 입력을 DB 조회 범위로 정규화
 * 주의: 최대 조회 건수 100 제한을 유지
 */
function getPagination(page = 1, limit = 20) {
  const normalizedPage = Math.max(Number(page) || 1, 1);
  const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  return {
    page: normalizedPage,
    limit: normalizedLimit,
    skip: (normalizedPage - 1) * normalizedLimit,
  };
}

module.exports = { getPagination };
function pagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize || '20', 10) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

module.exports = { pagination };
