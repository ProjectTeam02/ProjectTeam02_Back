
const { ReviewMission } = require('@leren/database');

function seoulDatePlusDays(date, days) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = type => Number(
    parts.find(part => part.type === type).value
  );

  const due = new Date(Date.UTC(
    get('year'),
    get('month') - 1,
    get('day') + days
  ));

  return due.toISOString().slice(0, 10);
}

/**
 * 최초 오답 등록 시 개념별 복습 미션을 발급한다.
 * - 최초 오답 발생 3일 뒤 복습 예정
 * - 사용자·개념별 1회만 발급
 * - 기존 완료/진행 중 미션은 변경하지 않음
 * - 호출자의 DB 트랜잭션을 사용
 */
async function createReviewMission(manager, {
  userId,
  conceptCode,
  firstRegisteredAt = new Date(),
}) {
  if (!userId || !conceptCode) {
    throw new Error('복습 미션 생성에 사용자와 개념 코드가 필요합니다.');
  }

  const registeredAt = new Date(firstRegisteredAt);

  if (Number.isNaN(registeredAt.getTime())) {
    throw new Error('올바른 최초 등록 시각이 필요합니다.');
  }

  const dueDate = seoulDatePlusDays(registeredAt, 3);

  await manager
    .createQueryBuilder()
    .insert()
    .into(ReviewMission)
    .values({
      userId,
      conceptCode,
      firstRegisteredAt: registeredAt,
      dueDate,
      status: 'SCHEDULED',
      targetQuestionCount: 5,
    })
    .orIgnore()
    .execute();
}

module.exports = {
  createReviewMission,
  seoulDatePlusDays,
};
