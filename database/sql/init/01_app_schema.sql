-- 앱 스키마와 DB 계정 초기화 (관리자 계정으로 실행, 여러 번 실행해도 안전)
-- 로컬: docker-compose가 자동 실행 / RDS: 마스터 계정으로 EC2에서 실행
-- 비밀번호는 실제 환경에서 반드시 변경 (RDS는 Parameter Store 값 사용)
-- #98: 업무 테이블은 영역별 스키마 7개(account, character, content, learning, reward, review, tutor)에 두고,
--      app 스키마에는 TypeORM 관리용(migrations, typeorm_metadata)만 남긴다.
--      이미 운영 중인 DB(RDS)는 SplitAppSchema 마이그레이션 전에 이 파일을 다시 실행해 스키마 7개를 먼저 만든다.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migrator') THEN CREATE ROLE migrator LOGIN PASSWORD 'migrator_local'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN CREATE ROLE app_user LOGIN PASSWORD 'app_local'; END IF;
END $$;

-- RDS에서는 마스터 계정이 migrator 소유 스키마를 만들 수 있도록 멤버십 필요
GRANT migrator TO CURRENT_USER;

-- 스키마 8개: app(TypeORM 관리용) + 영역별 7개. 모두 migrator 소유, app_user는 사용(USAGE)만
DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['app', 'account', 'character', 'content', 'learning', 'reward', 'review', 'tutor'] LOOP
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I AUTHORIZATION migrator', s);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO app_user', s);
    -- migrator가 앞으로 만드는 테이블·시퀀스에 app_user 읽기·쓰기 자동 부여
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user', s);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO app_user', s);
  END LOOP;
END $$;

-- 접속 시 검색 순서: app이 맨 앞 (TypeORM 생성 컬럼 메타데이터가 app 스키마에 기록되도록), 그다음 영역별 스키마
-- 서버 코드는 엔티티에 스키마가 지정되어 있어 검색 순서와 관계없이 동작한다. 직접 쓰는 SQL·psql 작업이 스키마 이름 없이도 동작하도록 함께 둔다
ALTER ROLE migrator SET search_path = app, account, character, content, learning, reward, review, tutor, public;
ALTER ROLE app_user SET search_path = app, account, character, content, learning, reward, review, tutor, public;
