# Entity 작성 및 검증 결과

- 검증일: 2026-10-18
- 대상: app 스키마 TypeORM 엔티티 36개 (`leren_erd_v2.dbml` 기준)
- 환경: PostgreSQL 16 (빈 DB), Node.js 20, TypeORM 0.3.20, TypeScript 5.4.5 (strict)
- 방식: 실제 운영과 같은 권한 구조로 검증 — 스키마 변경은 `migrator`, 데이터 저장은 `app_user`

## 1. 컴파일 · 스키마 생성

| 항목 | 기준 | 결과 |
|---|---|---|
| TypeScript 컴파일 (strict) | 오류 0 | 통과 |
| 마이그레이션 생성 (`migration:generate`) | 빈 DB 기준 Init 1개 생성 | 통과 |
| 마이그레이션 실행 (`migration:run`, migrator) | 오류 없이 COMMIT | 통과 |
| 테이블 | 36 | 36 |
| FK | 70 | 70 |
| Enum 타입 | 47 (공유 Enum 2종을 컬럼별로 분리) | 47 |
| CHECK 제약 | 13 | 13 |
| UUID 기본값 | `gen_random_uuid()` (확장 불필요) | 26개 PK 적용 |
| 엔티티 ↔ DB 차이 (`migration:check`) | 차이 없음 | 통과 |

## 2. 데이터 저장 · 제약 조건 (app_user, 14항목)

| # | 항목 | 기대 결과 | 판정 |
|---|---|---|---|
| 1 | 회원가입 (users·growth·wallet·settings) | 4개 테이블에 1행씩, 기본값 Lv.1 / 0 EXP / 0 코인 | PASS |
| 2 | 직업 선택 | user_characters 생성 + 초기 설정 완료 기록 | PASS |
| 3 | 지역 해금 계산 | 선수 지역 없는 지역만 열림 | PASS |
| 4 | 전투 응시 → 2문항 정답 → 클리어 | attempt=passed, 진행도=passed | PASS |
| 5 | 최초 통과 보상 트랜잭션 | 원장 기록 + 전체 +30 / 경제 +20 EXP, 코인 50 | PASS |
| 6 | 같은 단계 보상 재지급 | unique 위반으로 거부, 잔액 유지 | PASS |
| 7 | 같은 문항 두 번 제출 | unique 위반으로 거부 | PASS |
| 8 | 트랜잭션 중간 오류 | 전체 롤백 (원장 변화 없음) | PASS |
| 9 | 코스튬 구매: 잔액 부족 / 구매 / 재구매 | CHECK 거부 / 성공 / 중복 거부 | PASS |
| 10 | 복습 노트 같은 문제 재등록 | 문제당 1행 유지, wrong_count 증가 | PASS |
| 11 | 학습 일정 목표 31자 | 30자 제한으로 거부 | PASS |
| 12 | 허용되지 않은 Enum 값 | 거부 | PASS |
| 13 | AI 사용량 KST 날짜 생성 컬럼 | UTC 16:30 → KST 다음 날 | PASS |
| 14 | app_user로 DROP TABLE | 권한 오류 | PASS |

**결과: 14/14 PASS**

## 3. 검증 중 발견 · 수정한 오류

| # | 오류 | 원인 | 수정 |
|---|---|---|---|
| 1 | **Enum 중복 생성** — 마이그레이션에 `CREATE TYPE`이 2번 들어가 실행 실패 | 여러 테이블이 같은 Enum을 공유할 때 TypeORM이 타입을 컬럼마다 생성 (`login_method`, `publish_status`) | DB 타입 이름을 `테이블_컬럼`으로 분리(`users_last_login_method`, `user_sessions_login_method`, `regions_status`, `steps_status`). TS Enum은 하나로 공유 |
| 2 | **UUID 기본값 함수 없음** (`uuid_generate_v4()`) | uuid-ossp 확장이 필요한데 migrator는 확장 설치 권한이 없음 | PostgreSQL 13+ 내장 `gen_random_uuid()` 사용 (`uuidExtension: 'pgcrypto'`, `installExtensions: false`) |
| 3 | **마이그레이션 재생성 시 차이 발생** (생성 컬럼 `usage_date`) | 접속 기본 스키마가 public이라 TypeORM 메타데이터가 다른 스키마에 기록됨 | 계정별 `search_path = app, public` 설정 (`01_app_schema.sql`) |
| 4 | **app_user 권한 없음** (스키마 재생성 후) | 기본 권한 부여(DEFAULT PRIVILEGES)가 스키마와 함께 삭제됨 | 스키마·계정·권한 생성을 `01_app_schema.sql` 하나로 묶어 항상 함께 실행 |
| 5 | TypeORM CLI가 DataSource 파일 인식 실패 | CLI는 export가 1개인 파일만 허용 | 서버용(`data-source.ts`)과 마이그레이션용(`migration-data-source.ts`) 분리 |

이전 버전(v0.2)은 관리자 권한 + `synchronize`로만 확인해서 1·2·3번이 드러나지 않았습니다. 이번 버전(v0.3)은 운영과 같은 계정·마이그레이션 방식으로 재검증했습니다.

## 4. 재현 방법

```bash
docker compose up -d && npm ci
npm run migration:run && npm run migration:check && npm run test:db
```

GitHub에 올리면 `.github/workflows/db-check.yml`이 PR마다 같은 절차를 임시 PostgreSQL에서 자동 실행합니다.
