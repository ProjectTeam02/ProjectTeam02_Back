/**
 * 로그인 결과(사용자 + 토큰) 응답 데이터 형식 파일
 * 대상: signup, login, refresh, kakao, kakao/exchange 응답의 data
 * 백엔드 작업: User·UserGrowth 엔티티를 앱에 보낼 형태로 변환
 * 주의: 기존 응답 필드명과 JSON 구조 유지. passwordHash 등 엔티티 내부 값은 내보내지 않는다.
 *
 * data
 *   user
 *     userId               uuid
 *     nickname             string
 *     email                string | null  (카카오 전용 회원은 null)
 *     level                number  전체 레벨 (user_growth.total_level, 기록 없으면 1)
 *     totalExp             number
 *     economyLevel         number
 *     economyExp           number
 *     plan                 'FREE' | 'PREMIUM'
 *     onboardingCompleted  boolean  직업 선택 완료 여부. false면 앱이 직업 선택 화면으로 이동 (추가 필드)
 *   accessToken, refreshToken, tokenType, expiresIn   → tokenResponse.dto.js
 *   isNewUser            boolean  카카오 로그인 응답에만 포함
 */
const { tokens } = require('./tokenResponse.dto');

function user(entity, growth = null) {
  return {
    userId: entity.userId || entity.id,
    nickname: entity.nickname,
    email: entity.email ?? null,
    level: growth?.totalLevel ?? 1,
    totalExp: growth?.totalExp ?? 0,
    economyLevel: growth?.economyLevel ?? 1,
    economyExp: growth?.economyExp ?? 0,
    plan: entity.plan || 'FREE',
    onboardingCompleted: Boolean(entity.onboardingCompletedAt),
  };
}

function session({ user: entity, growth = null, issued, isNewUser }) {
  return {
    user: user(entity, growth),
    ...tokens(issued),
    ...(typeof isNewUser === 'boolean' ? { isNewUser } : {}),
  };
}

module.exports = { user, session };
