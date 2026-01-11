---
name: web-deploy-quickstart
description: Rapidly scaffold and deploy web applications with minimal configuration overhead, targeting developers who want to go from concept to live app quickly
version: 1.0.0
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Web Deploy Quickstart - Zero-Config Deployment Pipeline

Rapidly scaffold and deploy web applications with minimal configuration overhead. This skill creates a complete deployment pipeline from concept to live app in minutes, not hours.

## What This Skill Does

Creates a zero-friction deployment experience that handles:
- **Automated hosting setup** (Vercel, Netlify, or Cloud Run)
- **Domain configuration** with SSL certificates
- **CI/CD pipeline** with GitHub Actions
- **Environment management** (dev, staging, prod)
- **Database provisioning** (if needed)
- **Monitoring and analytics** setup

## When to Use

- You have a working app locally and want it live immediately
- Starting a new project that needs to be deployed quickly
- Setting up a demo or prototype that others need to access
- Creating a production-ready deployment from scratch
- Migrating from local development to cloud hosting

## Required Tools

- `git` - Version control and repository management
- `gh` - GitHub CLI for repository and deployment setup
- `vercel` or `gcloud` - Deployment platform CLI
- `node` and `npm/yarn` - For web application builds

## Instructions

### Step 1: Analyze Current Project

First, examine the project structure to understand what we're deploying:

```bash
# Check project type and dependencies
ls -la
cat package.json 2>/dev/null || echo "No package.json found"
cat requirements.txt 2>/dev/null || echo "No Python requirements found"
```

Identify:
- Framework (Next.js, React, Vue, Python Flask/Django, etc.)
- Database requirements
- Environment variables needed
- Build process

### Step 2: Repository Setup

If not already in git:

```bash
# Initialize repository
git init
git add .
git commit -m "Initial commit"

# Create GitHub repository
gh repo create --public --push --source .
```

### Step 3: Choose Deployment Platform

**For Next.js/React apps (recommended: Vercel):**
```bash
# Install and login to Vercel
npm install -g vercel
vercel login

# Deploy with automatic setup
vercel --prod
```

**For Python/Node.js apps (Cloud Run):**
```bash
# Create Dockerfile if missing
echo "FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD [\"npm\", \"start\"]" > Dockerfile

# Deploy to Cloud Run
gcloud run deploy --source . --region us-central1 --allow-unauthenticated
```

**For static sites (Netlify):**
```bash
# Install Netlify CLI
npm install -g netlify-cli
netlify login

# Deploy site
netlify deploy --prod --dir ./build
```

### Step 4: Environment Configuration

Create environment management:

```bash
# Create .env.example template
cat > .env.example << 'EOF'
# Database
DATABASE_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=

# Authentication
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# API Keys
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
EOF

# Set production environment variables
vercel env add DATABASE_URL
vercel env add NEXTAUTH_SECRET
# ... repeat for each variable
```

### Step 5: CI/CD Pipeline

Create GitHub Actions workflow:

```bash
mkdir -p .github/workflows
cat > .github/workflows/deploy.yml << 'EOF'
name: Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test --if-present
      
      - name: Build
        run: npm run build
      
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'
EOF
```

### Step 6: Domain Setup

**Custom domain configuration:**

```bash
# Add custom domain (Vercel)
vercel domains add yourdomain.com

# Verify DNS settings
dig yourdomain.com
```

**DNS Configuration:**
- Add CNAME record pointing to deployment platform
- Configure SSL certificates (usually automatic)
- Set up www redirect if needed

### Step 7: Database and Services

**Supabase setup:**
```bash
# Create new Supabase project
npx supabase init
npx supabase start
npx supabase db push

# Get connection details
npx supabase status
```

**Environment sync:**
```bash
# Push local env to production
vercel env pull .env.production
vercel env push .env.production
```

### Step 8: Monitoring and Analytics

Add essential monitoring:

```bash
# Add error tracking (Sentry)
npm install @sentry/nextjs
npx @sentry/wizard -i nextjs

# Add analytics (if not already included)
npm install @vercel/analytics
```

## Example Complete Deployment

```bash
# 1. Quick project setup
npx create-next-app@latest my-app --typescript --tailwind --app
cd my-app

# 2. Add authentication and database
npm install @supabase/supabase-js next-auth

# 3. Git setup
git init && git add . && git commit -m "Initial commit"
gh repo create --public --push --source .

# 4. One-command deploy
vercel --prod

# 5. Environment variables
vercel env add DATABASE_URL
vercel env add NEXTAUTH_SECRET

# 6. Domain setup (if custom domain)
vercel domains add mydomain.com
```

## Troubleshooting

**Build fails:**
- Check Node.js version compatibility
- Verify all dependencies are in package.json
- Ensure environment variables are set

**Domain not resolving:**
- Verify DNS propagation (24-48 hours)
- Check CNAME record configuration
- Ensure SSL certificate is provisioned

**Database connection issues:**
- Verify connection string format
- Check firewall/IP whitelist settings
- Confirm environment variables are set correctly

## Post-Deployment Checklist

- [ ] App loads at production URL
- [ ] All environment variables configured
- [ ] Database connections working
- [ ] SSL certificate active
- [ ] Custom domain resolving (if applicable)
- [ ] CI/CD pipeline triggered on push
- [ ] Error monitoring active
- [ ] Analytics tracking implemented
- [ ] Performance monitoring enabled

## Platform-Specific Notes

**Vercel:**
- Automatic SSL and CDN
- Serverless functions support
- Built-in analytics
- Easy custom domains

**Cloud Run:**
- Containerized deployments
- Auto-scaling
- Pay-per-request pricing
- Custom runtime support

**Netlify:**
- Great for static sites
- Built-in form handling
- Edge functions
- Split testing features

This skill transforms the deployment process from a multi-hour setup into a 5-minute operation, removing friction from the development-to-production workflow.