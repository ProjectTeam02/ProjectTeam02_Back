# Leren Backend

Leren 경제·금융 마이크로러닝 서비스의 Node.js/Express 백엔드입니다.
애플리케이션 코드는 `src/`, PostgreSQL TypeORM 엔티티와 마이그레이션은 `database/` 패키지에 둡니다.

## 프로젝트 구조

```text
ProjectTeam02_Back/
├── database/                  # TypeORM 엔티티·마이그레이션·DB 검증
├── src/
│   ├── app.js                 # Express 앱, 공통 미들웨어, Swagger
│   ├── server.js              # 환경변수 로딩, DB 연결, 서버 실행
│   ├── common/                # 오류·미들웨어·응답·공통 유틸리티
│   ├── config/                # 환경변수·DB·CORS·Swagger 설정
│   ├── clients/               # FastAPI·Kakao 외부 통신 클라이언트
│   ├── modules/               # 기능별 Controller·Service·Repository·DTO
│   └── routes/index.js        # 기능별 라우터 통합
├── tests/                     # 통합·단위 테스트 위치
├── docs/                      # API·DB·검증 문서
└── package.json
```

### `src/common`

- `errors/`: 공통 오류 객체와 오류 코드
- `middleware/`: 인증, 검증, 요청 ID, 오류 처리 등 Express 미들웨어
- `response/`: 성공·실패 응답 형식
- `utils/`: 비동기 핸들러, 날짜, 페이지네이션, 토큰 등 공통 함수

### `src/modules`

기능별로 HTTP 계층과 도메인 계층을 함께 둡니다.

```text
src/modules/{feature}/
├── {feature}.routes.js       # API 경로와 Controller 연결
├── {feature}.controller.js   # HTTP 요청·응답 처리
├── {feature}.service.js      # 비즈니스 흐름과 정책
├── *.repository.js           # PostgreSQL 접근
├── *.schema.js               # 요청값 검증 규칙
├── repositories/             # 규모가 큰 기능의 Repository 모음
└── dto/                      # 요청·응답 데이터 형식
```

현재 저장소의 기능별 파일은 개발 스캐폴드이며, 실제 API가 구현되기 전에는 빈 라우터 또는 빈 모듈을 노출하지 않습니다. 구현되지 않은 기능을 완료된 API로 문서화하지 않습니다.

## 실행

```bash
npm install
cp .env.example .env
docker compose up -d db
npm run db:migrate
npm run dev
```

`npm run dev`는 먼저 `database` 패키지를 빌드한 후 `src/server.js`를 실행합니다. 기본 포트는 `3000`이며 `.env`의 `PORT`로 변경할 수 있습니다.

기본 상태 확인:

```bash
curl http://localhost:3000/health
```

PostgreSQL 연결 설정은 `src/config/database.js`와 `database/` 패키지에서 관리합니다. DB 스키마를 변경할 때는 기존 마이그레이션과 팀의 DB 변경 절차를 먼저 확인하세요.

## API 요청 흐름

```text
React Native
    ↓
server.js → app.js
    ↓
src/routes/index.js
    ↓
기능별 routes
    ↓
Controller → Service → Repository / Client
    ↓
PostgreSQL / FastAPI / Kakao
```

- Controller는 요청값을 읽고 Service를 호출합니다.
- Service는 비즈니스 흐름을 조합합니다.
- Repository는 PostgreSQL 접근만 담당합니다.
- 외부 서버 통신은 `src/clients/`에서 담당합니다.
- DB 엔티티와 마이그레이션은 `database/` 패키지 소유입니다.

## 신규 API 개발 순서

```text
1. API 명세 확인
        ↓
2. Routes 작성
        ↓
3. Validation / DTO 작성
        ↓
4. Repository 작성
        ↓
5. Service 작성
        ↓
6. Controller 작성
        ↓
7. Swagger 문서 작성
        ↓
8. API 테스트
```

예를 들어 인증 API를 추가할 때는 `src/modules/auth/auth.routes.js`에 경로를 연결하고, `auth.controller.js`에서 요청·응답을 처리하며, `auth.service.js`와 `repositories/`에 정책과 DB 접근을 분리합니다. 요청·응답 형식은 `dto/`, 입력 규칙은 `auth.schema.js`에 둡니다.

기존 API의 URL, HTTP Method, 요청 필드, 응답 JSON, 상태 코드는 명세와 기존 클라이언트 호환성을 확인하지 않고 변경하지 않습니다.

## FastAPI 및 Kakao 연동

AI Tutor 기능은 다음 흐름을 사용합니다.

```text
Tutor Routes → Tutor Controller → Tutor Service → fastapi.client.js → FastAPI
```

FastAPI URL, 내부 인증 토큰, Timeout은 환경변수로 관리하고 `src/clients/fastapi.client.js`에서 통신 책임을 분리합니다. Kakao OAuth 요청은 `src/clients/kakao.client.js`에서 관리하며 토큰과 Secret을 로그나 소스에 기록하지 않습니다.

## Swagger

Swagger UI와 OpenAPI JSON은 `src/config/swagger.config.js`를 기준으로 제공합니다.

- Swagger UI: `http://localhost:3000/api-docs/`
- 호환 경로: `http://localhost:3000/docs/`
- OpenAPI JSON: `http://localhost:3000/api-docs.json`

문서에는 실제 구현된 API만 추가합니다. 라우터의 경로·Method·인증 방식·요청 Body·응답 Schema·상태 코드가 실제 코드와 일치하는지 확인합니다.

## 테스트 및 검증

```bash
npm test
npm run db:build
npm run db:check
npm run db:test
```

DB 명령은 PostgreSQL이 실행 중이고 `.env`가 올바르게 설정된 환경에서 실행합니다. 외부 FastAPI나 DB에 연결할 수 없는 경우 해당 검증은 미검증으로 기록하고, 테스트를 통과한 것으로 간주하지 않습니다.

## 작업 규칙

- `main`, `develop`에 직접 작업하지 않습니다.
- DB 스키마와 운영 데이터를 임의로 변경하지 않습니다.
- 인증 정보와 API Key를 커밋하지 않습니다.
- 기능 구현 전 스캐폴드 파일에 비즈니스 로직을 임의로 추가하지 않습니다.
- 파일 상단의 한국어 안내 주석은 담당 계층과 작업 위치를 설명하는 용도로 유지합니다.
