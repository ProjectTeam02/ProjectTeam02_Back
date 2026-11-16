# 최초 퀴즈 보상: 격리 DB에서 기준 데이터 확인

마이그레이션만 적용한 DB에서는 퀴즈 채점은 진행되지만, 레벨 기준이 없다면 최초 통과 보상 처리에서 `503`을 받을 수 있습니다. 아래 명령은 운영에 접속하지 않고 격리된 로컬 DB에서 이를 먼저 탐지하기 위한 읽기 전용 진단입니다. 배포 파이프라인이나 서비스 API를 바꾸지 않습니다.

```bash
npm run db:build
LEREN_LOCAL_SEED_CHECK=1 DB_HOST=127.0.0.1 DB_PORT=5432 DB_NAME=leren_it DB_USER=app_user node scripts/check-quiz-reward-seed.js
```

격리 DB의 실제 로컬 포트와 이름을 넣고, 접속에 필요한 비밀번호는 환경변수로 전달합니다. 명령은 `ACCOUNT`와 `ECONOMY`에 레벨 1, 필요 EXP 0인 행이 있는지만 확인합니다. 결과 코드는 준비됨이면 0, 누락이면 1, 접속·스키마·사용 오류면 2입니다.

누락인 경우 팀에서 지정한 기준 데이터 적용 절차와 `database/sql/seed/01_master_data.sql`을 확인한 뒤 다시 검사합니다. 이 명령은 시드를 자동으로 넣거나 기존 값을 바꾸지 않습니다.
