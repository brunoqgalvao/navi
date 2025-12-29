#!/bin/bash
set -e

cd "$(dirname "$0")/../packages/landing-page"

echo "Deploying landing page..."
gcloud run deploy navi-landing \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --project=sandbox-service-prod \
  --memory=512Mi \
  --timeout=300 \
  --set-secrets="DATABASE_URL=navi-landing-db-url:latest,ADMIN_KEY=navi-landing-admin-key:latest"

echo "Done! https://navi-landing-639638599480.us-central1.run.app"
