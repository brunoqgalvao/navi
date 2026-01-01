---
name: release-deploy
description: Use when the user asks about releasing, deploying, or the CI/CD pipeline for Navi
---

# Release & Deploy

## Automatic Release (GitHub Actions)

Push to `main` or manually trigger the workflow:

```bash
gh workflow run release.yml
```

### What it does:
1. **check-version** - Determines version bump from commit message (BREAKING→major, fix→patch, else minor)
2. **bump-version** - Updates all package.json files + tauri.conf.json, commits, tags, pushes
3. **build-tauri** - Builds macOS ARM64 app with signed updater artifacts
4. **create-release** - Creates GitHub Release with .dmg, .tar.gz, signatures
5. **deploy** - Deploys landing page to Cloud Run, publishes update manifest

### Required GitHub Secrets:
| Secret | Value |
|--------|-------|
| `GCP_PROJECT_ID` | `sandbox-service-prod` |
| `GCP_SA_KEY` | Service account JSON (see below) |
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri updater signing key |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Key password |
| `NAVI_ADMIN_KEY` | Admin key for update API |

### Regenerate GCP Service Account Key:
```bash
gcloud iam service-accounts keys create key.json \
  --iam-account=navi-github-deploy@sandbox-service-prod.iam.gserviceaccount.com
gh secret set GCP_SA_KEY < key.json
rm key.json
```

## Manual Release (Local)

```bash
./scripts/release.sh 1.2.0
```

Runs: bump-version → build-app → generate-update-manifest → deploy-landing → publish-release

## Deploy Landing Page Only

```bash
./scripts/deploy-landing.sh
```

Deploys to: https://navi-landing-639638599480.us-central1.run.app

## Monitor Workflow

```bash
gh run list --workflow=release.yml --limit=5
gh run view <run-id> --log-failed
```

## Update Manifest

The Tauri auto-updater checks: `https://navi-landing-639638599480.us-central1.run.app/api/updates/latest.json`
