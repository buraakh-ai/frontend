@AGENTS.md

# CLAUDE.md

The frontend for the Buraq Growth Suite: a Next.js 16 + Tailwind 4 app (light agfintax.com theme) with two modules. It replaced the former Streamlit app and has no backend code of its own.

- **Modules:** `src/app/ad-generator` (Ad generator) and `src/app/lead-source` (Lead source). Each talks to its own backend; never point one module at the other's backend.
- **Proxies:** the browser only calls `/api/ad/*` and `/api/lead/*`; `src/app/api/{ad,lead}/[...path]` forward allow-listed endpoints to the matching backend (`src/lib/server/`). New backend endpoints must be added to the allow-list.
- **Backend URLs:** Ad generator uses `AD_GENERATOR_BACKEND_URL` → `BACKEND_BASE_URL`. Lead source uses `LEAD_SOURCE_BACKEND_URL` → legacy `BACKEND_URL` → `backend.default_url` in `src/config/lead-source.json`, and must NOT fall back to `BACKEND_BASE_URL` (that is the Ad generator's backend).
- **Lead source UI config** is data, not code: `src/config/lead-source.json` (optionally overridden from S3 / a file via `STREAMLIT_CONFIG_S3_URI` / `STREAMLIT_CONFIG_FILE`; names kept for deployment compatibility). Add industries, states, roles, provider labels there.
- **No shared code with either backend.** Never import from a backend project. Values mirrored from a backend (e.g. ad countries) are kept in sync by hand. No backend changes are needed for frontend work.
- **Theme:** brand palette lives in `src/app/globals.css` (`@theme`).
- **Env:** `.env.example` → `.env` / `.env.local`. Frontend-only keys; no secrets.
- **Deployment:** Docker (standalone build, port 3000) on ECS Fargate + ALB. See README.
- Checks: `npm run lint` and `npm run build` (there are no tests).
