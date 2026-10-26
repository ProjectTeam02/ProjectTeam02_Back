-- ai 스키마와 AI 서버 계정 초기화 (관리자 계정으로 최초 1회, 01_app_schema.sql 다음에 실행)
-- 소유 구분 (ProjectTeam02_AI #5): app 스키마 = Node.js 백엔드 / ai 스키마 = FastAPI (RAG 문서·청크·임베딩, pgvector)
-- AI 서버 설정: DATABASE_URL은 ai_user 계정, VECTOR_STORE_SCHEMA=ai
-- 비밀번호는 실제 환경에서 반드시 변경 (RDS는 Parameter Store 값 사용)

-- pgvector: vector 타입은 public 스키마에 설치되고 search_path로 사용 (RDS PostgreSQL 16 지원, rds_superuser 권한 필요)
CREATE EXTENSION IF NOT EXISTS vector;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_user') THEN CREATE ROLE ai_user LOGIN PASSWORD 'ai_local'; END IF;
END $$;

-- RDS에서는 마스터 계정이 ai_user 소유 스키마를 만들 수 있도록 멤버십 필요
GRANT ai_user TO CURRENT_USER;

-- ai 스키마는 ai_user 소유: FastAPI가 자기 테이블(rag_documents, rag_document_chunks, LlamaIndex 벡터 테이블 등)을 직접 만든다
CREATE SCHEMA IF NOT EXISTS ai AUTHORIZATION ai_user;

-- AI 서버는 app 스키마(사용자·대화 기록)에 접근하지 않는다. 대화 기록은 Node.js가 요청에 담아 보낸다
REVOKE ALL ON SCHEMA app FROM ai_user;
-- 백엔드 계정도 ai 스키마를 바꾸지 않는다 (필요하면 읽기 권한만 별도 부여)
REVOKE ALL ON SCHEMA ai FROM app_user, migrator;

ALTER ROLE ai_user SET search_path = ai, public;
