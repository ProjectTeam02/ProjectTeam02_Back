# Leren MVP 콘텐츠 사전 검사

이 도구는 현재 DB 스냅샷에서 공개 퀴즈가 실행될 수 있는지, 학습 트리·복습 참조·보상·상점 데이터가 맞는지 점검합니다. 기존 CI/CD에는 자동 연결하지 않았습니다. DB를 변경하지 않으며, 편집 검수나 실제 운영 연결을 대신하지 않습니다.

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
