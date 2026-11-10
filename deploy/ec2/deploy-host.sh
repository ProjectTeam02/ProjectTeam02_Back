#!/usr/bin/env bash
set -Eeuo pipefail

IMAGE="${1:?image digest is required}"
RELEASE_SHA="${2:?release SHA is required}"
ROOT="${LEREN_ROOT:-/opt/leren}"
REGION="${AWS_REGION:-ap-northeast-2}"
RELEASE_DIR="$ROOT/releases/$RELEASE_SHA"
STATE_DIR="$ROOT/state"
ENV_FILE="$ROOT/.env.production"
CA_FILE="$ROOT/rds-ca.pem"
COMPOSE_FILE="$RELEASE_DIR/docker-compose.yml"
PROJECT_NAME="leren-backend"

mkdir -p "$RELEASE_DIR" "$STATE_DIR"
test -r "$CA_FILE"

tmp_env="$(mktemp "$ROOT/.env.production.XXXXXX")"
cleanup() { rm -f "$tmp_env"; }
trap cleanup EXIT
chmod 600 "$tmp_env"

fetch_parameters() {
  local path="$1"
  aws ssm get-parameters-by-path \
    --region "$REGION" \
    --path "$path" \
    --recursive \
    --with-decryption \
    --query 'Parameters[].[Name,Value]' \
    --output text |
    while IFS=$'\t' read -r name value; do
      [ -n "${name:-}" ] || continue
      printf '%s=%s\n' "${name##*/}" "$value"
    done >> "$tmp_env"
}

fetch_parameters /leren/prod/backend
fetch_parameters /leren/prod/migrate

set_default() {
  local key="$1"
  local value="$2"
  if ! grep -q "^${key}=" "$tmp_env"; then
    printf '%s=%s\n' "$key" "$value" >> "$tmp_env"
  fi
}

set_default NODE_ENV production
set_default PORT 3000
set_default DB_SSL true
set_default DB_SSL_CA /certs/rds-ca.pem
set_default FASTAPI_BASE_URL http://host.docker.internal:8000
set_default FASTAPI_TIMEOUT_MS 5000
set_default AI_DAILY_LIMIT 20
set_default KAKAO_OAUTH_STORE_MODE postgres
set_default KAKAO_LEGACY_DIRECT_LOGIN_ENABLED false
set_default QUESTION_GENERATION_ENABLED false
set_default QUESTION_GENERATION_TIMEOUT_MS 120000
required=(
  DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD
  DB_MIGRATION_USER DB_MIGRATION_PASSWORD
  JWT_ACCESS_SECRET JWT_REFRESH_SECRET FASTAPI_INTERNAL_TOKEN
  CORS_ORIGIN
  KAKAO_REST_API_KEY KAKAO_CLIENT_SECRET
  KAKAO_ALLOWED_REDIRECT_URIS KAKAO_OAUTH_CALLBACK_URL
  KAKAO_APP_DEEP_LINK KAKAO_ALLOWED_APP_DEEP_LINKS
)
for key in "${required[@]}"; do
  if ! grep -q "^${key}=" "$tmp_env"; then
    echo "missing Parameter Store value: $key" >&2
    exit 20
  fi
done

# Never migrate the old local PostgreSQL container implicitly. The first RDS
# deployment is allowed only after DB_HOST points at the verified RDS endpoint.
db_host="$(sed -n 's/^DB_HOST=//p' "$tmp_env" | tail -n1)"
case "$db_host" in
  db|localhost|127.*|0.0.0.0|::1)
    echo "refusing deployment with a local DB_HOST=$db_host; migrate to RDS first" >&2
    exit 21
    ;;
esac

docker login --username AWS --password-stdin \
  "955094290134.dkr.ecr.$REGION.amazonaws.com" \
  < <(aws ecr get-login-password --region "$REGION") >/dev/null
docker pull "$IMAGE" >/dev/null

# Write the runtime environment only after all required values are present.
mv "$tmp_env" "$ENV_FILE"
chmod 600 "$ENV_FILE"
trap - EXIT

# Migration happens while the current API container is still serving traffic.
# A non-zero migration result exits here and leaves the current container alone.
docker run --rm \
  --env-file "$ENV_FILE" \
  --volume "$CA_FILE:/certs/rds-ca.pem:ro" \
  "$IMAGE" npm run db:migrate

old_containers="$(docker ps -q --filter publish=80 || true)"
old_image=''
if [ -f "$STATE_DIR/current-image" ]; then
  old_image="$(cat "$STATE_DIR/current-image")"
fi
if [ -z "$old_image" ] && [ -n "$old_containers" ]; then
  old_image="$(docker inspect --format '{{.Config.Image}}' $(printf '%s\n' "$old_containers" | head -n1))"
fi

if [ -n "$old_containers" ]; then
  docker stop $old_containers >/dev/null
fi

export BACKEND_IMAGE="$IMAGE"
compose=(docker compose --project-name "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
rollback() {
  echo "new image health check failed; restoring previous image" >&2
  "${compose[@]}" down --remove-orphans >/dev/null 2>&1 || true
  if [ -n "$old_containers" ]; then
    docker start $old_containers >/dev/null 2>&1 || true
  elif [ -n "$old_image" ]; then
    export BACKEND_IMAGE="$old_image"
    "${compose[@]}" up -d --no-build api >/dev/null 2>&1 || true
  fi
  exit 30
}

"${compose[@]}" up -d --no-build api

healthy=false
for _ in $(seq 1 60); do
  if curl --fail --silent --show-error http://127.0.0.1/health >/dev/null \
    && curl --fail --silent --show-error http://127.0.0.1/api/v1/health/ready >/dev/null; then
    healthy=true
    break
  fi
  sleep 5
done
[ "$healthy" = true ] || rollback

if [ -n "$old_containers" ]; then
  docker rm $old_containers >/dev/null 2>&1 || true
fi
if [ -n "$old_image" ]; then
  printf '%s\n' "$old_image" > "$STATE_DIR/previous-image"
fi
printf '%s\n' "$IMAGE" > "$STATE_DIR/current-image"
printf '%s\n' "$RELEASE_SHA" > "$STATE_DIR/current-release"
printf '%s\n' "$IMAGE" > "$RELEASE_DIR/image"
echo "deployed $IMAGE"
