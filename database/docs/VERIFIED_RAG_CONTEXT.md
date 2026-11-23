# Verified RAG Backend 계약

Backend는 튜터 요청의 개념 식별자를 사용해 `verifiedContext`를 구성한다.

- `content.concepts`: `PUBLISHED`, 공개 주제, `reviewed_by`, `reviewed_at` 필수
- `content.concepts.source_document_ids`: 모든 ID가 `ai.rag_documents`에 존재해야 함
- `ai.rag_documents`: `review_status=approved`이고 `metadata_json.license_review_status`가
  `approved`, `cleared`, `verified` 중 하나여야 함
- `content.concept_prerequisites`: `APPROVED`, `reviewed_by`, `reviewed_at` 필수

조건을 하나라도 만족하지 못하면 `verificationStatus=BLOCKED`로 보내며 문서 ID와
출처를 비운다. 기존 CSV의 승인 표기나 PENDING 라이선스를 DB 승인으로 승격하지
않는다. 모든 조건을 만족할 때만 `verificationStatus=VERIFIED`, 출처 목록과
선수 개념 목록을 AI 내부 요청에 추가한다.

## 스키마 변경

`1795200000000-ConceptPrerequisiteReview` 마이그레이션이 선수 관계에 다음을
추가한다.

- `review_status` 기본값 `REVIEW_PENDING`
- `reviewed_by`, `reviewed_at`
- 허용 상태 CHECK 및 상태 인덱스

기존 행은 자동 승인되지 않는다. 운영 DB에는 적용하지 않았으며, 개발·테스트
PostgreSQL에서 마이그레이션을 검증한 뒤 적용해야 한다.
