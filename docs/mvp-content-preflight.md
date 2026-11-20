# Leren MVP 콘텐츠 사전 검사

이 도구는 현재 DB 스냅샷에서 공개 퀴즈가 실행될 수 있는지, 학습 트리·복습 참조·보상·상점 데이터가 맞는지 점검합니다. DB를 변경하지 않으며, 편집 검수나 실제 운영 연결을 대신하지 않습니다. GitHub `verify`는 격리 테스트 DB에서만 통합 테스트를 실행합니다.

## 실행

루트에서 `npm ci`, `npm run db:build`를 실행합니다. 접속 정보는 PostgreSQL 표준 `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`를 명시합니다. 인증은 `PGPASSFILE` 또는 비밀 저장소에서 전달합니다.

```bash
PGHOST=127.0.0.1 PGPORT=55432 PGDATABASE=leren_validation PGUSER=app_user \
  node scripts/mvp-content-preflight.js --date 2026-11-19 \
  --json preflight.json --markdown preflight.md
```

`--date`를 비우면 한국 날짜가 사용됩니다. 출력 옵션을 모두 생략하면 JSON을 표준 출력에 씁니다. 종료 0 = 검사를 통과함(경고만 있으면 0), 1 = 데이터/마이그레이션 실패, 2 = 접속·실행·출력 실패. 원격은 명시적 `LEREN_PREFLIGHT_REMOTE_READONLY=1 PGSSLMODE=verify-full` 및 필요 시 `PGSSLROOTCERT`가 있어야 합니다. 별도 승인된 SELECT 전용 계정만 사용하세요. 트랜잭션은 REPEATABLE READ READ ONLY와 타임아웃을 설정하고 롤백합니다. 출력에는 운영 원본을 포함하지 말고, 내부 콘텐츠·응시 식별자는 공개 공유 전에 마스킹하세요.

## 검사 범위

- 일반 Stage: 공개 주제·Stage의 3/2/2 설정, 슬롯 1–3의 정확한 매핑, 공개 상태, 4개 보기와 1개 정답. 동일 논리 문항 코드를 여러 버전으로 배정한 경우 경고합니다.
- Boss: 런타임의 무작위 출제와 동일한 후보 SQL을 씁니다. 문항이 공개되었고 일반 Stage 배정에 없으며 보기·정답 구조가 맞아야 합니다. 부족 수와 주제/Stage ID를 출력합니다. 후보 개념의 비공개 상태는 별도 데이터 오류이며 런타임 후보 조건 자체를 바꾸지 않습니다. 진행 중 새 규칙 응시의 7개 스냅샷도 확인합니다.
- 개념·선수관계: 실제 해금은 개념 연결이 아닌 이전 Stage/선수 주제 Boss를 사용합니다. 논리 코드의 무참조·비공개·순환을 진단하고 트리는 수정하지 않습니다. Stage 공개 카드 없는 경우 실패로 분류합니다.
- 복습: 해당 날짜까지의 미완료 임무를 대상으로 본인 공개 오답/북마크 원문만 셉니다. 0개는 실패, 요구량보다 짧은 세트는 경고입니다. 미풀이 유사 문항 우선·대체 출제 기능은 없습니다. 풀이 불가능한 선택지 구조가 실제 응시에 저장되기 전 503으로 차단합니다.
- 보상과 한벌옷: 레벨 기준·Stage 보상 값·기존 EXP/코인 원장 연결, 판매 가능 OUTFIT, 가격·리소스 키, 구매/장착 정합성을 검증합니다. 실제 이미지 파일 존재·운영 보상 수치·콘텐츠 정답은 판정하지 않습니다.

## 재현 테스트

`node --test test/mvp-content-preflight.test.js`로 단위 테스트를 실행합니다. PostgreSQL 통합은 격리 루프백에서 지정한 임시 DB만 사용합니다.

1. 빈 `mvp_preflight_fresh`와 `mvp_preflight_fixture`를 만들고, 두 DB에 테스트 역할을 사용할 수 있게 합니다.
2. `mvp_preflight_fixture`에만 `database/sql/init/01_app_schema.sql`과 현재 마이그레이션 전체를 적용합니다. 검수용 테스트는 이 DB에 fixture를 생성하므로 기존 데이터가 없는 임시 DB만 사용하세요.
3. `LEREN_PREFLIGHT_PG_TEST_CONFIG`는 포트와 테스트 비밀을 담은 JSON입니다. 선택 `reportDirectory`는 이미 존재하는 폴더입니다. `node --test test/integration/mvp-content-preflight-postgres.test.js`를 실행합니다.
4. 기존 Boss/오답/OUTFIT 회귀는 `test/integration/README.md`의 별도 테스트 DB와 설정으로 실행합니다.

## 일반 Stage 준비 상태

`GET /api/v1/stages/{stageId}`에 기존 Bearer 토큰을 보냅니다. 공개 일반 Stage 상세 응답의 `data`에 `quizReady` (`boolean`)와 `quizUnavailableReason` (아래 문자열 중 하나 또는 `null`)가 추가됩니다. 기존 필드는 유지되며 Stage 목록과 Boss 상세에는 두 필드가 없습니다.

아래 예시는 일반 Stage 상세의 관련 필드만 보여줍니다.

```json
{
  "success": true,
  "data": {
    "stageId": "11111111-1111-4111-8111-111111111111",
    "stageType": "NORMAL",
    "isUnlocked": true,
    "quizReady": false,
    "quizUnavailableReason": "INSUFFICIENT_ELIGIBLE_QUESTIONS"
  }
}
```

| `quizReady` | `quizUnavailableReason` | 의미 |
| --- | --- | --- |
| `true` | `null` | 현재 설정과 문항 구성으로 새 퀴즈를 시작할 수 있다. |
| `false` | `INVALID_STAGE_CONFIGURATION` | 3문항, 2정답 기준, HP 2 설정 중 규칙과 다른 값이 있다. |
| `false` | `REWARD_NOT_CONFIGURED` | 최초 통과에 필요한 전체 EXP, 경제 EXP, Gold 보상이 유효하게 설정되지 않았다. |
| `false` | `INSUFFICIENT_ELIGIBLE_QUESTIONS` | 1~3번 슬롯 중 비어 있거나 게시되지 않은 문항이 있다. |
| `false` | `INVALID_QUESTION_POOL` | 배정 슬롯이 세 개를 넘거나 문항의 보기 4개·정답 1개 조건을 충족하지 않는다. |

새 응시 버튼에는 `isUnlocked`와 `quizReady`를 함께 사용합니다. 상세 조회 뒤 데이터가 바뀔 수 있으므로 기존 시작 API의 상태 코드와 오류 처리를 유지합니다. 진행 중 응시를 이어 푸는 화면은 기존 재개 API의 응답을 사용합니다.

## 승인된 환경의 운영 데이터 진단

[Stage·상점 진단 SQL](mvp-stage-and-shop-diagnostics.sql)은 `희소성`, `가격과 물가수준`의 Stage ID, 배정·공개·보기 구성 통계, 출제 가능 슬롯과 부족 수, 판매 가능 OUTFIT 수를 조회합니다. 승인된 스냅샷 또는 읽기 복제본에서 SELECT 전용 계정으로 실행합니다.

```bash
psql -X -v ON_ERROR_STOP=1 -f docs/mvp-stage-and-shop-diagnostics.sql
```

`stage_id`가 비어 있으면 해당 제목의 일반 Stage를 찾지 못한 것이며 부족 수는 `null`입니다. `eligible_slots`는 1~3번에 배정된 게시 문항 중 보기 조건을 만족하는 수입니다. 슬롯이 초과 배정되면 `assigned_slots`를 확인합니다.
