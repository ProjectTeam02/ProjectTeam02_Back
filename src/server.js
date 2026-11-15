/**
 * 백엔드 서버 실행
 * 백엔드 작업: 환경변수 로딩·DB 연결·HTTP 서버 실행을 관리
 * 주의: 기존 포트와 DB 연결 실패 처리를 유지한다.
 */
/**
 * 백엔드 서버 실행 파일
 * 백엔드 작업: 환경변수 로딩, DB 연결, HTTP 서버 실행 상태 관리
 * 주의: 기존 포트와 DB 연결 실패 처리 정책 유지
 */
require('dotenv').config();

const app = require('./app');
const { connectDatabase } = require('./config/database');
const { startReminderScheduler } = require('./modules/notifications/reminder.scheduler');

const port = process.env.PORT || 3000;

connectDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
      // 학습 알림 스케줄러: PUSH_SCHEDULER_ENABLED=true일 때만 시작 (기본 꺼짐)
      startReminderScheduler();
    });
  })
  .catch((err) => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });
