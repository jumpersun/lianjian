# Lianjian · 练见

A local-first workout planner and training log with bring-your-own-model support. [中文](README.md)

**Early MVP, not a certified training or medical product.** The UI is currently Chinese-first. It supports rotating workout plans, exercise lookup, per-set logging, rest timers, pause/resume, skip and discomfort feedback, immutable workout history, opt-in plan adjustments, and JSON backup/restore.

No account or API key is required for local rule-based planning. Optionally connect an OpenAI Chat Completions-compatible endpoint in Settings. Rule-based mode is not an LLM. The model uses a constrained exercise whitelist, not unrestricted exercise generation.

![Text-only workout dashboard with demo data](docs/screenshots/coach.png)

## Run

Requires Node.js 24 and npm. The text dataset is bundled; no parent repository, backend or database is required.

```bash
git clone https://github.com/jumpersun/lianjian.git
cd lianjian
npm ci
npm run dev
```

`npm test` runs the tests. `npm run build` creates `dist/client`; `npm run preview` serves that output. Static subpath deployment: `npm run build -- --base=/lianjian/`.

## Licensing and data

The application is MIT-licensed. Exercise text/metadata is derived from [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset), with original notices preserved. The bundle has 1,324 text entries; only 25 tagged exercises are automatically recommended. Tags are product annotations, not professional review.

**Third-party exercise images and GIFs are not included or fetched.** The default experience is text-only. Upstream media is not MIT-licensed; obtain the applicable rights before supplying or deploying it. See [third-party notices](THIRD_PARTY_NOTICES.md) and [dataset provenance](docs/DATA.md). Optional licensed files go in ignored `public/images/` and `public/videos/`; enable `VITE_ENABLE_EXERCISE_MEDIA=true` in `.env.local`. Static builds include any files you supply under `public`, so review deployment artifacts as well as Git history.

## Privacy and limitations

Plans and training logs live in this browser's localStorage, not an account. Export backups before clearing site data or changing origins. Backups contain personal information but omit model credentials.

Custom API keys are kept in sessionStorage, accessible to same-origin scripts; this is not a secure credential vault. Custom model requests send profile information, restrictions and plans to your selected provider, potentially incurring costs. Use a trusted HTTPS endpoint with browser CORS support. Never put secrets in public `VITE_` variables.

No hosted AI gateway, cloud sync, real accounts, medical assessment or guaranteed training outcome is provided. Professional content review, real-model compatibility, cross-browser restore and assistive-technology testing remain ongoing work.

See [contributing](CONTRIBUTING.md), [roadmap](ROADMAP.md) and [security](SECURITY.md). Please do not attach private health data, credentials or restricted media to public issues.
