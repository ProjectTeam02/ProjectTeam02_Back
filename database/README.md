# @leren/database

Leren app 스키마의 **TypeORM 엔티티 · 마이그레이션 · 검증 스크립트** 패키지입니다 (npm workspace).
설계 원본은 `docs/leren_erd.dbml` (rev.6, API 명세 58개 기준)입니다. ai 스키마(문서·청크·임베딩, pgvector)는 AI 서버(FastAPI)가 `ai_user` 계정으로 관리하고, 이 패키지는 스키마·계정만 만들어 둡니다(`sql/init/02_ai_schema.sql`).

## 구성

```
database/
  src/entities/              # 엔티티 40개 (영역별 폴더 7개) + common/enums.ts
  src/migrations/            # 마이그레이션 (Init부터 순서대로 쌓임)
  src/index.ts               # 패키지 진입점: AppDataSource, 엔티티, Enum
  src/data-source.ts         # 서버 실행용 (app_user)
  src/migration-data-source.ts  # 마이그레이션 전용 (migrator, TypeORM CLI용)
  src/scripts/seed-minimal.ts   # 검증용 최소 시드
  src/scripts/smoke.ts          # 엔티티 연동 테스트 19항목
  sql/init/01_app_schema.sql    # app 스키마 + 계정(migrator, app_user) 생성. 관리자 계정으로 최초 1회
  sql/init/02_ai_schema.sql     # pgvector 확장 + ai 스키마 + 계정(ai_user). 01 다음에 최초 1회
  sql/test/constraint_test.sql  # SQL 제약 테스트 47개 (빈 DB, app_user)
  sql/test/ai_schema_test.sql   # ai 스키마 검증 8개 (pgvector·권한 분리, ai_user)
  docs/leren_erd.dbml        # 설계 원본 (dbdiagram.io에 붙여 넣으면 ERD)
  docs/ENTITIES.md           # 테이블 ↔ 엔티티 ↔ 관계 대응표
  docs/VERIFICATION.md       # 검증 결과
```

## 서버에서 쓰기

```js
const { AppDataSource } = require('./config/database');          // 연결은 server.js에서 시작 시 1번
const { User, LearningAttempt, AttemptStatus } = require('@leren/database');

const users = AppDataSource.getRepository(User);
await users.findOneBy({ email });
```

- 엔티티 속성 이름 = API 필드 이름 (`itemId`, `submissionId` …). DTO도 같은 이름을 씁니다.
- Enum 값은 모두 대문자 (`ClassCode.Warrior === 'WARRIOR'`)
- 제약 이름이 고정되어 있어 중복 오류를 `err.driverError.constraint`로 구분할 수 있습니다 (예: `coin_ledger_request_id_key` = 같은 구매 requestId).
- 서버가 `require('@leren/database')`를 하려면 먼저 빌드되어 있어야 합니다. 루트의 `npm run dev`·`npm start`는 `db:build`를 자동으로 먼저 실행합니다.

## 명령어 (레포 루트에서 실행)

| 명령 | 하는 일 | 계정 |
|---|---|---|
| `npm run db:build` | 엔티티 컴파일 (`database/dist`) | — |
| `npm run db:migrate` | 아직 안 된 마이그레이션 실행 | migrator |
| `npm run db:migrate:show` | 적용된 마이그레이션 목록 (`[X]` = 적용됨) | migrator |
| `npm run db:check` | 엔티티와 DB 차이 확인 ("No changes"면 통과) | migrator |
| `npm run db:seed` | 검증용 최소 시드 | app_user |
| `npm run db:test` | 연동 테스트 19항목 (**테스트 데이터를 실제로 저장** → 빈 DB에서만) | app_user |
| `npm run migration:generate -w @leren/database -- src/migrations/<이름>` | 엔티티 변경분으로 새 마이그레이션 생성 | migrator |
| `npm run migration:revert -w @leren/database` | 마지막 마이그레이션 되돌리기 | migrator |

환경변수는 `database/.env` → 루트 `.env` 순서로 읽습니다 (루트 `.env.example` 참고). 이미 설정된 환경변수가 있으면 그 값이 우선입니다.

## Docker PostgreSQL 사용하기

```bash
cp .env.example .env
npm ci
docker compose up -d db              # PostgreSQL 16 + sql/init 자동 실행 (최초 1회)
npm run db:build
npm run db:migrate
npm run db:check                     # No changes in database schema were found
```

이 레포의 Docker API는 Compose의 PostgreSQL을 `db:5432`로 사용합니다.
FastAPI가 호스트의 Docker 컨테이너에서 `8000` 포트로 실행 중이면
`host.docker.internal:8000`에 연결합니다.

DB 연동 테스트가 필요한 경우에는 실제 데이터를 저장하므로 테스트 전용 DB에서만 실행합니다.

```bash
npm run db:test                      # 테스트 DB에서만 실행
```

## DB 계정

| 계정 | 용도 | 권한 |
|---|---|---|
| `migrator` | 마이그레이션 실행 | app 스키마 소유자 (테이블 생성·변경) |
| `app_user` | Node.js 서버 실행 | app 스키마 테이블 읽기·쓰기만 (삭제·변경 불가) |
| `ai_user` | AI 서버(FastAPI) 실행 | ai 스키마 소유자 (RAG 문서·청크·벡터 테이블). app 스키마 접근 불가 |

AI 서버 설정: `DATABASE_URL`은 `ai_user` 계정, `VECTOR_STORE_SCHEMA=ai`. 백엔드는 AI 응답의 `documentId`·`chunkId`를 `ai_message_sources`에 FK 없이 기록합니다.

## 구조를 바꿀 때

1. 엔티티 수정 (+ `docs/leren_erd.dbml` 같은 내용으로 수정)
2. 현재 마이그레이션까지 적용된 로컬 DB에서 `migration:generate`
3. 생성된 파일 검토
   - 이름 변경이 "삭제 후 추가"로 나오면 `RENAME`으로 고치기 (데이터 보존)
   - 두 테이블이 같은 Enum 타입을 쓰면 `CREATE TYPE`이 두 번 생김 → 두 번째 것 삭제 (Init의 `costume_category` 참고)
   - 생성 컬럼이 있으면 `typeorm_metadata`에 마이그레이션을 만든 DB 이름이 박힘 → `current_database()`로 바꾸기 (Init 참고)
4. PR → `db-check` 통과 → 병합. **이미 병합된 마이그레이션 파일은 수정하지 않습니다.**

운영·개발 DB에는 `synchronize`를 쓰지 않습니다.

## AWS RDS에 적용할 때

1. RDS PostgreSQL 16 생성 (Private, Public access OFF, SG-DB는 SG-EC2만 허용)
2. EC2에서 마스터 계정으로 `database/sql/init/01_app_schema.sql` → `02_ai_schema.sql` 순서로 실행 (비밀번호는 실제 값으로 변경, pgvector는 RDS PostgreSQL 16 기본 지원)
3. 환경변수는 Parameter Store에서 주입, `DB_SSL=true`와 RDS CA 인증서 지정
4. `npm run db:migrate` → `npm run db:migrate:show` → `npm run db:check`
5. `db:test`는 실제 데이터가 있는 DB에서 실행하지 않습니다 (테스트 데이터가 남음)

## 변경 이력

| rev | 마이그레이션 | 내용 |
|---|---|---|
| rev.5 | `Init` | 최초 스키마 (테이블 40개) |
| rev.6 | `AiMessageSourcesContract` | AI 내부 API 계약 반영: `ai_message_sources.document_version` 문자열·null 허용, `chunk_id` 필수, (message_id, document_id, chunk_id) 유니크. ai 스키마·`ai_user` 분리 |

## 서비스 코드에서 지킬 규칙 (DB 제약으로 강제 불가)

- `user_growth`·`user_wallets`, `review_items.wrong_count`·`last_answer_result`는 원장·제출 기록과 **같은 트랜잭션**에서만 갱신
- 온보딩: `user_characters` → 기본 코스튬 `user_costumes`(DEFAULT) → `user_equipped_costumes` 순서
- 장착: `upsert({ userId, category, itemId }, ['userId', 'category'])` → 같은 부위 이전 코스튬 자동 교체
- 응시 시작 전 남은 `IN_PROGRESS` 응시를 `ABANDONED`로 끝내거나 이어서 반환
- 퀴즈 `submissionId`(UUID 형식 검증)는 `insert`, PK 중복이면 기존 채점 결과 반환. 복습은 시작 시 답안 행을 미리 만들고 제출 때 `update`
- 선택지는 문항당 4개·정답 1개, NORMAL Stage의 `stage_concepts`는 1행
- `concept_code`, `question_code`, `document_id`, `chunk_id`, `coin_ledger.ref_id`는 FK 없는 논리 참조 → 저장 시 존재 여부 검증
- AI 일일 한도는 서버 설정값 + 오늘 `usageDate`의 TUTOR 요청 수 (`usageDate`는 넣지 않음)
- 회원 탈퇴: `accountStatus = WITHDRAWN`과 `withdrawnAt`을 함께 기록, 개인정보 비우기, 학습·보상 기록 유지
- AI 근거 저장: 내부 API 응답 `sources[]`를 그대로 저장 (`documentVersion`은 null 가능). 내부 API 요청 DTO는 질문·메시지 4,000자, history 50개, summary 12,000자 이하
- API 응답에는 엔티티 대신 DTO 사용 (`passwordHash`, 제출 전 `isCorrect` 노출 금지)
