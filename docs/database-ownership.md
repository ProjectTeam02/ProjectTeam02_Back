# Database Ownership

## 담당과 기준

- DB 스키마(app 스키마)·ERD·마이그레이션·AWS RDS는 DB 담당이 관리합니다.
- **기준은 `database/` 패키지의 엔티티와 마이그레이션**입니다. 설계 문서(`database/docs/leren_erd.dbml`, 테이블 정의서, ERD)는 같은 내용을 따라갑니다.
- ORM은 TypeORM 0.3 (Prisma 사용 안 함). 서버 코드는 `require('@leren/database')`로 엔티티·Enum·DataSource를 가져옵니다.
- ai 스키마(문서·청크·임베딩, pgvector)의 **DDL도 DB 담당이 관리**합니다 (2026-11 변경, 이전 ProjectTeam02_AI #5 합의는 "FastAPI가 직접 생성"). 스키마·계정·pgvector는 `database/sql/init/02_ai_schema.sql`, RAG 메타 테이블은 `03_ai_tables.sql`(소유자 `ai_user`), 벡터 인덱스는 `database/sql/ai/vector_indexes.sql`. LlamaIndex 벡터 테이블(`ai.data_<컬렉션>`)만 AI 서버가 처음 적재할 때 생성합니다. AI 서버는 RDS에서 `create_tables()`·`migrations/*.sql`을 실행하지 않습니다.
- AI Tutor 대화 기록·멀티턴 메모리 6개 테이블(`ai_conversations`, `ai_conversation_summaries`, `ai_messages`, `ai_message_sources`, `ai_requests`, `ai_user_memories`)은 백엔드(app 스키마) 소유입니다. AI 서버는 이 테이블에 직접 접근하지 않고, Node가 요청에 담아 보내고 응답을 저장합니다. app 스키마는 `document_id`·`chunk_id`를 FK 없이 논리 참조만 하고, `app_user`는 `ai.rag_documents`만 읽을 수 있습니다. 자세한 내용은 `database/docs/AI_DB.md`.

## 데이터 경계 (영역별 엔티티 폴더)

| 영역 | 폴더 | 주요 테이블 | 쓰는 모듈 |
|---|---|---|---|
| 계정·인증·약관 | `account/` | users, terms, user_terms_agreements, social_accounts, account_tokens, user_devices, user_sessions, user_settings | auth, users, notifications |
| 캐릭터·상점 | `character/` | character_classes, costumes, user_characters, user_costumes, user_equipped_costumes | characters, costumes |
| 학습 콘텐츠 | `content/` | topics, stages, concepts, concept_sections, questions, question_choices 외 | topics, stages, concepts, questions |
| 진행도·퀴즈 | `progress/` | user_stage_progress, learning_attempts, question_submissions | learning, quizzes |
| 보상·성장 | `reward/` | user_growth, user_wallets, exp_ledger, coin_ledger, level_thresholds | rewards |
| 오답·복습·일정 | `review/` | review_items, review_missions, review_attempts, review_submissions, study_plans | reviews, calendar |
| AI Tutor | `ai/` | ai_conversations, ai_conversation_summaries, ai_messages, ai_message_sources, ai_requests, ai_user_memories | tutor |
| RAG 문서 (ai 스키마) | `sql/init/03_ai_tables.sql` | ai.rag_documents, ai.rag_document_chunks, ai.rag_index_configurations (+ LlamaIndex 벡터 테이블) | AI 서버 (FastAPI) |

## 변경 절차

1. DB 변경이 필요하면 DB 담당에게 요청 (이슈 또는 PR 코멘트)
2. 엔티티 수정 + 새 마이그레이션 + 문서 갱신을 한 PR로
3. CI `db-check`(컴파일·마이그레이션·차이 없음·연동 19개·SQL 제약 66개·ai 스키마 8개·ai 테이블 12개) 통과 후 병합
4. 병합된 마이그레이션은 수정하지 않고, 바꿀 게 있으면 새 마이그레이션 추가

자세한 사용법은 `database/README.md`, 엔티티 목록은 `database/docs/ENTITIES.md`를 봅니다.

## RDS 운영 규칙

- 대상: `leren-dev-db` (PostgreSQL 18, ap-northeast-2). 배포 서버와 팀 베타 테스트가 사용하는 DB
- 관리자: DB 담당 1명. 팀원은 로컬 Docker DB(`docker compose up -d db`)로 개발하고 RDS에 직접 쓰지 않음
- 마이그레이션: CI `db-check` 통과 후 main에 병합된 것만 RDS에 적용
- 스냅샷: 마이그레이션, 대량 데이터 적재, 배포 전에 수동 스냅샷 생성 (이름: `leren-before-<작업>-<YYYYMMDD>`)
- 위험한 변경: 스냅샷으로 만든 임시 인스턴스에서 먼저 실행해 보고 결과 확인 후 RDS에 적용, 임시 인스턴스는 바로 삭제
- 복구: 수동 스냅샷 복원 또는 특정 시점 복구(자동 백업 7일). 복원은 새 인스턴스(새 엔드포인트)로 만들어지므로 앱의 DB 주소(`DB_HOST`)를 바꾸고 재배포
- 백업·유지 관리 시간: 백업 매일 12:00–12:30 KST, 유지 관리 수요일 13:00–13:30 KST