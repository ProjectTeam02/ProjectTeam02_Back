# BE-06 AI 튜터 사용자 격리 검증

검증일은 2026년 11월 24일(KST)이며, 기준은 `origin/develop` `1aaf023ecbf36cc5af05018ea657ab92f98df545`다. 작업 브랜치는 `codex/leren-tutor-be06`이다.

## 선행 작업과 검증 경로

| 항목 | 확인 결과 |
| --- | --- |
| BE-04 학습자 프로필 | PR #174가 `develop`에 병합됨. 구현 `dc0a643`. [PR #174](https://github.com/ProjectTeam02/ProjectTeam02_Back/pull/174) |
| BE-05 선수관계·오개념·최근 평가 | #175는 이슈이며 구현 PR #176이 `develop`에 병합됨. 구현 `40ce724`. [이슈 #175](https://github.com/ProjectTeam02/ProjectTeam02_Back/issues/175) · [PR #176](https://github.com/ProjectTeam02/ProjectTeam02_Back/pull/176) |
| 기준 브랜치 CI | `1aaf023`의 기존 `test`·`verify` 성공을 확인함. [test](https://github.com/ProjectTeam02/ProjectTeam02_Back/actions/runs/45158464956) · [verify](https://github.com/ProjectTeam02/ProjectTeam02_Back/actions/runs/45158464943) |

Tutor API는 활성 세션을 가진 Bearer JWT에서 사용자 ID를 가져온다. 대화 목록은 해당 사용자의 방만 반환하고 메시지 조회·전송은 대화방 소유권을 먼저 검사한다. 요청 DTO와 공개 개념 검증은 422로 응답하고, FastAPI 오류는 공통 오류 처리에서 503으로 반환한다. 외부 응답은 `POST /internal/v1/tutor/answer`의 루프백 HTTP Mock으로 대체했다.

## 기존 테스트 조사와 보완 범위

| 항목 | 작업 전 분류 | 활용 또는 보완 |
| --- | --- | --- |
| Tutor 대화방 소유권 | 기존 테스트는 있으나 부족 | 단위 테스트의 대화방 단위 재전송 검증을 유지. 실제 HTTP에서 한 사용자의 목록·조회·질문 전송을 다른 사용자와 대조 |
| 사용자별 학습 기록 격리 | 기존 테스트는 있으나 부족 | BE-04·05에서 집계와 본인 제출 필터를 검사. BE-06에서 두 사용자의 실제 FastAPI 요청 전체와 각 대화 이력을 비교 |
| 개인화 Context 생성 | 기존 테스트로 충분 | BE-04 집계, BE-05 전체 DTO 및 BE-03 내부 HTTP 계약 재실행 |
| 승인된 선수관계 전달 | 기존 테스트로 충분 | BE-05의 승인·미승인, 비공개·순환, 깊이 제한과 전체 전달 검사 재실행 |
| 오개념 가설 상태 | 기존 테스트로 충분 | BE-05의 `REJECTED` 제외와 상태 보존 검사 재실행. BE-06에서는 타인 가설과 타인 제출 ID가 최종 HTTP 페이로드에 남지 않는지 확인 |
| 존재하지 않는 개념 코드 | 기존 테스트는 있으나 부족 | BE-03의 서비스 단위 검증에 실제 PostgreSQL과 Express 경계의 422, FastAPI·DB 부수효과 없음 검사 추가 |
| FastAPI Timeout 및 오류 처리 | 기존 테스트는 있으나 부족 | 기존 DTO·실패 처리를 재실행하고 실제 Tutor HTTP 422 매핑, 시간 초과, 잘못된 응답, 실패 저장·사용량 제외를 확인 |
| 개인화 비활성화 시 fallback | 기존 테스트로 충분 | BE-03의 구형 Mock 계약과 BE-04의 OFF 검증 재실행. BE-06에서는 플래그를 켜도 기록이 비었으면 키가 생략됨을 확인 |
| 타인·미존재 학습 응시 ID | 테스트 없음 | 본인 방에 다른 사용자의 `context.attemptId`를 넣었을 때와 존재하지 않는 ID를 넣었을 때의 동일한 404 확인 |
| 승인되지 않은 문서 출처 | 기존 테스트는 있으나 부족 | SQL [1]에서 미승인 문서 분류를 실제 DB로 확인. Node가 개념의 문서 참조를 개인화 근거로 전송하지 않는지 확인. 실제 검색의 문서 승인 필터는 AI 저장소의 별도 경계 |

## 재현 및 수정

1. **학습 응시 소유권 누락.** 수정 전 실제 Express 요청은 본인 방에 타인의 응시 ID를 넣어도 HTTP 201을 반환했다. `tutor.service.js`는 `context.attemptId`가 있을 때만 `learning.learning_attempts`에서 요청 사용자와 응시 ID를 함께 확인한다. 타인·미존재 응시는 동일한 404를 반환한다. 자기 응시 ID와 응시 ID가 없는 기존 요청은 정상 처리된다. 테스트는 AI 요청, 사용량 예약, 메시지 저장이 거부 시 증가하지 않음을 확인한다.
2. **문서 연결 SQL [5]의 null 오탐.** 문서 쪽 `concept_id`가 null일 때도 양쪽 연결 불일치로 출력되는 것을 PostgreSQL에서 재현했다. [5]에만 `IS NOT NULL`을 추가했다. 동일한 격리 스냅샷에서 [1]~[4] 출력은 수정 전후 동일했고, UUID·개념 코드로 일치하는 행과 null은 제외됐다. 실제 비어 있지 않은 불일치는 계속 보고되며, 미승인 문서는 [1]에서 계속 `NOT_APPROVED`로 분류됐다.

## 실행 결과

격리 Docker PostgreSQL 18.6에서 초기 스키마·역할 SQL과 기존 마이그레이션 14개를 적용했다. TypeORM 스키마 차이 검사는 변경 없음으로 통과했다. 앱 DB 계정과 합성 사용자 A·B 및 기록이 없는 사용자를 사용했다.

| 상태 | 검증 | 결과 |
| --- | --- | --- |
| 실제 테스트 통과 | 신규 BE-06 HTTP·DB·Mock FastAPI | 하위 시나리오 5개, 부모 포함 Node 테스트 6건 통과 |
| 실제 테스트 통과 | 기존 BE-04·05 PostgreSQL, BE-03 FastAPI 계약 및 Tutor DTO | 신규와 함께 **40건 통과, 스킵 0**. 선수관계 승인·오개념 필터·null 정규화·개인화 OFF 및 fallback 유지 |
| 실제 테스트 통과 | SQL [1]~[5] 수정 전후 결과 비교 | [1]~[4] 동일, [5] null 제외 및 실제 불일치 유지 |
| 실제 테스트 통과 | 학습 이력과 학습 기능 회귀 | 격리 PostgreSQL에서 **27건 통과, 스킵 0**. 다른 사용자의 학습 이력과 일정이 조회에 포함되지 않음을 확인 |
| 실제 테스트 통과 | 인증·카카오 Mock·Refresh 회귀 | 격리 PostgreSQL에서 **37건 통과, 스킵 0** |
| 실제 테스트 통과 | 전체 `npm test -- --test-concurrency=1` | **238건 통과, 스킵 21, 실패 0**. 위 격리 DB 검증은 별도 실행 |
| 기존 테스트 결과 확인 | 기준 `develop`의 GitHub CI | `test`·`verify` 성공 |
| 기존 테스트 결과 확인 | AI 문서 검색의 승인 필터 | AI 커밋 `05f83f96ac13`의 미승인 문서 제외 및 승인 근거가 없으면 결과를 비우는 테스트와 전체 pytest CI 성공을 확인했다. [테스트](https://github.com/ProjectTeam02/ProjectTeam02_AI/blob/05f83f96ac13795da2374528dbc644d3a86d7968/tests/test_concept_aware_retrieval.py) · [기존 AI CI](https://github.com/ProjectTeam02/ProjectTeam02_AI/actions/runs/45175777060) |
| 미검증 | 실제 FastAPI 검색·응답과 운영 환경 | 둘 다 로컬 Mock과 범위가 다르다. AI 코드의 승인 상태 필터와 백엔드 요청 경계까지 확인했다. [AI 검색 승인 필터](https://github.com/ProjectTeam02/ProjectTeam02_AI/blob/05f83f96ac13795da2374528dbc644d3a86d7968/app/rag/retrieval/retriever.py) · [PostgreSQL 검색 조건](https://github.com/ProjectTeam02/ProjectTeam02_AI/blob/05f83f96ac13795da2374528dbc644d3a86d7968/app/rag/retrieval/postgres_sparse.py) |
| 미검증 | BE-06 변경의 원격 CI | 새 PostgreSQL 테스트를 기존 `db-check` 작업에 등록했다. 브랜치 게시·PR 생성 후 원격에서 실행된다. |
| 선행 PR 병합 대기 | BE-04·05 | 없음 |

루프백 전용 PostgreSQL에 CI의 초기 SQL과 마이그레이션을 적용한 뒤, CI에서 사용하는 `LEREN_EXTENDED_API_PG_TEST_CONFIG`를 해당 테스트 DB로 설정해 재실행한다.

```bash
node --test --test-concurrency=1 test/integration/tutor-user-isolation-postgres.test.js test/integration/tutor-learner-profile-postgres.test.js test/integration/tutor-concept-context-postgres.test.js test/tutor-ai-contract.test.js test/tutor-dto.test.js
```

## PR에 포함할 파일

| 파일 | 내용 |
| --- | --- |
| `test/integration/tutor-user-isolation-postgres.test.js` | 실제 HTTP·PostgreSQL·루프백 FastAPI Mock을 통한 사용자 격리 검증 |
| `src/modules/tutor/tutor.service.js` | 학습 응시 ID 소유권 확인 |
| `src/config/tutor.swagger.js` | 학습 응시 ID 소유권과 404 응답 계약 설명 |
| `database/sql/report/03_source_document_check.sql` | 검사 [5]의 null 오탐 수정 |
| `.github/workflows/db-check.yml` | 기존 격리 PostgreSQL CI에 BE-06 추가 |
| `docs/tutor-be06-verification.md` | 검증 근거, 재사용 테스트 및 PR 범위 |

백엔드 BE-06 검증은 완료됐다. PR 제목은 `test(tutor): BE-06 사용자 격리 통합 검증`이며 대상 브랜치는 `develop`이다. 원격 게시와 PR 생성·병합은 승인 단계에서 진행한다.
