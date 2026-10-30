# Leren Backend

Leren 경제·금융 마이크로러닝 서비스의 Node.js/Express 백엔드입니다.
PostgreSQL 16과 TypeORM을 사용하며, 엔티티·마이그레이션은 `database/` 패키지(`@leren/database`)에서 관리합니다.

## 프로젝트 구조

```text
ProjectTeam02_Back/
├── database/                  # TypeORM 엔티티·마이그레이션·DB 검증
├── src/
│   ├── app.js                 # Express 앱, 공통 오류 처리, Swagger
│   ├── server.js              # 환경변수 로딩, DB 연결, 서버 실행
│   ├── common/                # 오류·인증·검증·응답·공통 유틸리티
│   ├── config/                # 환경변수·DB·Swagger 설정
│   ├── clients/               # FastAPI·Kakao 외부 통신
│   ├── health/                # DB·FastAPI 상태 확인 라우터
│   ├── modules/               # 기능별 Controller·Service·Repository·DTO
│   └── routes/index.js        # `/api/v1` 기능별 라우터 통합
├── tests/                     # 단위·통합 테스트 위치
├── test/                      # 현재 API 회귀 테스트
├── docs/                      # API·DB·검증 문서
└── package.json
```

### 기능별 모듈 계층

```text
src/modules/{feature}/
├── {feature}.routes.js       # API 경로와 Middleware·Controller 연결
├── {feature}.controller.js   # HTTP 요청·응답 처리
├── {feature}.service.js      # 비즈니스 로직과 정책
├── *.repository.js           # PostgreSQL 접근
├── *.schema.js               # 요청값 검증
├── repositories/             # 기능별 세부 Repository
└── dto/                      # 요청·응답 데이터 형식
```

Controller는 Service를 호출하고, Service는 Repository 또는 외부 Client를 조합합니다. DB 엔티티와 마이그레이션은 `database/` 패키지의 책임입니다.

## 실행

```bash
npm install
cp .env.example .env
docker compose up -d db
npm run db:migrate
npm run dev
```

`npm run dev`는 database 패키지를 먼저 빌드한 뒤 서버를 실행합니다. 기본 포트는 `3000`입니다.

Docker로 API까지 실행하려면 다음 명령을 사용합니다.

```bash
docker compose up -d --build api
```

컨테이너 환경에서 API는 PostgreSQL에 `db:5432`, 호스트의 FastAPI에는 `host.docker.internal:8000`으로 연결합니다.

상태 확인:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/health/ready
```

## API 요청 흐름

```text
React Native
    ↓
server.js → app.js → src/routes/index.js
    ↓
기능별 Routes → Controller → Service
    ↓
Repository / Client → PostgreSQL / FastAPI / Kakao
```

## 구현된 API

### Auth

- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/kakao`

### Users

- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me/notifications`

### AI Tutor

- `POST /api/v1/tutor/conversations`
- `GET /api/v1/tutor/conversations`
- `GET /api/v1/tutor/conversations/:id/messages`
- `POST /api/v1/tutor/messages`
- `GET /api/v1/tutor/usage`

### Quizzes

- `GET /api/v1/quizzes/generate`
- `POST /api/v1/quizzes/:id/submit`

### Health

- `GET /health`
- `GET /api/v1/health/ready`
- `GET /api/v1/health/dependencies`

`questions`, `learning`, `stages`, `concepts`, `reviews`, `calendar`, `characters`, `costumes`, `notifications`, `recommendations`, `rewards`, `topics` 모듈의 파일 구조는 유지하고, 실제 엔드포인트 구현 전에는 기능을 완료된 API로 표시하지 않습니다.

## FastAPI 및 Kakao 연동

AI Tutor 요청은 Node.js가 인증·대화 저장·사용량을 관리하고 `src/clients/fastapi.client.js`를 통해 FastAPI의 `POST /internal/v1/tutor/answer`로 전달합니다. URL·내부 인증 토큰·Timeout은 환경변수로 관리합니다.

Kakao OAuth 통신은 `src/clients/kakao.client.js`에서 담당하며, OAuth 토큰과 Secret을 코드나 로그에 남기지 않습니다.

## Swagger

- Swagger UI: `http://localhost:3000/api-docs`
- 호환 경로: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/api-docs.json`

문서에는 실제 라우터에 연결된 API만 추가합니다. 경로, HTTP Method, JWT Bearer 인증, Request Body, Response Schema, 상태 코드가 구현과 일치해야 합니다.

## 신규 API 개발 순서

```text
1. API 명세 확인
2. Routes 작성
3. Validation / DTO 작성
4. Repository 작성
5. Service 작성
6. Controller 작성
7. Swagger 문서 작성
8. API 테스트
```

기존 API의 URL, HTTP Method, 요청 필드, 응답 JSON, 상태 코드는 클라이언트 호환성을 확인하지 않고 변경하지 않습니다.

## 테스트 및 검증

```bash
npm test
npm run db:build
npm run db:check
npm run db:test
```

`npm test`는 database workspace를 먼저 빌드한 뒤 API 테스트를 실행합니다. DB·FastAPI에 연결할 수 없는 환경에서는 해당 검증을 미검증으로 기록합니다.

DB 스키마 변경과 운영 데이터 수정은 임의로 수행하지 말고 기존 마이그레이션 및 팀 DB 변경 절차를 따릅니다.
