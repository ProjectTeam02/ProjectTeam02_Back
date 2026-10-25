# Leren BackEnd

Leren 서비스의 Node.js/Express 백엔드입니다. DB는 PostgreSQL 16 + TypeORM이며, 엔티티·마이그레이션은 `database/` 패키지(`@leren/database`)에 있습니다.

## 실행

```bash
npm install
cp .env.example .env
docker compose up -d db     # 로컬 PostgreSQL (최초 1회 app 스키마·계정 생성)
npm run db:migrate          # 테이블 생성
npm run dev                 # database 패키지 빌드 후 서버 실행
```

기본 상태 확인 주소: `GET /health`

## DB

- 사용법·명령어: [`database/README.md`](database/README.md)
- 엔티티 목록: [`database/docs/ENTITIES.md`](database/docs/ENTITIES.md)
- 담당·변경 절차: [`docs/database-ownership.md`](docs/database-ownership.md)
