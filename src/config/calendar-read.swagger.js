const error = description => ({ description, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } });
const success = (name, examples) => ({ description: '조회 성공. 기록이 없어도 200', content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` }, examples } } });
const date = { type: 'string', format: 'date' };
const calendar = require('./calendar.swagger');
const plan = calendar.schemas.Schedule;
const monthDays = Array.from({ length: 30 }, (_, index) => ({
  date: `2026-11-${String(index + 1).padStart(2, '0')}`, completedCount: 0, scheduledCount: 0,
  hasCompletedLearning: false, hasScheduledLearning: false,
}));
const monthData = { year: 2026, month: 11, timeZone: 'Asia/Seoul', completedDayCount: 0,
  streakDays: 0, streakAsOfDate: '2026-11-02', streakPolicy: 'TODAY_OR_YESTERDAY', days: monthDays };
const dayData = { date: '2026-11-02', timeZone: 'Asia/Seoul', learningRecords: [], schedules: [] };
const exampleSchedule = {
  planId: '11111111-1111-4111-8111-111111111111', scheduledDate: '2026-11-02',
  topic: { topicId: '22222222-2222-4222-8222-222222222222', title: '경제' },
  stageId: '33333333-3333-4333-8333-333333333333', conceptId: null, planType: 'NEW_LEARNING',
  goal: '금리 학습', status: 'PLANNED', completedAt: null,
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
  stage: { stageId: '33333333-3333-4333-8333-333333333333', stageCode: '1-1', title: '금리', stageType: 'NORMAL' }, concept: null,
};
const monthExamples = {
  populated: { summary: '데이터가 있는 경우', value: { success: true, data: { ...monthData,
    days: monthDays.map((day, index) => index === 1 ? { ...day, scheduledCount: 1, hasScheduledLearning: true } : day) } } },
  empty: { summary: '데이터가 없는 경우', value: { success: true, data: { ...monthData,
    emptyMessage: '아직 등록된 학습 일정이나 완료한 학습이 없습니다.' } } },
};
const dayExamples = {
  populated: { summary: '데이터가 있는 경우', value: { success: true, data: { ...dayData, schedules: [exampleSchedule] } } },
  empty: { summary: '데이터가 없는 경우', value: { success: true, data: { ...dayData,
    emptyMessage: '해당 날짜에 등록된 학습 일정이나 완료한 학습이 없습니다.' } } },
};
module.exports = {
  schemas: {
    CalendarDaySchedule: { ...plan, properties: { ...plan.properties, topic: { ...plan.properties.topic, nullable: true },
      stage: { type: 'object', nullable: true, properties: { stageId: { type: 'string', format: 'uuid' }, stageCode: { type: 'string' }, title: { type: 'string' }, stageType: { type: 'string' } } },
      concept: { type: 'object', nullable: true, properties: { conceptId: { type: 'string', format: 'uuid' }, title: { type: 'string' }, version: { type: 'integer' } } },
    }, required: [...plan.required, 'stage', 'concept'] },
    CalendarDayResponse: { type: 'object', required: ['success', 'data'], properties: {
      success: { type: 'boolean', example: true }, data: { type: 'object', required: ['date', 'timeZone', 'learningRecords', 'schedules'], properties: {
        date, timeZone: { type: 'string', enum: ['Asia/Seoul'] },
        learningRecords: { type: 'array', items: { $ref: '#/components/schemas/LearningHistorySummary' } },
        schedules: { type: 'array', items: { $ref: '#/components/schemas/CalendarDaySchedule' } },
        emptyMessage: { type: 'string', description: '완료 기록과 예정 일정이 모두 없을 때만 반환' },
      } },
    } },
    CalendarMonthResponse: { type: 'object', required: ['success', 'data'], properties: {
      success: { type: 'boolean', example: true }, data: { type: 'object',
        required: ['year', 'month', 'timeZone', 'completedDayCount', 'streakDays', 'streakAsOfDate', 'streakPolicy', 'days'], properties: {
          year: { type: 'integer' }, month: { type: 'integer', minimum: 1, maximum: 12 }, timeZone: { type: 'string', enum: ['Asia/Seoul'] },
          completedDayCount: { type: 'integer', minimum: 0, description: '조회 월에서 PASSED+endedAt 완료 기록이 존재하는 고유 서울 날짜 수' },
          streakDays: { type: 'integer', minimum: 0, description: '조회 월과 무관한 오늘 기준 연속 기록. 오늘 없으면 어제부터 계산하는 가정 정책' },
          streakAsOfDate: date, streakPolicy: { type: 'string', enum: ['TODAY_OR_YESTERDAY'] },
          days: { type: 'array', description: '조회 월의 모든 날짜를 오름차순 반환. 0 집계 날짜도 포함', items: {
            type: 'object', required: ['date', 'completedCount', 'scheduledCount', 'hasCompletedLearning', 'hasScheduledLearning'], properties: {
              date, completedCount: { type: 'integer', minimum: 0 }, scheduledCount: { type: 'integer', minimum: 0 },
              hasCompletedLearning: { type: 'boolean' }, hasScheduledLearning: { type: 'boolean' },
            },
          } },
          emptyMessage: { type: 'string', description: '조회 월의 완료 기록과 예정 일정이 모두 없을 때만 반환' },
        },
      },
    } },
  },
  paths: {
    '/api/v1/calendar': { get: {
      tags: ['Calendar'], security: [{ bearerAuth: [] }], summary: '월별 학습 달력',
      description: '완료는 PASSED와 저장된 endedAt 기준(일반/BOSS/PLAY/RELEARN 포함). FAILED/진행/중도포기/복습은 제외합니다. 예정은 삭제되지 않은 PLANNED만 집계합니다. DONE 일정은 실제 학습 완료를 대신하지 않습니다. 연속 일수는 오늘/어제 인정 가정 정책이며 이전 달까지 조회합니다. 추가 query는 거부합니다.',
      parameters: [{ name: 'month', in: 'query', required: true, schema: { type: 'string', pattern: '^\\d{4}-\\d{2}$', example: '2026-11' } }],
      responses: { 200: success('CalendarMonthResponse', monthExamples), 401: error('JWT/세션 인증 실패'), 422: error('연월 누락/형식/존재하지 않는 월/미지원 query'), 503: error('DB 연결·쿼리 실패') },
    } },
    '/api/v1/calendar/days/{date}': { get: {
      tags: ['Calendar'], security: [{ bearerAuth: [] }], summary: '서울 날짜별 완료 기록과 예정 일정',
      description: '완료 시각이 서울 날짜 범위 [시작, 다음날 시작)에 있는 PASSED만 반환합니다. 기록은 완료 시각·ID 내림차순, 일정은 생성 시각·ID 오름차순입니다. 이력 DTO의 learningDate는 시작 날짜이며 date와 다를 수 있습니다. 실제 제출 기준 정답률과 경과 시간을 재사용합니다. 복습은 통합하지 않습니다. 일정 주제·목표는 별도 필드이며 예전 참조 없는 일정의 topic은 null일 수 있습니다.',
      parameters: [{ name: 'date', in: 'path', required: true, schema: { ...date, example: '2026-11-02' } }],
      responses: { 200: success('CalendarDayResponse', dayExamples), 401: error('JWT/세션 인증 실패'), 422: error('유효하지 않은 날짜 또는 미지원 query'), 503: error('DB 연결·쿼리 실패') },
    } },
  },
};
