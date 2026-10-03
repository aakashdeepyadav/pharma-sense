# Security Review Checklist

Review these controls for every release and whenever deployment topology changes. A checked item means the current repository has the control or a CI check; it does not certify a production environment.

## Application and Configuration

- [x] CORS uses the configured `FRONTEND_URL` origin; do not replace it with a wildcard.
- [x] JSON request bodies are limited to 100 KB.
- [x] `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` headers are set; Express `X-Powered-By` is disabled.
- [x] Login failures and malformed login requests are limited to 10 attempts per client address per 15-minute window.
- [x] Startup rejects a missing, under-32-byte, or shipped placeholder `JWT_SECRET`; use a unique high-entropy value from environment configuration because length alone does not prove randomness.
- [x] JWT verification pins HS256, issuer, and audience; protected requests use the current database role rather than trusting the role claim in a token.
- [x] Logout stores only a SHA-256 token fingerprint in PostgreSQL; protected requests fail closed if revocation/user lookup is unavailable.
- [x] Passwords use bcrypt, login errors are generic, and protected routes enforce authentication and roles server-side.
- [x] Development seeding requires an environment-provided password, rejects production mode, and does not log the secret.
- [x] Health, authentication, anonymous protected-route rejection, and role-denial behavior have API tests.
- [ ] Require MFA for privileged accounts before using operational inventory data.
- [ ] Review CSP and HSTS at the actual frontend/HTTPS termination layer before deployment.
- [ ] Define trusted proxy behavior and shared login throttling before placing multiple API instances behind a reverse proxy.
- [ ] Rotate the signing key through a documented key-rotation procedure; changing it invalidates all existing access tokens.

## Repository and Operations

- [x] Gitleaks secret scanning and high-severity npm audits run in CI; dependency review runs on pull requests.
- [x] Dependabot proposes weekly npm and GitHub Actions updates; review and test each update rather than auto-merging it.
- [ ] Confirm `.env`, database dumps, test results containing sensitive data, and confidential exports are absent from tracked files and pull-request artifacts.
- [ ] Rotate any credential that was ever committed, even after removing it from the current tree.
- [ ] Verify deployment secrets are injected by the target platform and never copied into images, logs, or artifacts.
- [ ] Verify database access is private, least-privileged, encrypted in transit, and covered by tested backups.
- [ ] Record dependency audit findings, security exceptions, and their expiry/owner in the risk register.

## Risk Register

See [SECURITY_RISK_REGISTER.md](SECURITY_RISK_REGISTER.md) for current unresolved risks and mitigations.