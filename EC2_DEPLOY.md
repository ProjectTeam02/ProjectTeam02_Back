# EC2에서 바로 HTTP 서비스 실행하기

이 배포본은 Node.js/Express API와 PostgreSQL 18(pgvector)을 함께 실행하고,
앱 DB 마이그레이션까지 자동 수행합니다. `.env`에는 이 배포본 전용으로 만든
임의 비밀번호와 JWT 비밀키가 이미 들어 있습니다. **`.env`를 GitHub 등에 올리지 마세요.**

Git에서 내려받았다면 먼저 `cp .env.example .env`를 실행하세요.
`openssl rand -hex 32`로 각각 별도 값을 만들어 `POSTGRES_PASSWORD`, `DB_PASSWORD`,
`DB_MIGRATION_PASSWORD`, `DB_AI_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`의
예시값을 교체하세요. FastAPI를 연결하는 경우 양쪽의 내부 인증 토큰을 일치시키세요.
아래 ZIP 전송 절차는 압축본으로 설치할 때 사용하며, Git으로 받은 경우 저장소에서
3단계부터 진행합니다.

## 1. EC2 준비

- Ubuntu EC2, 퍼블릭 IPv4 또는 Elastic IP, 인터넷으로 연결되는 서브넷/라우트(IGW) 사용.
- EC2 보안 그룹 인바운드: TCP **80** = 접속을 허용할 클라이언트에서 접근 가능하게 설정
  (일반 공개 HTTP 서비스는 `0.0.0.0/0`, SSH 22는 `내 IP`만 허용).
- EC2에 Docker Engine 및 Docker Compose 플러그인이 설치되어 있어야 합니다.
- 외부에 **5432(DB 포트)**를 열 필요가 없습니다.
- 이미 EC2 호스트에서 80 포트를 점유하는 Nginx/Apache 등이 있다면 해당 서비스와 포트 충돌이 납니다.

## 2. EC2에 파일 업로드

이 ZIP을 EC2로 전송하고 압축 해제합니다. 예시:

```bash
# 로컬 PC 터미널 (키 파일과 EC2 IP를 자신의 것으로 변경)
scp -i my-key.pem ProjectTeam02_Back_EC2_HTTP.zip ubuntu@EC2_PUBLIC_IP:~/

# EC2 SSH 터미널
cd ~
unzip ProjectTeam02_Back_EC2_HTTP.zip -d leren-backend
cd leren-backend
```

## 3. 실행 (처음/다음 배포 모두)

```bash
docker compose up -d --build
```

첫 실행 시 PostgreSQL이 시작하고 역할/스키마가 생성되며, `migrate` 서비스가
TypeORM 마이그레이션을 완료한 다음 `api`가 시작됩니다. DB 데이터는
`postgres_data` 볼륨에 보존됩니다. 재배포할 때 `docker compose down -v`는
실제 DB 데이터를 삭제하므로 사용하지 마세요.

### 접속 주소

- HTTP API 동작 확인: `http://EC2_PUBLIC_IP/health`
- Swagger API 문서: `http://EC2_PUBLIC_IP/api-docs`
- DB/AI 준비 상태: `http://EC2_PUBLIC_IP/api/v1/health/ready`

`/health`가 HTTP 200이면 **API 서버가 실행 중**이라는 뜻입니다. `/ready`는 별도
FastAPI가 없으면 503 (DEGRADED)이 나올 수 있습니다. 이 ZIP에는 AI FastAPI 서비스가
들어 있지 않으므로 해당 결과는 예상 가능한 상태입니다.

### 상태/문제 확인

```bash
docker compose ps
docker compose logs --tail=100 db
docker compose logs --tail=100 migrate
docker compose logs --tail=100 api
curl -i http://localhost/health
```

마이그레이션이 실패한 경우 `migrate` 로그에서 원인을 확인해야 하며,
그 상태에서는 `api`가 시작되지 않는 것이 정상입니다.

## 4. 운영 시 참고

- `.env`: DB 비밀번호와 JWT 비밀키는 자동 생성되어 있습니다. 카카오 로그인에
  필요한 `KAKAO_*` 값은 실제 키/승인된 콜백 URI로 별도 설정해야 합니다.
  **현재 프로젝트는 운영 환경의 카카오 모바일 OAuth 상태 저장소 구현이 없어
  키만 채운다고 바로 작동하지 않습니다.** 관련 기능은 추가 구현이 필요합니다.
- AI 기능: FastAPI 프로젝트는 별도로 실행해야 합니다. `.env`에 기본
  `FASTAPI_BASE_URL=http://host.docker.internal:8000`을 넣었습니다. FastAPI를 EC2
  호스트에서 실행한다면 해당 서비스가 Docker에서 접근 가능한 주소로 리슨해야 합니다.
  다른 서버/컨테이너를 사용한다면 해당 주소로 변경하세요. 내부 토큰도 일치시켜야 합니다.
- 이 구성은 *HTTP 전용*입니다. 공개 서비스에서 로그인/인증 토큰을 사용한다면
  도메인 및 HTTPS(443/인증서/리버스 프록시)로 전환해야 합니다.
- 외부 웹 프론트엔드와 연동할 때는 실제 프론트 출처에 맞는 CORS 설정을
  앱 코드에 추가로 적용해야 할 수 있습니다(현재 프로젝트에는 설정 파일만 있고
  CORS 미들웨어 적용은 확인되지 않음).
- 최초 DB에는 프로젝트의 초기 스키마/테이블만 생성되며 테스트용 시드 데이터는
  자동 입력하지 않습니다. 필요한 경우에만 `docker compose run --rm api npm run db:seed`
  로 넣으세요.
