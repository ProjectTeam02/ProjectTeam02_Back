# Verified RAG Backend 계약

Backend는 튜터 요청의 개념 식별자(`context.conceptCode` / `context.conceptId`)로
`verifiedContext`를 구성한다 (`src/modules/tutor/verified-context.repository.js`).

- `content.concepts`: `PUBLISHED`, 공개 주제, `reviewed_by`, `reviewed_at` 필수
- `content.concepts.source_document_ids`: 1개 이상, 모든 ID가 `ai.rag_documents`에 존재
- `ai.rag_documents`: `review_status=approved` 이고 `license_review_status=APPROVED`
  (#164 컬럼, 대소문자 무시). `metadata_json` 안의 표기는 사용하지 않는다.
- `content.concept_prerequisites`: `review_status=APPROVED`, `reviewed_by`, `reviewed_at`이
  모두 있는 관계만 `prerequisiteConcepts`에 넣는다. 미승인 관계는 **제외**하며 개념 전체를
  막지 않는다 (`personalization/conceptContext.js`와 같은 정책).

개념·출처·라이선스 조건을 하나라도 만족하지 못하면 `verificationStatus=BLOCKED`로 보내며
문서 ID와 출처를 비운다. 조회 자체가 실패해도 `BLOCKED`(`VERIFIED_CONTEXT_UNAVAILABLE`)로
보낸다. 기존 CSV의 승인 표기나 PENDING 라이선스를 DB 승인으로 승격하지 않는다.

## 스키마

별도 마이그레이션은 없다. 선수 관계 검수 컬럼은 #164
`1795300000000-ConceptReviewMisconception`(`content.relation_review_status` enum,
기본 `PENDING`), 라이선스 컬럼은 `database/sql/ai/add_license_review_status.sql`이 기준이다.

## 운영 영향

운영 개념 29개·선수 관계 26개에 검수자/검수일이 비어 있으면 해당 개념 질문은 모두
`BLOCKED` → AI Fail-Closed(근거 부족 응답)가 된다. 검수 기록 입력은 사람이 해야 한다.
