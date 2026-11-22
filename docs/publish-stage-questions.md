# 승인 문항 공개·Stage 배정 도구

검수 담당이 승인한 문항을 일반 Stage의 출제 슬롯(1~3번)에 배정하고 `PUBLISHED`로 공개합니다. 문항 생성(AI)과 검수 판단은 이 도구의 범위가 아닙니다. 검수 담당이 준 승인 목록을 DB에 그대로, 검증을 거쳐 반영하는 역할만 합니다.

- 스크립트: `scripts/publish-stage-questions.js`
- 기본은 **미리보기**입니다. 같은 트랜잭션에서 저장하고 앱과 같은 기준으로 퀴즈 준비 상태를 확인한 뒤 `ROLLBACK`합니다. `--apply`를 붙여야 저장(`COMMIT`)합니다.
- 승인 목록 파일 하나가 트랜잭션 하나입니다. 하나라도 검증에 실패하면 아무것도 저장하지 않습니다.
- **빈 슬롯만 채웁니다.** 다른 문항이 이미 있는 슬롯은 교체하지 않고 오류를 냅니다. 같은 문항이 이미 같은 슬롯에 있으면 건너뜁니다(다시 실행해도 결과가 같음).
- 종료 코드: `0` 성공, `1` 승인 목록·데이터 검증 실패, `2` 사용법·접속·실행 오류

## 승인 목록 형식

```json
{
  "approvedBy": "검수 담당자 이름",
  "approvedAt": "2026-11-22",
  "stages": [
    { "stageCode": "R01_S01_C0102", "slots": { "1": "Q_CODE_A", "2": "Q_CODE_B", "3": "Q_CODE_C" } },
    { "stageCode": "R07_S01", "slots": { "1": "Q_CODE_D" } }
  ]
}
```

| 필드 | 규칙 |
| --- | --- |
| `approvedBy` | 필수, 1~50자. 공개한 문항의 `review_comment`에 `승인: <이름> (<날짜>)`로 남음 (기존 값이 있으면 유지) |
| `approvedAt` | 선택, `YYYY-MM-DD` |
| `stageCode` | `content.stages.stage_code`. 목록 안에서 중복 금지 |
| `slots` | 슬롯 번호 `1`~`3` → `content.questions.question_code`. 같은 코드가 여러 버전이면 **최신 버전**을 씀. 목록 전체에서 문항 중복 금지 |

## 검증

| 구분 | 오류 (저장 안 함) | 경고 (저장은 됨) |
| --- | --- | --- |
| Stage | 없음, BOSS Stage(BOSS는 공개 문항 풀에서 출제), 1~3 밖 슬롯 배정이 이미 있음 | Stage가 아직 `PUBLISHED`가 아님 |
| 문항 | 없음, `REJECTED`·`RETIRED`, 선택지 4개·정답 1개가 아님, Stage에 연결된 개념(`stage_concepts`)의 문항이 아님, 같은 Stage의 다른 슬롯에 이미 있음 | 개념이 `PUBLISHED`가 아님, 다른 Stage에도 배정됨 |
| 슬롯 | 다른 문항이 이미 있음 (교체 금지) | 저장 후에도 퀴즈 준비 불가(예: 슬롯 3개가 다 차지 않음) |

저장 내용:
- 문항: `status = PUBLISHED`, `published_at`·`reviewed_at`(비어 있을 때만), `review_comment`(비어 있을 때만)
- 배정: `content.stage_questions (stage_id, question_id, question_order)`

## 운영(EC2)에서 실행

이 도구가 들어간 백엔드 버전이 배포된 뒤에 씁니다. 운영 API 컨테이너와 같은 이미지·접속 설정으로 실행합니다.

```bash
# 1) 승인 목록을 EC2에 저장 (검수 담당에게 받은 JSON 붙여넣기 후 Ctrl+D)
cat > /tmp/approved.json

# 2) 미리보기 (DB 변경 없음)
sudo bash -c '. /opt/leren/current.env; IMG=$(docker images --format "{{.Repository}}" | grep "/leren-backend$" | head -1);
  docker run --rm -i --env-file /opt/leren/env/backend.env -e NODE_EXTRA_CA_CERTS=/certs/rds-ca.pem \
    -v /opt/leren/certs/rds-ca.pem:/certs/rds-ca.pem:ro "$IMG:$BACKEND_TAG" \
    node scripts/publish-stage-questions.js --file -' < /tmp/approved.json

# 3) 미리보기 결과가 맞으면 같은 명령 끝에 --apply를 붙여 저장
```

저장 후 확인:
- `docs/mvp-stage-and-shop-diagnostics.sql`에서 해당 Stage의 `eligible_slots = 3`, `missing_or_invalid_slots = 0`
- 앱 또는 `GET /api/v1/stages/{stageId}`의 `quizReady = true`

## 되돌리기

배정은 `content.stage_questions`의 해당 행을 지우고, 문항 상태를 이전 값으로 돌리면 됩니다. 사용자가 이미 풀었다면 응시·오답 기록이 그 문항을 가리키므로, 그때는 지우지 말고 새 버전 문항으로 교체하는 절차를 따로 정합니다.
