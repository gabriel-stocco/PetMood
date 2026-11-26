#!/usr/bin/env bash
# Idempotent deploy of the PetMood backend: creates what is missing, updates the rest.
#   AWS_PROFILE=App-dev-786788037131 bash aws/deploy.sh
# Secrets live in aws/.env.deploy (git-ignored, created on first run).
set -euo pipefail

export AWS_PROFILE="${AWS_PROFILE:-App-dev-786788037131}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-sa-east-1}"
export AWS_PAGER=""
REGION="$AWS_DEFAULT_REGION"
ACCOUNT=786788037131
APP=cc-petmood
PREFIX="$APP-"
FN="$APP-api"
ROLE="$APP-lambda-role"
API_NAME="$APP-http-api"
BUCKET="$APP-files-$ACCOUNT"
BOUNDARY="arn:aws:iam::$ACCOUNT:policy/cc-lambda-boundary"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$HERE/.env.deploy"
HELP="$HERE/scripts/helpers.py"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Windows: aws.exe / python.exe need native paths.
win() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
py() { python -I "$(win "$HELP")" "$@"; }
log() { printf '\n== %s\n' "$*"; }

actual=$(aws sts get-caller-identity --query Account --output text)
[ "$actual" = "$ACCOUNT" ] || { echo "Wrong account: $actual (expected $ACCOUNT)"; exit 1; }

# --- secrets ---------------------------------------------------------------
py init-env "$(win "$ENV_FILE")"
envval() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"\r'; }
API_KEY="$(envval API_KEY)"
JWT_SECRET="$(envval JWT_SECRET)"
GOOGLE_CLIENT_ID="$(envval GOOGLE_CLIENT_ID)"
GOOGLE_CLIENT_SECRET="$(envval GOOGLE_CLIENT_SECRET)"

# --- DynamoDB --------------------------------------------------------------
create_table() {  # name hashKey [rangeKey]
  local t="$PREFIX$1"
  if aws dynamodb describe-table --table-name "$t" >/dev/null 2>&1; then
    echo "table $t exists"
    return
  fi
  local attrs="AttributeName=$2,AttributeType=S" schema="AttributeName=$2,KeyType=HASH"
  if [ -n "${3:-}" ]; then
    attrs="$attrs AttributeName=$3,AttributeType=S"
    schema="$schema AttributeName=$3,KeyType=RANGE"
  fi
  # shellcheck disable=SC2086
  aws dynamodb create-table --table-name "$t" --attribute-definitions $attrs --key-schema $schema \
    --billing-mode PAY_PER_REQUEST --deletion-protection-enabled >/dev/null
  aws dynamodb wait table-exists --table-name "$t"
  aws dynamodb update-continuous-backups --table-name "$t" \
    --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true >/dev/null
  echo "table $t created"
}

log "DynamoDB tables"
create_table users id_usuario
create_table identities ident
create_table animals id_usuario id_animal
create_table vaccines id_usuario id_vacina
create_table events id_usuario id_evento
create_table tips id_dicas
create_table ads id_propaganda
create_table files name   # photos only when FILE_STORE=dynamodb (fallback; default is S3)

log "Seed tips and ads"
py seed "$(win "$HERE/seed/seed_data.json")" "$(win "$TMP")" "$PREFIX"
for t in tips ads; do
  aws dynamodb batch-write-item --request-items "file://$(win "$TMP/seed-$t.json")" \
    --query 'length(UnprocessedItems)' --output text | grep -qx 0 || echo "WARN: unprocessed items in $t"
done

# --- S3 ----------------------------------------------------------------------
log "S3 bucket $BUCKET"
if ! aws s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  aws s3api create-bucket --bucket "$BUCKET" --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
  echo "bucket created"
fi
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-ownership-controls --bucket "$BUCKET" --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
py bucket-policy "$(win "$TMP/bucket-policy.json")" "$BUCKET"
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "file://$(win "$TMP/bucket-policy.json")"

# --- IAM ---------------------------------------------------------------------
log "IAM role $ROLE"
py policies "$(win "$TMP")" "$REGION" "$ACCOUNT" "$APP"
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document "file://$(win "$TMP/trust.json")" \
    --permissions-boundary "$BOUNDARY" >/dev/null
  echo "role created; waiting for IAM propagation"
  NEW_ROLE=1
fi
aws iam put-role-policy --role-name "$ROLE" --policy-name "$APP-access" --policy-document "file://$(win "$TMP/access.json")"
ROLE_ARN=$(aws iam get-role --role-name "$ROLE" --query Role.Arn --output text)
[ "${NEW_ROLE:-0}" = 1 ] && sleep 12

# --- Lambda --------------------------------------------------------------------
log "Lambda $FN"
py zip "$(win "$HERE/lambda")" "$(win "$TMP/lambda.zip")"
if aws lambda get-function --function-name "$FN" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FN" --zip-file "fileb://$(win "$TMP/lambda.zip")" >/dev/null
  aws lambda wait function-updated --function-name "$FN"
  aws lambda get-function-configuration --function-name "$FN" --query Environment.Variables --output json >"$TMP/env-current.json"
else
  echo '{}' >"$TMP/env-current.json"
  for i in 1 2 3 4 5; do
    if aws lambda create-function --function-name "$FN" --runtime python3.13 --architectures x86_64 \
      --handler handler.handler --role "$ROLE_ARN" --memory-size 512 --timeout 30 \
      --zip-file "fileb://$(win "$TMP/lambda.zip")" >/dev/null 2>"$TMP/create.err"; then
      break
    fi
    grep -q "cannot be assumed" "$TMP/create.err" || { cat "$TMP/create.err"; exit 1; }
    echo "role not ready yet, retrying ($i)"; sleep 10
  done
  aws lambda wait function-active --function-name "$FN"
fi
# Merge, never replace: values not listed here are kept; empty Google values never erase existing ones.
py merge-env "$(win "$TMP/env-current.json")" "$(win "$TMP/env.json")" \
  "API_KEY=$API_KEY" "JWT_SECRET=$JWT_SECRET" "TABLE_PREFIX=$PREFIX" "BUCKET=$BUCKET" \
  "FILE_STORE=${FILE_STORE:-s3}" \
  "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID" "GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET"
aws lambda update-function-configuration --function-name "$FN" --environment "file://$(win "$TMP/env.json")" >/dev/null
aws lambda wait function-updated --function-name "$FN"
FN_ARN=$(aws lambda get-function --function-name "$FN" --query Configuration.FunctionArn --output text)

# --- API Gateway (HTTP API, one $default route) --------------------------------
log "API Gateway $API_NAME"
API_ID=$(aws apigatewayv2 get-apis --query "Items[?Name=='$API_NAME'].ApiId | [0]" --output text)
if [ -z "$API_ID" ] || [ "$API_ID" = "None" ]; then
  API_ID=$(aws apigatewayv2 create-api --name "$API_NAME" --protocol-type HTTP --query ApiId --output text)
  echo "api created: $API_ID"
fi
INTEG_ID=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --query "Items[?IntegrationUri=='$FN_ARN'].IntegrationId | [0]" --output text)
if [ -z "$INTEG_ID" ] || [ "$INTEG_ID" = "None" ]; then
  INTEG_ID=$(aws apigatewayv2 create-integration --api-id "$API_ID" --integration-type AWS_PROXY \
    --integration-uri "$FN_ARN" --payload-format-version 2.0 --timeout-in-millis 30000 --query IntegrationId --output text)
fi
ROUTE_ID=$(aws apigatewayv2 get-routes --api-id "$API_ID" --query "Items[?RouteKey=='\$default'].RouteId | [0]" --output text)
if [ -z "$ROUTE_ID" ] || [ "$ROUTE_ID" = "None" ]; then
  aws apigatewayv2 create-route --api-id "$API_ID" --route-key '$default' --target "integrations/$INTEG_ID" >/dev/null
else
  aws apigatewayv2 update-route --api-id "$API_ID" --route-id "$ROUTE_ID" --target "integrations/$INTEG_ID" >/dev/null
fi
if ! aws apigatewayv2 get-stage --api-id "$API_ID" --stage-name '$default' >/dev/null 2>&1; then
  aws apigatewayv2 create-stage --api-id "$API_ID" --stage-name '$default' --auto-deploy \
    --default-route-settings ThrottlingBurstLimit=50,ThrottlingRateLimit=25 >/dev/null
else
  aws apigatewayv2 update-stage --api-id "$API_ID" --stage-name '$default' --auto-deploy \
    --default-route-settings ThrottlingBurstLimit=50,ThrottlingRateLimit=25 >/dev/null
fi
aws lambda add-permission --function-name "$FN" --statement-id apigw-invoke --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT:$API_ID/*" >/dev/null 2>&1 \
  || echo "invoke permission already present"

API_URL="https://$API_ID.execute-api.$REGION.amazonaws.com"
echo "$API_URL" >"$HERE/.api-url"
log "Done. API URL: $API_URL"
[ -n "$GOOGLE_CLIENT_ID" ] || echo "NOTE: GOOGLE_CLIENT_ID/SECRET are empty in aws/.env.deploy; Google sign-in returns 503 until you set them and re-run."
