const assert = require('node:assert/strict');
const test = require('node:test');
const { randomBytes } = require('node:crypto');
const path = require('node:path');

// E-2 학습 알림 대상 선정·중복 방지를 실제 PostgreSQL로 확인 (시간대 계산·UNIQUE·스키마 이름 SQL)
const config = process.env.LEREN_EXTENDED_API_PG_TEST_CONFIG;

test('학습 알림은 사용자 시간대의 설정 시각에 하루 한 번만 발송된다', { skip: !config, timeout: 120000 }, async t => {
  const options = JSON.parse(config);
  const { AppDataSource: db, User, UserSetting, UserDevice, NotificationLog } = require('@leren/database');
  const reminderService = require('../../src/modules/notifications/reminder.service');
  const previous = { ...db.options };
  t.after(async () => {
    if (db.isInitialized) await db.destroy();
    db.setOptions(previous);
  });
  db.setOptions({ host: options.host || '127.0.0.1', port: options.port, username: options.username || 'app_user',
    password: options.password || 'app_local', database: options.database || 'leren_it', ssl: false,
    synchronize: false, migrationsRun: false, logging: false, migrations: [path.resolve(__dirname, '../../database/dist/migrations/*.js')],
    extra: { options: '-c search_path=app,account,character,content,learning,reward,review,tutor,public' } });
  await db.initialize();

  // 다른 테스트·이전 실행과 겹치지 않게 임의의 먼 날짜를 쓴다 (발송 기록은 날짜 단위 UNIQUE)
  const suffix = randomBytes(4).toString('hex');
  const day = new Date(Date.UTC(2031 + Math.floor(Math.random() * 50), Math.floor(Math.random() * 11), 1 + Math.floor(Math.random() * 27)));
  const ymd = date => date.toISOString().slice(0, 10);
  // 그 날짜의 KST 20:00 = UTC 11:00
  const now = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 11, 0, 30));

  const users = db.getRepository(User);
  const settings = db.getRepository(UserSetting);
  const devices = db.getRepository(UserDevice);
  async function make(name, setting, device = { notificationPermission: true }, user = {}) {
    const row = await users.save({ email: `push-${name}-${suffix}@example.com`, nickname: `${name}${suffix}`, ...user });
    await settings.save({ userId: row.userId, ...setting });
    if (device) await devices.save({ userId: row.userId, deviceUuid: `${name}-${suffix}`, platform: 'ANDROID', isActive: true,
      pushToken: `ExponentPushToken[${name}_${suffix}]`, ...device });
    return row;
  }
  // 서울 20:00 → 대상
  const seoul = await make('seoul', { reminderEnabled: true, reminderTime: '20:00:00', timezone: 'Asia/Seoul' });
  // 다른 시간대(뉴욕): 같은 순간의 뉴욕 시각으로 설정한 사용자 → 대상 (서머타임 포함 계산은 DB가 함)
  const newYorkTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const utc = await make('utc', { reminderEnabled: true, reminderTime: `${newYorkTime}:00`, timezone: 'America/New_York' });
  // 대상 아님
  const off = await make('off', { reminderEnabled: false, reminderTime: '20:00:00', timezone: 'Asia/Seoul' });
  const noTime = await make('notime', { reminderEnabled: true, reminderTime: null, timezone: 'Asia/Seoul' });
  const otherMinute = await make('minute', { reminderEnabled: true, reminderTime: '20:01:00', timezone: 'Asia/Seoul' });
  const noPermission = await make('perm', { reminderEnabled: true, reminderTime: '20:00:00', timezone: 'Asia/Seoul' }, { notificationPermission: false });
  const noDevice = await make('nodevice', { reminderEnabled: true, reminderTime: '20:00:00', timezone: 'Asia/Seoul' }, null);
  const suspended = await make('suspended', { reminderEnabled: true, reminderTime: '20:00:00', timezone: 'Asia/Seoul' }, undefined, { accountStatus: 'SUSPENDED' });
  const mine = [seoul, utc, off, noTime, otherMinute, noPermission, noDevice, suspended].map(user => user.userId);

  const sent = [];
  // utc 사용자 기기는 앱이 삭제된 것으로 응답
  const pushClient = { send: async messages => { sent.push(...messages); return messages.map(item => item.to.includes('utc_')
    ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' }); } };
  const service = reminderService({ dataSource: db, pushClient });

  await service.runOnce(now);
  const myTokens = sent.map(item => item.to).filter(to => to.includes(suffix)).sort();
  assert.deepEqual(myTokens, [`ExponentPushToken[seoul_${suffix}]`, `ExponentPushToken[utc_${suffix}]`].sort());
  assert.ok(sent.every(item => item.title === 'Leren'));

  const logs = await db.getRepository(NotificationLog).find({ where: mine.map(userId => ({ userId })) });
  const logOf = userId => logs.filter(row => row.userId === userId);
  assert.equal(logs.length, 2);
  assert.deepEqual(logOf(seoul.userId).map(row => [row.targetDate, row.status, row.deviceCount, row.successCount]), [[ymd(day), 'SENT', 1, 1]]);
  assert.deepEqual(logOf(utc.userId).map(row => [row.status, row.errorCode]), [['FAILED', 'DeviceNotRegistered']]);
  const utcDevice = await devices.findOneBy({ userId: utc.userId });
  assert.equal(utcDevice.isActive, false);
  assert.equal(utcDevice.pushToken, null);

  // 같은 분에 다시 실행해도 보내지 않음 (UNIQUE)
  sent.length = 0;
  await service.runOnce(new Date(now.getTime() + 10000));
  assert.equal(sent.filter(item => item.to.includes(suffix)).length, 0);

  // 다음 날 같은 시각에는 다시 발송
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  await service.runOnce(tomorrow);
  assert.deepEqual(sent.map(item => item.to).filter(to => to.includes(suffix)), [`ExponentPushToken[seoul_${suffix}]`]);
  const seoulLogs = await db.getRepository(NotificationLog).find({ where: { userId: seoul.userId }, order: { targetDate: 'ASC' } });
  assert.deepEqual(seoulLogs.map(row => row.targetDate), [ymd(day), ymd(tomorrow)]);
});
