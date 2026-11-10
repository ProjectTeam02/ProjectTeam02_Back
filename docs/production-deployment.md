# Production ECR·EC2 배포

## 흐름

1. `CI / test`와 `db-check / verify`가 같은 `develop` 커밋에서 성공한다.
2. `ECR image publish`가 두 실행을 확인한 뒤 `linux/arm64` 이미지를 빌드한다.
3. ECR의 immutable SHA tag와 digest를 `GITHUB_STEP_SUMMARY` 및 artifact에 기록한다.
4. 동일 SHA tag가 이미 있으면 다시 빌드하지 않고 기존 digest를 사용한다.
5. `EC2 deploy`는 `production` environment 승인을 받은 뒤 SSM으로 EC2에 배포한다.
6. EC2는 Parameter Store에서 환경변수를 만들고, RDS 마이그레이션을 먼저 실행한다.
7. 마이그레이션이 성공한 경우에만 기존 API 컨테이너를 새 digest로 교체한다.
8. `/health`와 `/api/v1/health/ready`가 모두 성공하면 이전 digest와 현재 digest를 기록한다.
9. 교체 후 상태 확인이 실패하면 이전 컨테이너 또는 이전 image digest를 복구하고 배포를 실패시킨다.

## AWS 사전 조건

- GitHub OIDC trust subject는 `repo:ProjectTeam02/ProjectTeam02_Back:environment:production`이다.
- GitHub `production` environment에 required reviewer를 설정해야 첫 배포가 수동 승인된다.
- EC2 instance profile은 ECR pull, SSM 관리, `/leren/prod/*` Parameter Store read 권한이 필요하다.
- RDS PostgreSQL은 private이고 EC2 security group에서 5432만 허용해야 한다.
- `/opt/leren/rds-ca.pem`이 EC2에 설치되어 있어야 한다.
- 현재 확인된 RDS는 `leren-dev-db` PostgreSQL 18.3이며 EC2에서 5432 접근이 허용되어 있다.

## Parameter Store

배포 스크립트는 아래 경로를 복호화해 `/opt/leren/.env.production`을 생성한다.

- `/leren/prod/backend/*`
- `/leren/prod/migrate/*`

`/leren/prod/backend`에는 현재 운영 계약에 필요한 `CORS_ORIGIN`과 Kakao OAuth
설정(`KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`,
`KAKAO_ALLOWED_REDIRECT_URIS`, `KAKAO_OAUTH_CALLBACK_URL`, `KAKAO_APP_DEEP_LINK`,
`KAKAO_ALLOWED_APP_DEEP_LINKS`)도 등록해야 한다. 이 값이 없으면 배포 스크립트는
마이그레이션을 실행하기 전에 중단한다. CORS를 `*`로 넓히거나 OAuth를 빈 값으로
배포하지 않는다.

JWT, DB password, FastAPI token 등 secret은 GitHub Actions 변수나 이미지에 넣지 않는다.
현재 EC2의 API가 이미 RDS endpoint와 FastAPI에 연결되어 있는지 확인한 뒤 배포하도록 하며,
`DB_HOST`가 `db`, `localhost`, `127.*`이면 안전을 위해 배포를 중단한다. 로컬 PostgreSQL에
남은 데이터가 실제 운영 데이터라면 RDS로 별도 이전·대조한 뒤 Parameter Store의 `DB_HOST`를
RDS endpoint로 바꾸고 배포해야 한다.

## 복구 기록

EC2에는 다음 파일이 남는다.

- `/opt/leren/state/current-image`
- `/opt/leren/state/previous-image`
- `/opt/leren/state/current-release`
- `/opt/leren/releases/<commit-sha>/image`

마이그레이션 실패는 기존 컨테이너를 중지하기 전에 종료한다. 새 이미지의 상태 확인 실패는
새 Compose 서비스를 내리고 이전 컨테이너 또는 이전 image를 시작한 뒤 Actions를 실패시킨다.
