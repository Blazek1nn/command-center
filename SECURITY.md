# Security Policy

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email: `security@<your-domain>` *(set this once a domain is registered — until then, use the maintainer's email in `NOTICE`)*

Please include:

1. A description of the issue and its potential impact
2. Steps to reproduce, or a proof-of-concept
3. Affected versions (commit hash, tag, or branch)
4. Any suggested fix

We aim to acknowledge reports within **72 hours** and provide an initial assessment within **7 days**.

## Disclosure Process

1. We confirm and triage the issue privately.
2. We develop and test a fix on a private branch.
3. We coordinate a release date with the reporter.
4. We publish the fix and a security advisory.
5. We credit the reporter (unless they prefer to remain anonymous).

## Scope

In scope:

- Backend (`command-center-backend`): authentication bypass, SSRF, path traversal, secret exposure, RCE via dispatcher inputs
- Frontend (`command-center-frontend`): XSS, CSRF, prototype pollution, secret leakage in client bundles
- Database: SQL injection, unauthorized data access
- Integrations: token leakage, OAuth flow flaws

Out of scope:

- Issues requiring physical access to the user's machine
- Social engineering
- Denial of service requiring high traffic volumes (the product is designed for single-user / small-team local use)
- Vulnerabilities in upstream dependencies (report those upstream; we will update once patched)
- The `--dangerously-skip-permissions` flag passed to the Claude CLI — this is intentional and documented; disabling it breaks headless operation

## Security Posture (current state)

Honest disclosure of known limitations:

- **Single-user trust model:** The backend assumes the operator is the only user. There is no per-user auth.
- **Local-only by default:** The backend binds to `0.0.0.0` for convenience. **Do not expose it to the public internet without a reverse proxy + auth.**
- **Token storage:** Integration tokens (GitHub, Linear) are encrypted at rest with Fernet. The encryption key is stored in `~/.command-center/secret.key` with `chmod 600`. If an attacker gains read access to the user's home directory, tokens are recoverable.
- **Subprocess execution:** The dispatcher spawns `claude` CLI subprocesses with `--dangerously-skip-permissions`. The CLI executes filesystem and shell operations on behalf of the user inside the project directory. **Never run Command Center against an untrusted project directory.**

These trade-offs are appropriate for the current target (local, single-user, developer cockpit). They will need to change before any multi-tenant deployment.
