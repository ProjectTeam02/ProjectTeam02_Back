/**
 * 학습 알림 스케줄러 (E-2)
 * 백엔드 작업: 매 분 0초 근처에 reminder.service.runOnce()를 실행
 * 주의: PUSH_SCHEDULER_ENABLED=true이고 테스트 환경이 아닐 때만 시작 (기본 꺼짐)
 *       이전 실행이 끝나지 않았으면 이번 분은 건너뛴다. 중복 발송은 DB UNIQUE가 한 번 더 막는다
 *       로그에는 건수만 남기고 사용자·토큰 정보는 남기지 않는다
 */
const env = require('../../config/env');

function createReminderScheduler({ service, intervalMs = 60000, logger = console, now = () => new Date() } = {}) {
  let timer = null;
  let firstTimer = null;
  let running = false;

  async function tick() {
    if (running) return { skipped: true };
    running = true;
    try {
      const result = await service.runOnce(now());
      if (result.reserved) logger.log(`[reminder] 대상 ${result.reserved}명, 성공 ${result.sent}, 실패 ${result.failed}, 기기 해제 ${result.deactivated}`);
      return result;
    } catch (error) {
      logger.error(`[reminder] 실행 실패: ${error?.code || error?.name || 'ERROR'}`);
      return { error: true };
    } finally {
      running = false;
    }
  }

  return {
    tick,
    start() {
      if (timer || firstTimer) return;
      // 다음 분 0초에 맞춰 시작한 뒤 1분마다 실행
      const delay = intervalMs - (Date.now() % intervalMs);
      firstTimer = setTimeout(() => {
        firstTimer = null;
        tick();
        timer = setInterval(tick, intervalMs);
        timer.unref?.();
      }, delay);
      firstTimer.unref?.();
    },
    stop() {
      clearTimeout(firstTimer);
      clearInterval(timer);
      firstTimer = null;
      timer = null;
    },
    isStarted: () => Boolean(timer || firstTimer),
  };
}

/** 서버 시작 때 호출. 켜져 있지 않으면 아무것도 하지 않고 null */
function startReminderScheduler({ config = env, logger = console } = {}) {
  if (!config.pushSchedulerEnabled || config.nodeEnv === 'test') return null;
  const { createPushClient } = require('./push.client');
  const service = require('./reminder.service')({ pushClient: createPushClient() });
  const scheduler = createReminderScheduler({ service, logger });
  scheduler.start();
  logger.log('[reminder] 학습 알림 스케줄러 시작 (1분 간격)');
  return scheduler;
}

module.exports = { createReminderScheduler, startReminderScheduler };
