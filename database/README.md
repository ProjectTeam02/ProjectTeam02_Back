# @leren/database

Leren app 스키마의 **TypeORM 엔티티 · 마이그레이션 · 검증 스크립트** 패키지입니다 (npm workspace).
설계 원본은 `docs/leren_erd.dbml` (rev.8, API 명세 58개 기준)입니다. ai 스키마(문서·청크·임베딩, pgvector)도 **DB 담당이 DDL을 관리**합니다: 스키마·계정은 `sql/init/02_ai_schema.sql`, RAG 메타 테이블은 `sql/init/03_ai_tables.sql`, 벡터 테이블은 `sql/init/04_ai_vector_table.sql`(모두 소유자 `ai_user`). 벡터 검색 인덱스는 `sql/ai/vector_indexes.sql`로 추가합니다. AI 관련 DB 전체 현황은 `docs/AI_DB.md`.

## 구성

```
database/
  src/entities/              # 엔티티 46개 (영역별 폴더 7개) + common/enums.ts
  src/migrations/            # 마이그레이션 (Init부터 순서대로 쌓임)
  src/index.ts               # 패키지 진입점: AppDataSource, 엔티티, Enum
  src/data-source.ts         # 서버 실행용 (app_user)
  src/migration-data-source.ts  # 마이그레이션 전용 (migrator, TypeORM CLI용)
  src/scripts/seed-minimal.ts   # 검증용 최소 시드
  src/scripts/smoke.ts          # 엔티티 연동 테스트 21항목
  sql/init/01_app_schema.sql    # app 스키마 + 계정(migrator, app_user) 생성. 관리자 계정으로 최초 1회
  sql/init/02_ai_schema.sql     # pgvector 확장 + ai 스키마 + 계정(ai_user). 01 다음에 최초 1회
  sql/init/03_ai_tables.sql     # ai 스키마 RAG 메타 테이블 3개 + app_user 읽기 권한. 02 다음에 (여러 번 실행해도 안전)
  sql/init/04_ai_vector_table.sql # ai 스키마 벡터 테이블 ai.data_projectteam02 (LlamaIndex 구조). 03 다음에 (여러 번 실행해도 안전)
  sql/ai/vector_indexes.sql     # 벡터 테이블 HNSW·metadata 인덱스. AI가 처음 적재한 뒤 1회 (ai_user)
  sql/test/constraint_test.sql  # SQL 제약 테스트 86개 (빈 DB, app_user)
  sql/test/ai_schema_test.sql   # ai 스키마 검증 8개 (pgvector·권한 분리, ai_user)
  sql/test/ai_tables_test.sql   # ai RAG 테이블 검증 12개 (ai_user)
  docs/leren_erd.dbml        # 설계 원본 (dbdiagram.io에 붙여 넣으면 ERD)
  docs/ENTITIES.md           # 테이블 ↔ 엔티티 ↔ 관계 대응표
  docs/AI_DB.md              # AI 관련 DB 현황·멀티턴 메모리 사용 규칙·AI 서버 전달 사항
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
| `npm run db:test` | 연동 테스트 21항목 (**테스트 데이터를 실제로 저장** → 빈 DB에서만) | app_user |
| `npm run migration:generate -w @leren/database -- src/migrations/<이름>` | 엔티티 변경분으로 새 마이그레이션 생성 | migrator |
| `npm run migration:revert -w @leren/database` | 마지막 마이그레이션 되돌리기 | migrator |

환경변수는 `database/.env` → 루트 `.env` 순서로 읽습니다 (루트 `.env.example` 참고). 이미 설정된 환경변수가 있으면 그 값이 우선입니다.

## Docker PostgreSQL 사용하기

```bash
cp .env.example .env
npm ci
docker compose up -d db              # PostgreSQL 18 + sql/init 01→02→03 자동 실행 (최초 1회)
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
| `ai_user` | AI 서버(FastAPI) 실행 | ai 스키마 테이블 소유자 (DDL은 DB 담당이 03·04 파일로 관리, AI 서버는 테이블을 만들지 않음). app 스키마 접근 불가 |

AI 서버 설정: `DATABASE_URL`은 `ai_user` 계정, `VECTOR_STORE_SCHEMA=ai` (빠지면 public에 만들려다 권한 오류). AI 서버는 `create_tables()`·`migrations/*.sql`을 RDS에서 실행하지 않습니다. 백엔드(`app_user`)는 `ai.rag_documents`만 읽을 수 있고, AI 응답의 `documentId`·`chunkId`를 `ai_message_sources`에 FK 없이 기록합니다.

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

1. RDS PostgreSQL 18 생성 (Private, Public access OFF, SG-DB는 SG-EC2만 허용)
2. EC2에서 마스터 계정으로 `database/sql/init/01_app_schema.sql` → `02_ai_schema.sql` → `03_ai_tables.sql` → `04_ai_vector_table.sql` 순서로 실행 (비밀번호는 실제 값으로 변경, pgvector는 RDS PostgreSQL 18 기본 지원)
3. 환경변수는 Parameter Store에서 주입, `DB_SSL=true`와 RDS CA 인증서 지정
4. `npm run db:migrate` → `npm run db:migrate:show` → `npm run db:check`
5. `db:test`는 실제 데이터가 있는 DB에서 실행하지 않습니다 (테스트 데이터가 남음)

## 변경 이력

| rev | 마이그레이션 | 내용 |
|---|---|---|
| rev.5 | `Init` | 최초 스키마 (테이블 40개) |
| rev.6 | `AiMessageSourcesContract` | AI 내부 API 계약 반영: `ai_message_sources.document_version` 문자열·null 허용, `chunk_id` 필수, (message_id, document_id, chunk_id) 유니크. ai 스키마·`ai_user` 분리 |
| rev.7 | `AiMultiturnMemory` + `03_ai_tables.sql` | 멀티턴 메모리: `ai_conversation_summaries`(요약 이력), `ai_messages.summary_id`, `ai_user_memories`(장기 메모리), `ai_conversations` 요약 짝 CHECK, `ai_message_sources` 길이 확장. ai 스키마 `rag_documents`·`rag_document_chunks`·`rag_index_configurations` + app_user 읽기 권한 |
| rev.8 | `GlossaryBadgeGoal` | 피그마 화면 검토 반영: `glossary_terms`·`concept_terms`(개념별 용어), `badges`·`user_badges`(배지), `user_settings.daily_goal_count` → `goal_count`(값 보존 RENAME) + `goal_period`(WEEKLY), `concept_sections` page_no·sort_order >= 1 |
| — | `KakaoOAuthEntries`, `ContentDefaultPublished` | 카카오 OAuth 임시 저장소, 토픽·스테이지·개념 기본 상태 PUBLISHED |
| #96 | `04_ai_vector_table.sql` | ai 벡터 테이블 `ai.data_projectteam02` 정의를 백엔드로 이관 (LlamaIndex 구조와 동일) |
| #97 | `QuestionConstraints` | `question_choices.choice_text` 255 → 500(값 보존), 문항당 정답 1개(부분 유니크), 문제 본문·해설·선택지 공백 금지, AI 문항 근거 필수 CHECK, `questions.question_category`·`learning_objective` 추가 |

## 서비스 코드에서 지킬 규칙 (DB 제약으로 강제 불가)

- `user_growth`·`user_wallets`, `review_items.wrong_count`·`last_answer_result`는 원장·제출 기록과 **같은 트랜잭션**에서만 갱신
- 온보딩: `user_characters` → 기본 코스튬 `user_costumes`(DEFAULT) → `user_equipped_costumes` 순서
- 장착: `upsert({ userId, category, itemId }, ['userId', 'category'])` → 같은 부위 이전 코스튬 자동 교체
- 응시 시작 전 남은 `IN_PROGRESS` 응시를 `ABANDONED`로 끝내거나 이어서 반환
- 퀴즈 `submissionId`(UUID 형식 검증)는 `insert`, PK 중복이면 기존 채점 결과 반환. 복습은 시작 시 답안 행을 미리 만들고 제출 때 `update`
- 선택지는 문항당 4개·정답 1개, NORMAL Stage의 `stage_concepts`는 1행
- 던전 흐름(rev.8): 입장 → 개념 학습(`concept_sections`) → 전투. 학습 마지막 페이지에서만 전투 시작 가능(`read_completed_at`, 건너뛰기 없음). BOSS Stage는 학습 카드 없이 전투만 (`content_position` 저장 요청 거부)
- 학습 화면 헤드라인 = `concepts.short_definition`. 생활 속 예시는 EXAMPLE 카드 `body`(텍스트)
- 클리어 화면 "학습 키워드 N개" = 던전 개념의 `concept_terms` 수 (`concept_code` 기준)
- 목표 달성률(rev.8): `goal_count`가 null이면 표시 안 함. 기간은 `goal_period = WEEKLY` → 이번 주(월요일 00:00, `timezone` 기준) 실적 ÷ `goal_count`
- 배지(rev.8): 지급 조건 미정. 조건을 확인하는 트랜잭션에서 `user_badges` INSERT, PK 중복(23505)이면 이미 받은 배지로 처리. 탈퇴 후에도 유지
- `concept_code`, `question_code`, `document_id`, `chunk_id`, `coin_ledger.ref_id`는 FK 없는 논리 참조 → 저장 시 존재 여부 검증
- AI 일일 한도는 서버 설정값 + 오늘 `usageDate`의 TUTOR 요청 수 (`usageDate`는 넣지 않음)
- 회원 탈퇴: `accountStatus = WITHDRAWN`과 `withdrawnAt`을 함께 기록, 개인정보 비우기, 학습·보상 기록 유지
- AI 근거 저장: 내부 API 응답 `sources[]`를 그대로 저장 (`documentVersion`은 null 가능). 내부 API 요청 DTO는 질문·메시지 4,000자, history 50개, summary 12,000자 이하
- API 응답에는 엔티티 대신 DTO 사용 (`passwordHash`, 제출 전 `isCorrect` 노출 금지)
- 멀티턴 요약(rev.7): 요약을 받으면 한 트랜잭션에서 `ai_conversation_summaries` INSERT → `ai_conversations.summary`·`summary_until_seq` UPDATE (조건: 기존 `summary_until_seq`가 내가 읽은 값과 같을 때). 답변 저장 시 그때 보낸 요약의 `summary_id`를 assistant 메시지에 기록
- 장기 메모리(rev.7): `memory_key`가 있으면 (user_id, memory_type, memory_key)로 upsert, 없애는 건 DELETE 대신 `status = ARCHIVED` + `archived_at`. 요청에는 ACTIVE만 담고 `last_used_at` 갱신
- 회원 탈퇴 시 AI 데이터 (2026-11-03 결정: 행은 남기고 본문만 비움, 한 트랜잭션): 메시지 `content = ''`·`rewritten_query`·`summary_id` null → `ai_conversation_summaries` 삭제 → 대화방 `title`·`summary`·`summary_until_seq` null → `ai_user_memories` 삭제. 근거(`ai_message_sources`)·사용량(`ai_requests`)은 개인 내용이 없어 유지 (`sql/test/constraint_test.sql` 63~67)
