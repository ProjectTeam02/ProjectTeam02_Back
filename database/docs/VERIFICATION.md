# Entity 작성 및 검증 결과 (v3 rev.5)

- 검증일: 2026-10-26
- 대상: app 스키마 TypeORM 엔티티 40개 (`database/docs/leren_erd.dbml` rev.5 기준), 백엔드 레포 `database/` 워크스페이스
- 환경: PostgreSQL 16 (빈 DB), Node.js 20, TypeORM 0.3.20, TypeScript 5.4.5 (strict)
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

`leren_erd_v3.dbml`로 만든 SQL(`leren_v3_schema.sql`)의 DB와 엔티티 마이그레이션 DB를 카탈로그로 비교했습니다 (컬럼 타입·NOT NULL·기본값·생성 컬럼, 제약·인덱스 이름과 정의, Enum 값).

| 비교 항목 | 결과 |
|---|---|
| 624개 항목 | 617개 완전 일치 |
| 차이 7개 | smallint 기본값 표기만 다름 (`0` ↔ `'0'::smallint`, 같은 값) |

## 3. SQL 제약 테스트 (`database/sql/test/v3_constraint_test.sql`, app_user)

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
