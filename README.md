# Leren BackEnd

Leren 서비스의 Node.js/Express 백엔드입니다.
DB는 PostgreSQL 16 + TypeORM이며, 엔티티·마이그레이션은 `database/` 패키지(`@leren/database`)에 있습니다.

## 실행

```bash
npm install
cp .env.example .env
docker compose up -d db     # 로컬 PostgreSQL (최초 1회 app 스키마·계정 생성)
npm run db:migrate          # 테이블 생성
npm run dev                 # database 패키지 빌드 후 서버 실행
```

기본 상태 확인 주소: `GET /health`

## 업데이트

```bash
git pull                       #코드 최신으로 업데이트
npm install                    #바뀐 의존성 설치
docker compose down -v         #예전 로컬 db 제거
docker compose up -d db	       #새 로컬 db 띄우고, 스키마-계정 자동 생성
npm run db:migrate             #테이블 생성
```


## DB

- 사용법·명령어: [`database/README.md`](database/README.md)
- 엔티티 목록: [`database/docs/ENTITIES.md`](database/docs/ENTITIES.md)
- 담당·변경 절차: [`docs/database-ownership.md`](docs/database-ownership.md)

## API

- Swagger UI: `http://localhost:3000/api-docs`
- OpenAPI JSON: `http://localhost:3000/api-docs.json`
- AI Tutor 요청은 Node.js가 인증·대화 저장·사용량을 담당하고 FastAPI의
  `POST /internal/v1/tutor/answer`로 추론을 위임합니다.
- `npm test`는 database workspace를 먼저 빌드한 뒤 API 단위 테스트를 실행합니다.
