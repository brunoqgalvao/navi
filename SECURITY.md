# Security Policy

## Supported Versions

Currently, only the latest version of Navi receives security updates.

| Version | Supported |
|---------|------------|
| Latest  | ✅         |

## Reporting a Vulnerability

The Navi team takes security vulnerabilities seriously. We appreciate your efforts to responsibly disclose your findings.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please send an email to: **brunoqgalvao@hotmail.com**

You should receive a response within 48 hours. If you don't, please follow up via the same email address.

### What to Include

Please include as much of the following information in your report as possible:

- **Description** of the vulnerability
- **Steps to reproduce** the issue
- **Affected versions** of Navi
- **Impact** of the vulnerability
- **Proof of concept** (if applicable)
- **Suggested fix** (if you have one)

### What to Expect

1. **Confirmation:** We'll confirm receipt of your report within 48 hours
2. **Evaluation:** We'll investigate the issue and determine severity
3. **Resolution:** We'll work on a fix and coordinate disclosure with you
4. **Disclosure:** We'll announce the fix when it's available

### Security Best Practices

When developing with or using Navi:

- **Never commit API keys** or secrets to version control
- **Use `.env.example`** files as templates (don't include real values)
- **Keep dependencies updated** - run `bun update` regularly
- **Review permissions** - only grant necessary permissions
- **Use official releases** - download from verified sources

### Dependency Security

Navi uses npm packages managed via Bun. We:

- **Monitor** for security advisories
- **Update** dependencies when vulnerabilities are disclosed
- **Audit** dependencies regularly with `bun audit`

### Third-Party Services

Navi integrates with various services. Each service manages its own security:

- **Anthropic Claude** - Enterprise-grade AI with SOC 2 compliance
- **Cloudflare** - DDoS protection and edge security
- **Tauri** - Rust-based security for desktop apps

### Data Privacy

Navi stores:

- **Chat sessions** - Locally in SQLite database (`~/.claude-code-ui/data.db`)
- **API keys** - In memory only (never logged or transmitted except to the intended service)
- **Project settings** - Locally in `.claude/` directories
- **Credentials** - Encrypted at rest for OAuth integrations

**No data is sent to external servers** except:
- API requests to Anthropic for Claude (required for functionality)
- Optional cloud services you explicitly configure

### Desktop App Security

The Tauri desktop app:

- **Code signing** - macOS binaries are signed and notarized
- **Sandboxing** - Limited system access via Tauri permissions
- **Updates** - Delivered via Tauri's secure updater

## Security Features

### Credential Storage

- API keys are **never logged** to console or files
- OAuth tokens stored in **encrypted database**
- Environment variables are the preferred method for secrets

### Code Execution

- Terminal/PTY runs in **isolated processes**
- File operations respect **system permissions**
- Browser automation (Playwright) runs in **sandboxed context**

### Network Security

- WebSocket connections use **WSS** when available
- API requests over **HTTPS only**
- No plaintext credentials in network traffic

## Security Audits

Formal security audits:

| Date | Auditor | Scope | Report |
|------|---------|-------|--------|
| TBD  | TBD     | TBD   | TBD    |

## Responsible Disclosure Policy

We follow **Coordinated Vulnerability Disclosure**:

1. Report is received and acknowledged
2. We investigate and develop a fix
3. Fix is tested and validated
4. Security advisory is published
5. Users are notified to update

### Disclosure Timeline

- **Critical** (CVSS 9.0+): Disclosure within 7 days of fix
- **High** (CVSS 7.0-8.9): Disclosure within 14 days of fix
- **Medium** (CVSS 4.0-6.9): Disclosure within 30 days of fix
- **Low** (CVSS 0.1-3.9): Disclosure in next release

## Threat Model

### Primary Threats We Address

1. **Credential leakage** - Keys never exposed in logs or errors
2. **Code injection** - Input validation and sandboxing
3. **Data exposure** - Local-only storage by default
4. **Supply chain** - Dependency audits and verified releases

### Out of Scope

- Physical access to your device
- Compromised OS or system libraries
- User willingly running malicious code in terminal
- Compromised Anthropic API account

## Contact

For security questions not related to vulnerability reports:

- **GitHub:** Use [Security Discussions](../../discussions/categories/security)
- **Email:** brunoqgalvao@hotmail.com

---

Thank you for helping keep Navi secure! 🔒
