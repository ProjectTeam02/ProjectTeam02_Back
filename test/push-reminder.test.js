const assert = require('node:assert/strict');
const test = require('node:test');
const { createPushClient, PushSendError } = require('../src/modules/notifications/push.client');
const reminderService = require('../src/modules/notifications/reminder.service');
const { createReminderScheduler, startReminderScheduler } = require('../src/modules/notifications/reminder.scheduler');
const message = require('../src/modules/notifications/reminder.message');

// E-2 학습 알림 발송: Expo 클라이언트, 발송 서비스(가짜 DB·가짜 클라이언트), 스케줄러 스위치
const config = { expoPushUrl: 'https://push.test/send', expoAccessToken: null, expoPushTimeoutMs: 1000 };
const token = index => `ExponentPushToken[t${index}]`;

function fakeFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, headers: options.headers, body });
    return handler(body, calls.length);
  };
  return { calls, fetchImpl };
}
const okResponse = body => ({ ok: true, status: 200, json: async () => ({ data: body.map(() => ({ status: 'ok', id: 'ticket' })) }) });

test('Expo 클라이언트: 100개씩 나눠 보내고 결과 순서를 유지한다', async () => {
  const { calls, fetchImpl } = fakeFetch(okResponse);
  const client = createPushClient({ fetchImpl, config });
  const messages = Array.from({ length: 230 }, (_, index) => ({ to: token(index), title: 't', body: 'b' }));
  const tickets = await client.send(messages);
  assert.deepEqual(calls.map(call => call.body.length), [100, 100, 30]);
  assert.equal(tickets.length, 230);
  assert.equal(calls[0].url, 'https://push.test/send');
  assert.equal(calls[0].headers.authorization, undefined);
});

test('Expo 클라이언트: Access Token이 있으면 Authorization 헤더를 붙인다', async () => {
  const { calls, fetchImpl } = fakeFetch(okResponse);
  await createPushClient({ fetchImpl, config: { ...config, expoAccessToken: 'expo-secret' } }).send([{ to: token(1) }]);
  assert.equal(calls[0].headers.authorization, 'Bearer expo-secret');
});

test('Expo 클라이언트: HTTP 오류·잘못된 응답·네트워크 오류는 코드가 있는 PushSendError', async () => {
  const cases = [
    [async () => ({ ok: false, status: 500, json: async () => ({}) }), 'EXPO_HTTP_500'],
    [async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }), 'EXPO_BAD_RESPONSE'],
    [async () => { throw new TypeError('fetch failed'); }, 'EXPO_NETWORK'],
  ];
  for (const [fetchImpl, code] of cases) {
    await assert.rejects(createPushClient({ fetchImpl, config }).send([{ to: token(1) }]), error => error instanceof PushSendError && error.code === code);
  }
});

test('알림 문구는 고정값 (제목 Leren)', () => {
  assert.equal(message.title, 'Leren');
  assert.equal(message.body, '오늘의 경제 학습, 잠깐 해볼까요?');
  assert.deepEqual(reminderService.buildMessage({ pushToken: token(1) }), {
    to: token(1), title: 'Leren', body: '오늘의 경제 학습, 잠깐 해볼까요?', data: { type: 'LEARNING_REMINDER' }, sound: 'default', channelId: 'default',
  });
});

// SQL 종류별로 가짜 결과를 돌려주는 DB
function fakeDataSource({ reserved, devices }) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('INSERT INTO account.notification_logs')) return reserved;
      if (sql.includes('SELECT device_id')) return devices;
      return [];
    },
  };
}
const finishes = db => db.calls.filter(call => call.sql.includes('UPDATE account.notification_logs')).map(call => call.params);

test('발송 서비스: 기기별 결과를 사용자 단위로 기록하고 앱이 삭제된 기기는 비활성화한다', async () => {
  const db = fakeDataSource({
    reserved: [{ logId: 'log-a', userId: 'user-a' }, { logId: 'log-b', userId: 'user-b' }],
    devices: [
      { deviceId: 'dev-a1', userId: 'user-a', pushToken: token(1) },
      { deviceId: 'dev-a2', userId: 'user-a', pushToken: token(2) },
      { deviceId: 'dev-b1', userId: 'user-b', pushToken: token(3) },
    ],
  });
  const sent = [];
  const pushClient = { send: async messages => { sent.push(...messages); return [
    { status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }, { status: 'error', details: { error: 'MessageRateExceeded' } },
  ]; } };
  const result = await reminderService({ dataSource: db, pushClient }).runOnce(new Date('2026-11-15T11:00:00Z'));
  assert.deepEqual(result, { reserved: 2, sent: 1, failed: 1, deactivated: 1 });
  assert.deepEqual(sent.map(item => item.to), [token(1), token(2), token(3)]);
  assert.deepEqual(finishes(db), [['log-a', 'SENT', 2, 1, null], ['log-b', 'FAILED', 1, 0, 'MessageRateExceeded']]);
  const deactivate = db.calls.find(call => call.sql.includes('UPDATE account.user_devices'));
  assert.deepEqual(deactivate.params, [['dev-a2']]);
  assert.equal(db.calls[0].params[0], '2026-11-15T11:00:00.000Z');
});

test('발송 서비스: Expo 요청 자체가 실패하면 모두 FAILED로 기록한다 (같은 날 다시 보내지 않음)', async () => {
  const db = fakeDataSource({ reserved: [{ logId: 'log-a', userId: 'user-a' }], devices: [{ deviceId: 'dev-a1', userId: 'user-a', pushToken: token(1) }] });
  const pushClient = { send: async () => { throw new PushSendError('EXPO_TIMEOUT'); } };
  const result = await reminderService({ dataSource: db, pushClient }).runOnce();
  assert.equal(result.failed, 1);
  assert.deepEqual(finishes(db), [['log-a', 'FAILED', 1, 0, 'EXPO_TIMEOUT']]);
});

test('발송 서비스: 대상이 없으면 Expo를 호출하지 않고, 기기가 사이에 사라진 사용자는 NO_DEVICE로 기록한다', async () => {
  let sends = 0;
  const pushClient = { send: async () => { sends += 1; return []; } };
  const empty = fakeDataSource({ reserved: [], devices: [] });
  assert.deepEqual(await reminderService({ dataSource: empty, pushClient }).runOnce(), { reserved: 0, sent: 0, failed: 0, deactivated: 0 });
  const gone = fakeDataSource({ reserved: [{ logId: 'log-a', userId: 'user-a' }], devices: [] });
  await reminderService({ dataSource: gone, pushClient }).runOnce();
  assert.equal(sends, 0);
  assert.deepEqual(finishes(gone), [['log-a', 'FAILED', 0, 0, 'NO_DEVICE']]);
});

test('스케줄러: PUSH_SCHEDULER_ENABLED가 아니거나 테스트 환경이면 시작하지 않는다', () => {
  const logger = { log: () => {}, error: () => {} };
  assert.equal(startReminderScheduler({ config: { pushSchedulerEnabled: false, nodeEnv: 'production' }, logger }), null);
  assert.equal(startReminderScheduler({ config: { pushSchedulerEnabled: true, nodeEnv: 'test' }, logger }), null);
});

test('스케줄러: 이전 실행이 끝나지 않았으면 건너뛰고, 오류는 로그만 남긴다', async () => {
  let release;
  const service = { runOnce: () => new Promise(resolve => { release = resolve; }) };
  const logs = [];
  const scheduler = createReminderScheduler({ service, logger: { log: text => logs.push(text), error: text => logs.push(text) } });
  const first = scheduler.tick();
  assert.deepEqual(await scheduler.tick(), { skipped: true });
  release({ reserved: 1, sent: 1, failed: 0, deactivated: 0 });
  await first;
  const failing = createReminderScheduler({ service: { runOnce: async () => { throw Object.assign(new Error('db down'), { code: 'ECONNREFUSED' }); } }, logger: { log: () => {}, error: text => logs.push(text) } });
  assert.deepEqual(await failing.tick(), { error: true });
  assert.ok(logs.some(text => text.includes('ECONNREFUSED')));
  assert.ok(logs.every(text => !text.includes('ExponentPushToken')));
});

test('스케줄러: start/stop', () => {
  const scheduler = createReminderScheduler({ service: { runOnce: async () => ({ reserved: 0 }) } });
  scheduler.start();
  assert.equal(scheduler.isStarted(), true);
  scheduler.stop();
  assert.equal(scheduler.isStarted(), false);
});
