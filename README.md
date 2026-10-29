# Leren BackEnd

Leren 서비스의 Node.js/Express 백엔드입니다.
DB는 PostgreSQL 16 + TypeORM이며, 엔티티·마이그레이션은 `database/` 패키지(`@leren/database`)에 있습니다.

## 실행

```bash
npm install
cp .env.example .env
docker compose up -d db     # Docker PostgreSQL (최초 1회 app 스키마·계정 생성)
npm run db:migrate          # 테이블 생성
npm run dev                 # 호스트에서 실행할 때
```

Docker로 API까지 실행할 때는 Compose의 PostgreSQL과 기존 FastAPI(8000) 컨테이너를 함께 사용합니다.

```bash
docker compose up -d --build api
```

API 컨테이너는 PostgreSQL에 `db:5432`로 접속하고, FastAPI에는 `host.docker.internal:8000`으로 접속합니다.

기본 상태 확인 주소: `GET /health`

## 업데이트

```bash
git pull                       #코드 최신으로 업데이트
npm install                    #바뀐 의존성 설치
docker compose up -d db        # Docker PostgreSQL 실행
npm run db:migrate             # 기존 leren DB에 필요한 마이그레이션 적용
docker compose up -d --build api # API 컨테이너 재빌드·실행
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
