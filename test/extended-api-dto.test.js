const test = require('node:test');
const assert = require('node:assert/strict');
const requestDto = require('../src/modules/extended-api/dto/extendedRequest.dto');
const responseDto = require('../src/modules/extended-api/dto/extendedResponse.dto');

const userUpdateDto = require('../src/modules/users/dto/updateUserRequest.dto');
const progressRequestDto = require('../src/modules/learning/dto/readingProgressRequest.dto');

const uuid = '123e4567-e89b-12d3-a456-426614174000';

function rejects(fn) {
  assert.throws(fn, error => error?.code === 'VALIDATION_ERROR');
}

test('extended request DTOs normalize IDs and reject unknown fields', () => {
  const result = requestDto.stageStart({ params: { stageId: uuid.toUpperCase() }, query: {}, body: { mode: 'START' } });
  assert.deepEqual(result, { params: { stageId: uuid }, body: { mode: 'START' } });
  rejects(() => requestDto.stageStart({ params: { stageId: uuid }, query: {}, body: { mode: 'START', extra: true } }));
  rejects(() => requestDto.stageStart({ params: { stageId: uuid }, query: {}, body: { mode: 'RESUME' } }));
  rejects(() => requestDto.topic({ params: { topicId: 'not-a-uuid' }, query: {}, body: {} }));
});

test('extended request DTOs validate date, pagination, enums and numeric boundaries', () => {
  assert.deepEqual(requestDto.reviewItems({ query: { source: 'WRONG', page: '2', size: '10' } }).query,
    { page: 2, size: 10, skip: 10, source: 'WRONG' });
  assert.equal(requestDto.due({ query: { date: '2026-02-28' } }).query.date, '2026-02-28');
  rejects(() => requestDto.due({ query: { date: '2026-02-30' } }));
  rejects(() => requestDto.reviewItems({ query: { source: 'ALL' } }));
  rejects(() => requestDto.shopList({ query: { category: 'HAT' } }));
  rejects(() => progressRequestDto.parse({ params: { stageId: uuid }, query: {}, body: { contentPosition: 0 } }));
  rejects(() => progressRequestDto.parse({ params: { stageId: uuid }, query: {}, body: { contentPosition: 32768 } }));
  assert.equal(progressRequestDto.parse({ params: { stageId: uuid }, query: {}, body: { contentPosition: 32767 } }).body.contentPosition, 32767);
  rejects(() => requestDto.statisticsOverall({ query: { from: '2026-12-01', to: '2026-01-01' } }));
  rejects(() => requestDto.statisticsConcepts({ query: { limit: '101' } }));
});

test('PATCH DTOs distinguish omitted optional fields from explicit null', () => {
  const omitted = requestDto.notificationUpdate({ params: {}, query: {}, body: { reminderEnabled: true } });
  const nulled = requestDto.notificationUpdate({ params: {}, query: {}, body: { reminderEnabled: true, reminderTime: null } });
  assert.deepEqual(omitted.body, { reminderEnabled: true });
  assert.deepEqual(nulled.body, { reminderEnabled: true, reminderTime: null });
  rejects(() => requestDto.notificationUpdate({ params: {}, query: {}, body: { reminderEnabled: true, unknown: 1 } }));
   rejects(() => userUpdateDto.parse({ params: {}, query: {}, body: {} }));
  rejects(() => userUpdateDto.parse({ params: {}, query: {}, body: { nickname: null } }));
  // validate 미들웨어는 result.body만 req.body에 반영하므로 body 키로 반환해야 한다
  assert.deepEqual(userUpdateDto.parse({ params: {}, query: {}, body: { nickname: '  홍길동  ' } }), { body: { nickname: '홍길동' } });
  rejects(() => userUpdateDto.parse({ params: {}, query: {}, body: { nickname: 'a'.repeat(31) } })); 
});

test('response DTOs whitelist public fields and omit secrets/internal columns', () => {
  const user = { userId: uuid, nickname: 'tester', passwordHash: 'secret', refreshToken: 'token' };
  const userDto = require('../src/modules/users/dto/updateUserRequest.dto').response(user);
  assert.deepEqual(userDto, { userId: uuid, nickname: 'tester' });
  assert.equal(Object.hasOwn(userDto, 'passwordHash'), false);

  const costume = responseDto.costume({ itemId: uuid, costumeCode: 'TOP_1', name: 'coat', category: 'TOP', priceCoin: 10,
    description: null, flavorText: null, imageKey: null, thumbnailKey: null, isOnSale: true, passwordHash: 'secret' }, true, false);
  assert.equal(costume.passwordHash, undefined);
  assert.equal(costume.priceCoin, 10);

  const attempt = responseDto.reviewAttempt({ reviewAttemptId: uuid, userId: uuid, status: 'IN_PROGRESS', questionCount: 1,
    submittedCount: 0, correctCount: 0, secretAnswer: uuid }, []);
  assert.equal(attempt.userId, undefined);
  assert.equal(attempt.secretAnswer, undefined);
});
