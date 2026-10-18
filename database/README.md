# leren-db

Leren 백엔드(app 스키마)의 **TypeORM 엔티티 · 마이그레이션 · 연동 검증 스크립트** 저장소입니다.
설계 원본은 `leren_erd_v2.dbml`이며, ai 스키마는 AI 서버(FastAPI)가 별도로 관리하므로 포함하지 않습니다.

## 구성

```
db/init/01_app_schema.sql      # app 스키마 + DB 계정(migrator, app_user) 생성. 관리자 계정으로 최초 1회
src/
  entities/                    # 엔티티 36개 (영역별 폴더) + common/enums.ts
  db-options.ts                # 공통 접속 옵션 (gen_random_uuid, SSL)
  data-source.ts               # 서버 실행용 (app_user)
  migration-data-source.ts     # 마이그레이션 전용 (migrator, TypeORM CLI용)
  migrations/                  # 초기 마이그레이션 (Init)
  scripts/seed-minimal.ts      # 검증용 최소 시드
  scripts/smoke-test.ts        # 연동 테스트 14항목
.github/workflows/db-check.yml # PR마다 임시 PostgreSQL에서 자동 검증
docs/VERIFICATION.md           # 검증 결과
```

## 로컬에서 검증하기 (Docker Desktop, Node.js 20 필요)

```bash
cp .env.example .env
docker compose up -d                 # PostgreSQL 16 + 01_app_schema.sql 자동 실행
npm ci
npm run migration:run                # migrator 계정으로 테이블 생성
npm run migration:check              # 엔티티와 DB 사이 차이가 없으면 통과
npm run test:db                      # app_user 계정으로 14개 항목 → "14/14 PASS"
```

처음부터 다시 하려면 `docker compose down -v` 후 위 순서를 반복합니다.

## DB 계정

| 계정 | 용도 | 권한 |
|---|---|---|
| `migrator` | 마이그레이션 실행 | app 스키마 소유자 (테이블 생성·변경) |
| `app_user` | Node.js 서버 실행 | app 스키마 테이블 읽기·쓰기만 (삭제·변경 불가) |

두 계정 모두 `search_path = app, public`으로 설정되어 있어야 합니다(TypeORM 생성 컬럼 메타데이터 기록 위치).

## 구조를 바꿀 때

1. `leren_erd_v2.dbml` 수정 → 엔티티 재생성(또는 엔티티 직접 수정)
2. `npm run migration:generate src/migrations/<변경이름>`
3. 생성된 마이그레이션 검토 후 커밋 → PR에서 `db-check`가 자동 검증
4. 배포 시 EC2에서 `migration:run` 실행 (GitHub Actions → SSM Run Command)

운영·개발 DB에는 `synchronize`를 쓰지 않습니다.

## AWS RDS에 적용할 때

1. RDS PostgreSQL 16 생성 (Private, Public access OFF, SG-DB는 SG-EC2만 허용)
2. EC2에서 마스터 계정으로 `db/init/01_app_schema.sql` 실행 (비밀번호는 실제 값으로 변경)
3. `.env` 대신 Parameter Store 값으로 환경변수 주입, `DB_SSL=true`와 RDS CA 인증서 지정
4. EC2에서 `migration:run` → `migration:check` → `test:db` 순서로 동일하게 확인

## 서비스 코드에서 지킬 규칙 (DB 제약으로 강제 불가)

- `user_growth`·`user_wallets`·`user_step_progress.progress_status`, `review_items.wrong_count`·`last_answer_result`는 원장·제출 기록과 **같은 트랜잭션**에서만 갱신
- `user_characters.equipped_costume_id`는 보유 코스튬만 허용
- 선택지는 문항당 4개·정답 1개, normal 단계의 `step_concepts`는 1행
- `concept_code`, `question_code`, `document_id`, `coin_ledger.ref_id`는 FK 없는 논리 참조 → 저장 시 존재 여부 검증
- API 응답에는 엔티티 대신 DTO 사용 (`passwordHash`, 제출 전 `isCorrect` 노출 금지)
