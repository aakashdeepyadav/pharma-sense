# Security Review Checklist

Review these controls for every release and whenever deployment topology changes. A checked item means the current repository has the control or a CI check; it does not certify a production environment.

## Application and Configuration

- [x] CORS uses the configured `FRONTEND_URL` origin; do not replace it with a wildcard.
- [x] JSON request bodies are limited to 100 KB.
- [x] `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` headers are set; Express `X-Powered-By` is disabled.
- [x] Login failures and malformed login requests are limited to 10 attempts per client address per 15-minute window.
- [x] Missing `JWT_SECRET` prevents token signing/verification; use a unique high-entropy value from environment configuration.
- [x] Passwords use bcrypt, login errors are generic, and protected routes enforce authentication and roles server-side.
- [x] Health, authentication, anonymous protected-route rejection, and role-denial behavior have API tests.
- [ ] Enforce a minimum production JWT secret strength at startup; currently only absence is rejected by token operations.
- [ ] Review CSP and HSTS at the actual frontend/HTTPS termination layer before deployment.
- [ ] Define trusted proxy behavior before placing the API behind a reverse proxy; the current limiter uses the request address and has no shared state.
- [ ] Replace process-local login throttling and token revocation with shared persistent controls before horizontal scaling.

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