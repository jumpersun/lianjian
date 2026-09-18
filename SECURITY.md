# Security and privacy

This is an early MVP. Security fixes target the current `main` branch; no long-term support or response-time SLA is promised.

## Report privately

Use this repository's **Security → Report a vulnerability** (GitHub private vulnerability reporting). Do not post exploit details, API keys, backup files or personal health data in public issues. If the private form is unavailable, open an issue asking the maintainer to enable private reporting without including sensitive details.

## Data boundaries

- Plans, profiles, conversations and training logs are stored in localStorage on this browser and origin.
- API keys for custom models are stored in sessionStorage, readable by same-origin scripts. A static client cannot offer secure long-term key custody.
- Exported backups exclude model keys but contain personal training/profile information; store and share them carefully. Import replaces local business data after confirmation and creates a local pre-import backup.
- Local mode does not contact model services. Configured remote/custom AI transmits profile/restrictions/plan data to the chosen endpoint. Users are responsible for selecting trusted providers and understanding their privacy and billing terms.
- No analytics, authentication service, cloud synchronization or public AI proxy is bundled.

## Deployment guidance

Use HTTPS. Never embed credentials in `VITE_` variables; they are compiled into public JavaScript. Avoid shared API keys in browser clients. A future server-side gateway must implement authentication, authorization, rate limits, secret storage and data minimization before public use.

Do not publicly attach training backups to issues. Do not distribute third-party media without appropriate rights. Only deploy intended build output, not `.env`, `.git`, personal files or licensed media unintentionally copied into `public`.
