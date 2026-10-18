-- app 스키마와 DB 계정 초기화 (관리자 계정으로 최초 1회 실행)
-- 로컬: docker-compose가 자동 실행 / RDS: 마스터 계정으로 EC2에서 1회 실행
-- 비밀번호는 실제 환경에서 반드시 변경 (RDS는 Parameter Store 값 사용)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migrator') THEN CREATE ROLE migrator LOGIN PASSWORD 'migrator_local'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN CREATE ROLE app_user LOGIN PASSWORD 'app_local'; END IF;
END $$;

-- RDS에서는 마스터 계정이 migrator 소유 스키마를 만들 수 있도록 멤버십 필요
GRANT migrator TO CURRENT_USER;

CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION migrator;
GRANT USAGE ON SCHEMA app TO app_user;

-- migrator가 앞으로 만드는 테이블·시퀀스에 app_user 읽기·쓰기 자동 부여
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- 접속 시 기본 스키마를 app으로 (TypeORM 생성 컬럼 메타데이터가 app 스키마에 기록되도록)
ALTER ROLE migrator SET search_path = app, public;
ALTER ROLE app_user SET search_path = app, public;
