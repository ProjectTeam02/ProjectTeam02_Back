-- ai.rag_documents.license_review_status 추가 (#164, 이미 운영 중인 DB용, ai_user 권한으로 실행)
-- 이유: 출처·내용 검수(review_status)와 원문 이용 조건(라이선스) 승인을 따로 관리한다 (Backend 계획서 BE-02, #160 결정)
--   PENDING  = 이용 조건 확인 전 (기본값, AI 적재 코드는 이 컬럼을 몰라도 그대로 동작)
--   APPROVED = 이용 조건 확인 완료 → 승인 근거로 사용 가능
--   REJECTED = 사용 불가
-- 기존 문서는 모두 PENDING으로 들어간다. 출처별 이용 조건을 확인한 뒤 UPDATE로 승인한다 (이 파일은 승인하지 않음)
-- 새로 만드는 DB는 03_ai_tables.sql에 이 컬럼이 있어서 실행할 필요가 없다. 여러 번 실행해도 안전하다 (IF NOT EXISTS)
--   RDS:  psql "host=127.0.0.1 port=15432 dbname=leren user=ai_user sslmode=require" -v ON_ERROR_STOP=1 -f database/sql/ai/add_license_review_status.sql
\set ON_ERROR_STOP 1

SET ROLE ai_user;

ALTER TABLE ai.rag_documents ADD COLUMN IF NOT EXISTS license_review_status varchar(30) NOT NULL DEFAULT 'PENDING';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_rag_documents_license_review_status' AND conrelid = 'ai.rag_documents'::regclass) THEN
    ALTER TABLE ai.rag_documents ADD CONSTRAINT chk_rag_documents_license_review_status
      CHECK (license_review_status IN ('PENDING', 'APPROVED', 'REJECTED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_rag_documents_license_review_status ON ai.rag_documents (license_review_status);

COMMENT ON COLUMN ai.rag_documents.license_review_status IS '원문 이용 조건(라이선스) 승인 상태 PENDING/APPROVED/REJECTED. review_status(출처·내용 검수)와 별도';

RESET ROLE;
