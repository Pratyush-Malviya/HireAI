#!/usr/bin/env bash
# =============================================================================
# deploy-cloudrun.sh — One-shot deploy script for HireAI on Google Cloud Run
#
# Usage:
#   bash deploy-cloudrun.sh
#
# Prerequisites:
#   - gcloud CLI installed and authenticated  (gcloud auth login)
#   - Docker installed and running
#   - Set PROJECT_ID and REGION below, or export them as env vars
# =============================================================================

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-YOUR_GCP_PROJECT_ID}"   # e.g. my-project-123
REGION="${GCP_REGION:-us-central1}"                   # e.g. asia-south1
SERVICE_NAME="hireai"
REPO_NAME="hireai"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$SERVICE_NAME"

# ─── Validate ─────────────────────────────────────────────────────────────────
if [[ "$PROJECT_ID" == "YOUR_GCP_PROJECT_ID" ]]; then
  echo "❌ Please set GCP_PROJECT_ID environment variable or edit this script."
  echo "   export GCP_PROJECT_ID=my-project-123"
  exit 1
fi

echo "═══════════════════════════════════════════════"
echo "  HireAI → Google Cloud Run"
echo "  Project : $PROJECT_ID"
echo "  Region  : $REGION"
echo "  Image   : $IMAGE"
echo "═══════════════════════════════════════════════"

# ─── Step 1: Set active GCP project ──────────────────────────────────────────
echo ""
echo "▶ [1/6] Setting GCP project..."
gcloud config set project "$PROJECT_ID"

# ─── Step 2: Enable required APIs ────────────────────────────────────────────
echo ""
echo "▶ [2/6] Enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  --project="$PROJECT_ID"

# ─── Step 3: Create Artifact Registry repo (idempotent) ──────────────────────
echo ""
echo "▶ [3/6] Creating Artifact Registry repository (if not exists)..."
gcloud artifacts repositories describe "$REPO_NAME" \
  --location="$REGION" --project="$PROJECT_ID" > /dev/null 2>&1 || \
gcloud artifacts repositories create "$REPO_NAME" \
  --repository-format=docker \
  --location="$REGION" \
  --project="$PROJECT_ID" \
  --description="HireAI Docker images"

# ─── Step 4: Authenticate Docker to Artifact Registry ────────────────────────
echo ""
echo "▶ [4/6] Authenticating Docker with Artifact Registry..."
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet

# ─── Step 5: Build & push Docker image ───────────────────────────────────────
echo ""
echo "▶ [5/6] Building and pushing Docker image..."
TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")
docker build --platform linux/amd64 -t "$IMAGE:$TAG" -t "$IMAGE:latest" .
docker push "$IMAGE:$TAG"
docker push "$IMAGE:latest"

# ─── Step 6: Deploy to Cloud Run ─────────────────────────────────────────────
echo ""
echo "▶ [6/6] Deploying to Cloud Run..."

# Load env vars from .env.local (if it exists) — DO NOT commit secrets to image
ENV_VARS=""
if [[ -f ".env.local" ]]; then
  echo "   Loading environment variables from .env.local..."
  while IFS='=' read -r key value; do
    # Skip comments and empty lines
    [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
    # Skip VITE_ vars (frontend-only, baked into static build)
    [[ "$key" =~ ^VITE_ ]] && continue
    # Trim whitespace and quotes from value
    value=$(echo "$value" | sed "s/^['\"]//;s/['\"]$//")
    [[ -n "$value" ]] && ENV_VARS="${ENV_VARS}${key}=${value},"
  done < .env.local
  ENV_VARS="${ENV_VARS%,}"  # Remove trailing comma
fi

DEPLOY_CMD=(
  gcloud run deploy "$SERVICE_NAME"
  --image="$IMAGE:$TAG"
  --region="$REGION"
  --platform=managed
  --allow-unauthenticated
  --port=3000
  --memory=1Gi
  --cpu=1
  --min-instances=0
  --max-instances=10
  --timeout=300
  --set-env-vars="NODE_ENV=production"
  --project="$PROJECT_ID"
)

# Append env vars if any were loaded
if [[ -n "$ENV_VARS" ]]; then
  DEPLOY_CMD+=(--set-env-vars="$ENV_VARS")
fi

"${DEPLOY_CMD[@]}"

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "✅ Deployment complete!"
echo ""
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT_ID" \
  --format="value(status.url)")
echo "🌐 Live URL: $SERVICE_URL"
echo ""
echo "💡 Test the API:"
echo "   curl $SERVICE_URL/api/debug"
