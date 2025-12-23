#!/bin/bash
set -e

cd "$(dirname "$0")/../landing-page"

echo "Deploying landing page..."
gcloud run deploy navi-landing \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --project=sandbox-service-prod

echo "Done! https://navi-landing-639638599480.us-central1.run.app"
