$ErrorActionPreference = "Stop"

$PROJECT_ID = "gen-lang-client-0904823075"
$REGION = "us-central1"
$SERVICE_NAME = "hireai"
$REPO_NAME = "hireai"
$IMAGE = "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$SERVICE_NAME"

Write-Host "═══════════════════════════════════════════════"
Write-Host "  HireAI -> Google Cloud Run (PowerShell)"
Write-Host "  Project : $PROJECT_ID"
Write-Host "  Region  : $REGION"
Write-Host "  Image   : $IMAGE"
Write-Host "═══════════════════════════════════════════════"

Write-Host "`n> [1/6] Setting GCP project..."
gcloud config set project $PROJECT_ID

Write-Host "`n> [2/6] Enabling required APIs..."
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com --project=$PROJECT_ID

Write-Host "`n> [3/6] Creating Artifact Registry repository (if not exists)..."
try {
    gcloud artifacts repositories describe $REPO_NAME --location=$REGION --project=$PROJECT_ID 2>$null
} catch {
    gcloud artifacts repositories create $REPO_NAME --repository-format=docker --location=$REGION --project=$PROJECT_ID --description="HireAI Docker images"
}

Write-Host "`n> [4/6] Authenticating Docker with Artifact Registry..."
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet

Write-Host "`n> [5/6] Building and pushing Docker image..."
$TAG = "latest"
try {
    $TAG = (git rev-parse --short HEAD 2>$null)
    if ([string]::IsNullOrWhiteSpace($TAG)) { $TAG = "latest" }
} catch {
    $TAG = "latest"
}
docker build --platform linux/amd64 -t "$($IMAGE):$($TAG)" -t "$($IMAGE):latest" .
docker push "$($IMAGE):$($TAG)"
docker push "$($IMAGE):latest"

Write-Host "`n> [6/6] Deploying to Cloud Run..."

$ENV_VARS_ARRAY = @("NODE_ENV=production")
if (Test-Path ".env.local") {
    Write-Host "   Loading environment variables from .env.local..."
    foreach ($line in Get-Content ".env.local") {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#") -or $line.StartsWith("VITE_")) {
            continue
        }
        $keyVal = $line -split '=', 2
        if ($keyVal.Length -eq 2) {
            $key = $keyVal[0].Trim()
            $val = $keyVal[1].Trim() -replace '^[''"]|[''"]$', ''
            if (![string]::IsNullOrEmpty($val)) {
                $ENV_VARS_ARRAY += "$key=$val"
            }
        }
    }
}
$ENV_VARS_STR = $ENV_VARS_ARRAY -join ","

gcloud run deploy $SERVICE_NAME --image="$($IMAGE):$($TAG)" --region=$REGION --platform=managed --allow-unauthenticated --port=3000 --memory=1Gi --cpu=1 --min-instances=0 --max-instances=10 --timeout=300 --set-env-vars=$ENV_VARS_STR --project=$PROJECT_ID

Write-Host "`n✅ Deployment complete!"
$SERVICE_URL = (gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID --format="value(status.url)")
Write-Host "🌐 Live URL: $SERVICE_URL"
