# Database Ownership

## 담당과 기준

- DB 스키마(app 스키마)·ERD·마이그레이션·AWS RDS는 DB 담당이 관리합니다.
- **기준은 `database/` 패키지의 엔티티와 마이그레이션**입니다. 설계 문서(`database/docs/leren_erd.dbml`, 테이블 정의서, ERD)는 같은 내용을 따라갑니다.
- ORM은 TypeORM 0.3 (Prisma 사용 안 함). 서버 코드는 `require('@leren/database')`로 엔티티·Enum·DataSource를 가져옵니다.
- ai 스키마(문서·청크·임베딩, pgvector)는 AI 서버(FastAPI)가 `ai_user` 계정으로 관리합니다 (ProjectTeam02_AI #5 합의). 스키마·계정·pgvector 생성은 `database/sql/init/02_ai_schema.sql`.
- AI Tutor 대화 기록 4개 테이블(`ai_conversations`, `ai_messages`, `ai_message_sources`, `ai_requests`)은 백엔드(app 스키마) 소유입니다. app 스키마는 `document_id`·`chunk_id`를 FK 없이 논리 참조만 합니다.

## 데이터 경계 (영역별 엔티티 폴더)

| 영역 | 폴더 | 주요 테이블 | 쓰는 모듈 |
|---|---|---|---|
| 계정·인증·약관 | `account/` | users, terms, user_terms_agreements, social_accounts, account_tokens, user_devices, user_sessions, user_settings | auth, users, notifications |
| 캐릭터·상점 | `character/` | character_classes, costumes, user_characters, user_costumes, user_equipped_costumes | characters, costumes |
| 학습 콘텐츠 | `content/` | topics, stages, concepts, concept_sections, questions, question_choices 외 | topics, stages, concepts, questions |
| 진행도·퀴즈 | `progress/` | user_stage_progress, learning_attempts, question_submissions | learning, quizzes |
| 보상·성장 | `reward/` | user_growth, user_wallets, exp_ledger, coin_ledger, level_thresholds | rewards |
| 오답·복습·일정 | `review/` | review_items, review_missions, review_attempts, review_submissions, study_plans | reviews, calendar |
| AI Tutor | `ai/` | ai_conversations, ai_messages, ai_message_sources, ai_requests | tutor |

## 변경 절차

1. DB 변경이 필요하면 DB 담당에게 요청 (이슈 또는 PR 코멘트)
2. 엔티티 수정 + 새 마이그레이션 + 문서 갱신을 한 PR로
3. CI `db-check`(컴파일·마이그레이션·차이 없음·연동 19개·SQL 제약 47개·ai 스키마 8개) 통과 후 병합
4. 병합된 마이그레이션은 수정하지 않고, 바꿀 게 있으면 새 마이그레이션 추가

자세한 사용법은 `database/README.md`, 엔티티 목록은 `database/docs/ENTITIES.md`를 봅니다.
