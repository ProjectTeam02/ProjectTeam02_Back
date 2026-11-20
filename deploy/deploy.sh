#!/usr/bin/env bash
# Leren 운영 배포 스크립트 (EC2에서 root로 실행)
#   사용법: sudo bash /opt/leren/deploy/deploy.sh <백엔드 태그|current> <AI 태그|current>
#   예시  : sudo bash /opt/leren/deploy/deploy.sh 1a2b3c4d5e6f current   # 백엔드만 새 버전, AI는 그대로
#   옵션  : SKIP_MIGRATE=1  마이그레이션 건너뛰기 / API_HOST_PORT=3000  ALB가 보는 호스트 포트
# 순서: Parameter Store → env 파일 → 필수 설정 검사 → ECR pull → 마이그레이션 → 컨테이너 교체·헬스체크
#       → 실패하면 이전 버전으로 자동 복귀 → 기록(/opt/leren/deploy.log, current.env)
set -Eeuo pipefail
umask 077

REGION=ap-northeast-2
ECR_REGISTRY=955094290134.dkr.ecr.${REGION}.amazonaws.com
BASE=/opt/leren
DEPLOY_DIR=$(cd "$(dirname "$0")" && pwd)
COMPOSE_FILE=$DEPLOY_DIR/docker-compose.prod.yml
STATE=$BASE/current.env
LOG=$BASE/deploy.log
RDS_CA=$BASE/certs/rds-ca.pem
RDS_CA_URL=https://truststore.pki.rds.amazonaws.com/${REGION}/${REGION}-bundle.pem

log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }
get_state() { grep -m1 "^$1=" "$STATE" 2>/dev/null | cut -d= -f2- || true; }

[ "$(id -u)" -eq 0 ] || { echo "root 권한이 필요해요: sudo bash $0 <백엔드 태그|current> <AI 태그|current>"; exit 1; }
[ $# -eq 2 ] || { echo "사용법: $0 <백엔드 태그|current> <AI 태그|current>"; exit 1; }
[ -f "$COMPOSE_FILE" ] || { echo "Compose 파일이 없어요: $COMPOSE_FILE"; exit 1; }

mkdir -p "$BASE/env" "$BASE/certs" "$BASE/ai/data"
exec 9>/var/lock/leren-deploy.lock
flock -n 9 || { echo "다른 배포가 진행 중이에요"; exit 1; }

# Compose 2.30 이상 필요 (env_file의 format: raw — 비밀값의 $, 따옴표를 그대로 전달)
CV=$(docker compose version --short 2>/dev/null || echo 0)
[ "$(printf '%s\n' 2.30.0 "${CV#v}" | sort -V | head -1)" = 2.30.0 ] \
  || { echo "Docker Compose 2.30 이상이 필요해요 (현재 $CV)"; exit 1; }

# 0) 배포할 태그 정하기 (current = 지금 실행 중인 태그 유지)
PREV_BACKEND_TAG=$(get_state BACKEND_TAG)
PREV_AI_TAG=$(get_state AI_TAG)
BACKEND_TAG=$1; [ "$BACKEND_TAG" = current ] && BACKEND_TAG=$PREV_BACKEND_TAG
AI_TAG=$2;      [ "$AI_TAG" = current ] && AI_TAG=$PREV_AI_TAG
[ -n "$BACKEND_TAG" ] && [ -n "$AI_TAG" ] || { echo "첫 배포에서는 두 태그를 모두 지정해야 해요"; exit 1; }
export ECR_REGISTRY BACKEND_TAG AI_TAG

trap 'log "FAIL backend=$BACKEND_TAG ai=$AI_TAG (line $LINENO)"' ERR
log "START backend=$BACKEND_TAG ai=$AI_TAG prev=${PREV_BACKEND_TAG:-none}/${PREV_AI_TAG:-none}"

# 1) Parameter Store → env 파일 (root만 읽기)
load_env() {
  local path=$1 out=$2
  aws ssm get-parameters-by-path --region "$REGION" --path "$path" --recursive --with-decryption \
    --query 'Parameters[*].[Name,Value]' --output text \
  | while IFS=$'\t' read -r name value; do printf '%s=%s\n' "${name##*/}" "$value"; done > "$out.tmp"
  [ -s "$out.tmp" ] || { rm -f "$out.tmp"; echo "$path 에서 값을 읽지 못했어요"; return 1; }
  chmod 600 "$out.tmp" && mv "$out.tmp" "$out"
}
load_env /leren/prod/backend/ "$BASE/env/backend.env"
load_env /leren/prod/migrate/ "$BASE/env/migrate.env"
load_env /leren/prod/ai/      "$BASE/env/ai.env"

# 1-1) 카카오 로그인 필수 설정 확인. 없거나 맞지 않으면 마이그레이션·컨테이너 교체 전에 중단 (기존 서버 유지)
check_backend_env() {
  local f=$BASE/env/backend.env key missing=()
  for key in KAKAO_REST_API_KEY KAKAO_CLIENT_SECRET KAKAO_ALLOWED_REDIRECT_URIS KAKAO_OAUTH_CALLBACK_URL \
             KAKAO_APP_DEEP_LINK KAKAO_ALLOWED_APP_DEEP_LINKS KAKAO_OAUTH_STORE_MODE KAKAO_WEB_RETURN_URL; do
    grep -q "^${key}=." "$f" || missing+=("$key")
  done
  [ ${#missing[@]} -eq 0 ] || { log "FAIL Parameter Store /leren/prod/backend/ 필수 값 없음: ${missing[*]}"; return 1; }
  grep -qx 'KAKAO_OAUTH_STORE_MODE=postgres' "$f" \
    || { log "FAIL KAKAO_OAUTH_STORE_MODE는 운영에서 postgres여야 해요"; return 1; }
  if grep -q '^KAKAO_WEB_RETURN_URL=http://' "$f" && ! grep -qx 'KAKAO_ALLOW_LOOPBACK_WEB_RETURN=true' "$f"; then
    log "FAIL KAKAO_WEB_RETURN_URL이 http://이면 KAKAO_ALLOW_LOOPBACK_WEB_RETURN=true가 필요해요"; return 1
  fi
}
check_backend_env || exit 1

# 2) RDS 인증서 (없을 때만 내려받기)
if [ ! -s "$RDS_CA" ]; then
  curl -fsSL "$RDS_CA_URL" -o "$RDS_CA.tmp" && mv "$RDS_CA.tmp" "$RDS_CA"
fi
chmod 644 "$RDS_CA"
[ -n "$(ls -A "$BASE/ai/data" 2>/dev/null)" ] || log "WARN $BASE/ai/data 가 비어 있어요 (AI 자료 파일 확인 필요)"

# 3) ECR에서 이미지 받기
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY" > /dev/null
docker pull -q "$ECR_REGISTRY/leren-backend:$BACKEND_TAG"
docker pull -q "$ECR_REGISTRY/leren-ai:$AI_TAG"

COMPOSE=(docker compose -f "$COMPOSE_FILE")

# 4) DB 마이그레이션 (백엔드 버전이 바뀔 때만). 실패하면 여기서 멈추고 기존 컨테이너는 그대로
if [ "${SKIP_MIGRATE:-0}" != 1 ] && [ "$BACKEND_TAG" != "$PREV_BACKEND_TAG" ]; then
  log "MIGRATE backend=$BACKEND_TAG"
  "${COMPOSE[@]}" --profile tools run --rm migrate
fi

# 5) 컨테이너 교체 → 헬스체크 통과까지 대기. 실패하면 이전 버전으로 되돌림
if ! "${COMPOSE[@]}" up -d --remove-orphans --wait --wait-timeout 180; then
  log "UNHEALTHY backend=$BACKEND_TAG ai=$AI_TAG"
  "${COMPOSE[@]}" ps || true
  if [ -n "$PREV_BACKEND_TAG" ] && [ -n "$PREV_AI_TAG" ]; then
    BACKEND_TAG=$PREV_BACKEND_TAG AI_TAG=$PREV_AI_TAG \
      "${COMPOSE[@]}" up -d --remove-orphans --wait --wait-timeout 180 \
      && log "ROLLBACK to backend=$PREV_BACKEND_TAG ai=$PREV_AI_TAG"
  fi
  exit 1
fi

# 6) 기록
printf 'BACKEND_TAG=%s\nAI_TAG=%s\n' "$BACKEND_TAG" "$AI_TAG" > "$STATE"
chmod 644 "$STATE"

# 7) 정리: 저장소별로 현재·직전 이미지만 남기기
for repo in leren-backend leren-ai; do
  if [ "$repo" = leren-backend ]; then keep=$BACKEND_TAG; prev=${PREV_BACKEND_TAG:-none}; else keep=$AI_TAG; prev=${PREV_AI_TAG:-none}; fi
  docker images "$ECR_REGISTRY/$repo" --format '{{.Tag}}' | grep -vxF -e "$keep" -e "$prev" \
    | xargs -r -I{} docker rmi "$ECR_REGISTRY/$repo:{}" > /dev/null 2>&1 || true
done
docker image prune -f > /dev/null 2>&1 || true

log "DONE backend=$BACKEND_TAG ai=$AI_TAG"
"${COMPOSE[@]}" ps
echo "== /health: $(curl -s "http://127.0.0.1:${API_HOST_PORT:-3000}/health" || echo 응답없음)"
