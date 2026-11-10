# 최초 직업 선택 연동

이메일 가입 또는 카카오 코드 교환 응답으로 받은 LEREN 세션을 저장한 다음, `GET /api/v1/users/me`를 호출한다. `data.characterClass`가 `null`이면 직업 선택 화면을 열고, 직업 객체가 있으면 메인 또는 인플레이션 스테이지로 이동한다. 앱을 재실행하거나 다시 로그인할 때도 같은 프로필 필드로 판단한다. `isNewUser`는 카카오 계정 생성 여부에 쓰인다. 카카오 사용자 프로필의 `email`은 `null`일 수 있다.

## 목록과 저장

두 API에는 `Authorization: Bearer <accessToken>`을 보낸다. `GET /api/v1/character-classes`는 활성 직업을 정렬 순서대로 반환한다. 빈 경우 응답은 `{"success":true,"data":{"items":[]}}`다.

```json
{
  "success": true,
  "data": {
    "items": [
      { "classId": "123e4567-e89b-42d3-a456-426614174040", "classCode": "WARRIOR", "name": "검사", "imageKey": null }
    ]
  }
}
```

화면의 `warrior`, `mage`, `archer`는 요청 시 각각 `WARRIOR`, `MAGE`, `ARCHER`로 매핑한다. `PATCH /api/v1/users/me/character-class`에 `Content-Type: application/json`과 `{"classCode":"WARRIOR"}`를 보낸다. 저장 성공 후 프로필을 갱신하고 다음 화면으로 이동한다.

```json
{
  "success": true,
  "data": {
    "characterClass": {
      "classId": "123e4567-e89b-42d3-a456-426614174040",
      "classCode": "WARRIOR",
      "name": "검사",
      "imageKey": null
    },
    "onboardingCompleted": true
  }
}
```

| 상태 | 화면 처리 |
|---|---|
| 200 | 최초 저장 또는 동일 코드 재요청 성공. 직업 객체는 `GET /users/me`와 같은 형식이다. |
| 401 | 세션을 다시 확인한다. |
| 404 | 저장 가능한 직업을 찾을 수 없으면 선택 화면을 유지하고 목록을 다시 조회한다. |
| 409 | 다른 직업이 이미 저장돼 있으므로 프로필을 다시 조회하고 현재 저장된 직업을 표시한다. |
| 422 | 요청 형식을 확인하고 선택 화면을 유지한다. |
| 503 또는 연결 오류 | 선택 화면을 유지하고 같은 코드를 재시도할 수 있게 한다. |

MVP는 최초 선택만 지원한다. 기존 화면의 “나중에 마이페이지에서 바꿀 수 있어요” 문구는 최초 선택 정책에 맞춰 수정해야 한다. 활성 상태가 바뀌어 목록에서 빠진 직업도 이미 선택한 사용자의 프로필에는 표시된다.

PR #73의 `database/sql/seed/01_master_data.sql`은 `WARRIOR`(검사), `MAGE`(마법사), `ARCHER`(궁수)를 활성 상태로 등록하며 정렬값은 1, 2, 3이다. 이미지 키는 현재 세 직업 모두 `null`이므로 앱은 코드별 기본 이미지를 표시할 수 있다. 배포 전 DB 담당자는 대상 DB에 기준 SQL이 적용됐는지와 실제 값이 일치하는지 확인한다. SQL을 다시 실행하면 직업 마스터의 표시명, 이미지 키, 활성 상태 등이 SQL에 적힌 값으로 갱신되므로 운영에서 편집한 값이 있다면 적용 전에 비교한다.

## 검증

`npm test`는 입력 검증, 인증, Swagger 계약과 기존 회귀 테스트를 실행한다. `./test/integration/run-character-onboarding-postgres.ps1`은 별도의 Docker PostgreSQL에서 기준 데이터, 프로필 연동, 동시 선택, 롤백을 검증한다.
