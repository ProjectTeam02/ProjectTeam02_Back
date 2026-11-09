# Entity 작성 및 검증 결과 (v3 rev.5)

- 검증일: 2026-10-26
- 대상: app 스키마 TypeORM 엔티티 40개 (`database/docs/leren_erd.dbml` rev.5 기준), 백엔드 레포 `database/` 워크스페이스
- 환경: PostgreSQL 18 (빈 DB), Node.js 20, TypeORM 0.3.20, TypeScript 5.4.5 (strict)
- 방식: 운영과 같은 권한 구조 — 스키마 변경은 `migrator`, 데이터 저장은 `app_user`

## 1. 컴파일 · 스키마 생성

| 항목 | 기준 | 결과 |
|---|---|---|
| TypeScript 컴파일 (strict) | 오류 0 | 통과 |
| 마이그레이션 생성 (`migration:generate`) | 빈 DB 기준 Init 1개 | 통과 (공유 Enum 중복 문장 1쌍 정리, 생성 컬럼 메타데이터를 실행 DB 이름으로 기록) |
| DB 이름이 달라도 차이 없음 | `leren`, `leren_ci`, `leren_ci_sql` | 3곳 모두 `migration:check` 통과 |
| 마이그레이션 실행 / 되돌리기 / 재실행 | 오류 없음 | 통과 |
| 테이블 · 컬럼 | 40 · 445 | 40 · 445 |
| FK (복합 4개 포함) · CHECK · 유니크 제약 | 73 · 16 · 13 | 73 · 16 · 13 |
| Enum 타입 | 50 | 50 |
| 엔티티 ↔ DB 차이 (`migration:check`) | 차이 없음 | 통과 |

## 2. 설계 DB와 비교

rev.5 DBML로 만든 SQL(`leren_v3_schema.sql`)의 DB와 엔티티 마이그레이션 DB를 카탈로그로 비교했습니다 (컬럼 타입·NOT NULL·기본값·생성 컬럼, 제약·인덱스 이름과 정의, Enum 값).

| 비교 항목 | 결과 |
|---|---|
| 624개 항목 | 617개 완전 일치 |
| 차이 7개 | smallint 기본값 표기만 다름 (`0` ↔ `'0'::smallint`, 같은 값) |

## 3. SQL 제약 테스트 (`database/sql/test/constraint_test.sql`, app_user)

엔티티 마이그레이션으로 만든 빈 DB에서 **43/43 PASS** (설계 DB와 같은 결과).

## 4. 엔티티 연동 테스트 (`npm run db:test`, app_user, 19항목)

| # | 항목 | 기대 결과 | 판정 |
|---|---|---|---|
| 1 | 회원가입 (users·growth·wallet·settings + 필수 약관 동의) | 5개 테이블 저장, 필수 약관 3개 동의 | PASS |
| 2 | 온보딩: 직업 선택 → 기본 코스튬 지급 → 부위별 장착 | 상의·하의 각 1개 장착, 관계 조회 | PASS |
| 3 | 보유하지 않은 코스튬 장착 | 복합 FK로 거부 | PASS |
| 4 | 주제 해금 계산 | 선수 주제 없는 주제만 열림 | PASS |
| 5 | 같은 Stage 두 번째 진행 중 응시 | 부분 유니크로 거부 | PASS |
| 6 | 2문항 정답 → 통과 (앱이 만든 submissionId) | attempt·진행도 PASSED, 선택지 관계 조회 | PASS |
| 7 | 같은 submissionId 재제출 | PK 중복으로 거부 | PASS |
| 8 | 다른 문항의 선택지로 제출 | 복합 FK로 거부 | PASS |
| 9 | 최초 통과 보상 트랜잭션 | 원장 기록 + 전체 +30 / 경제 +20 EXP, 코인 50 | PASS |
| 10 | 같은 Stage 보상 재지급 | 거부, 잔액 유지 | PASS |
| 11 | 트랜잭션 중간 오류 | 전체 롤백 | PASS |
| 12 | 코스튬 구매 → 같은 requestId 재요청 → 교체 장착 | 부족 시 거부, 구매, 재요청 거부, 상의 1행 유지 | PASS |
| 13 | 오답 등록 → 재등록 → 북마크 | 문제당 1행 유지 | PASS |
| 14 | 복습: 답안 행 미리 발급 → 제출 | submissionId로 UPDATE, HP 없음 | PASS |
| 15 | 학습 일정 제목 31자 | 거부 | PASS |
| 16 | 소문자 Enum 값 | 거부 | PASS |
| 17 | AI 멀티턴 한 턴 | usage_date KST, 답변 대기 1개·clientMessageId 중복 거부 | PASS |
| 18 | 회원 탈퇴 | 시각 없는 탈퇴 거부, 탈퇴 후 같은 이메일 재가입 | PASS |
| 19 | app_user로 DROP TABLE | 권한 오류 | PASS |

결과: **19/19 PASS**

## 5. 백엔드 레포 연동

| 항목 | 결과 |
|---|---|
| 루트 `npm ci` (워크스페이스 포함, 새 package-lock.json) | 통과 |
| 기존 CI `npm test` | 통과 (테스트 파일 0개, 실패 0) |
| `require('@leren/database')` | 엔티티 40개, AppDataSource, Enum 로드 |
| `npm start` → DB 연결 → `GET /health` | 200 응답 / 잘못된 비밀번호면 즉시 종료 |

## 6. rev.6 변경 검증 (2026-10-26, AI 내부 API 계약 반영)

| 항목 | 결과 |
|---|---|
| 새 마이그레이션 `AiMessageSourcesContract` (빈 DB, Init → rev.6 순서) | 통과, `db:check` 차이 없음 |
| 기존 DB(Init + 데이터)에 적용 | 통과. `document_version` 값 보존 (2026 → '2026'), 행 삭제 없음 |
| `chunk_id`가 NULL인 기존 행이 있을 때 | 안내 메시지와 함께 중단, DB 변경 없음 (트랜잭션 롤백) |
| 되돌리기 → 다시 실행 | 통과 (문자·null 버전은 0으로 복귀) |
| SQL 제약 테스트 | **47/47 PASS** (추가 4개: 문자열 버전 저장, null 버전 허용, chunkId 없음 거부, 같은 근거 중복 거부) |
| ai 스키마 검증 (`sql/test/ai_schema_test.sql`, ai_user) | **8/8 PASS** (pgvector 설치, 기본 스키마 ai, 1536차원 벡터 저장·검색, 차원 불일치 거부, app 스키마 접근 거부, public 생성 거부) |
| 연동 테스트 | 19/19 PASS |

## 7. rev.7 변경 검증 (2026-11-02, 멀티턴 메모리 + ai 스키마 테이블)

환경: 로컬 PostgreSQL 16.15 + pgvector 0.6 (CI·RDS는 18), 운영과 같은 계정 구조. 자세한 설명은 `AI_DB.md`.

| 항목 | 결과 |
|---|---|
| 새 마이그레이션 `AiMultiturnMemory` (빈 DB, Init → rev.6 → rev.7) | 통과, `db:check` 차이 없음, 엔티티 42개 |
| 기존 DB(rev.6 + 데이터)에 적용 | 통과. `ai_message_sources` 길이 확장은 ALTER TYPE이라 값 보존 (자동 생성본의 DROP 후 ADD를 수정) |
| `summary`·`summary_until_seq` 중 하나만 있는 기존 행 | 안내 메시지와 함께 중단, DB 변경 없음 |
| 되돌리기 → 다시 실행 | 통과 |
| `03_ai_tables.sql` (관리자·ai_user로 각각 다시 실행) | 통과, 소유자 항상 ai_user. AI SQLAlchemy `create_all` 결과와 컬럼·제약·인덱스 이름 일치 |
| SQL 제약 테스트 (app_user) | **66/66 PASS** (추가 19개: 요약 저장·중복·빈 값·짝 CHECK·답변 요약 기록, 메모리 저장·키 중복·키 없음 허용·보관 시각·신뢰도, 근거 255자, app_user의 ai.rag_documents 읽기 허용·쓰기 거부·청크 읽기 거부, 탈퇴 시 본문 비우기 절차 5개) |
| ai RAG 테이블 테스트 (`sql/test/ai_tables_test.sql`, ai_user) | **12/12 PASS** |
| ai 스키마 테스트 / 연동 테스트 | 8/8 / 19/19 PASS |
| AI 레포 코드 실행 | `RAGDocumentRepository` 저장·재적재·설정 불일치 거부 통과, LlamaIndex `PGVectorStore`가 ai_user로 `ai.data_projectteam02` 생성·필터 검색 통과 |
| `sql/ai/vector_indexes.sql` | HNSW 1개 + metadata 6개 생성, 재실행 안전, 테이블 없으면 중단 |

## 8. rev.8 변경 검증 (2026-11-08, 피그마 화면 검토 반영)

환경: 로컬 PostgreSQL 16 + pgvector, 운영과 같은 계정 구조.

| 항목 | 결과 |
|---|---|
| 새 마이그레이션 `GlossaryBadgeGoal` (빈 DB, Init → rev.6 → rev.7 → rev.8) | 통과, `db:check` 차이 없음, 엔티티 46개 (app 테이블 46 + migrations), Enum 타입 53개 |
| 기존 DB(rev.7 + `daily_goal_count` = 5인 행)에 적용 | 통과. `goal_count` = 5, `goal_period` = WEEKLY로 값 보존 (자동 생성본의 DROP 후 ADD를 RENAME으로 수정) |
| `page_no`·`sort_order` < 1인 기존 행 | 안내 메시지와 함께 중단 |
| 되돌리기 → 다시 실행 | 통과 (되돌리면 `daily_goal_count` 값 복원) |
| DBML 파싱 (`@dbml/core` 11, dbmlv2) | 통과, 테이블 49개 (app 46 + ai 3) |
| SQL 제약 테스트 (app_user) | **86/86 PASS** (추가 20개: 용어 저장·코드 중복·빈 용어, 개념–용어 연결·중복·없는 용어, 학습 키워드 수 집계, 배지 저장·코드 중복·조건 값 0, 배지 획득·재지급 거부·개수 집계, 목표 설정·WEEKLY 기본값·0 거부·DAILY 거부, 카드 저장·페이지 0·순서 0 거부) |
| ai 스키마 테스트 / ai RAG 테이블 테스트 | 8/8 / 12/12 PASS |
| 연동 테스트 (`npm run db:test`) | **21/21 PASS** (추가 2개: 던전 학습 화면 조회 = 개념 → 카드 → 용어 수, 배지 1회 지급 + 주 단위 목표) |

백엔드 레포 영향: `user_settings.daily_goal_count` 이름 변경으로 `dailyGoalCount`를 쓰는 3곳 수정 필요 — `src/modules/notifications/dto/notificationSetting.dto.js`, `src/config/swagger.config.js`, `test/auth-dto.test.js`.
