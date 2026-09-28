@AGENTS.md

# CLAUDE.md

The frontend for the Buraq Growth Suite: a Next.js 16 + Tailwind 4 app (light agfintax.com theme) with four modules. It replaced the former Streamlit app and has no backend code of its own.

- **Modules:** `src/app/ad-generator` (Ad generator), `src/app/lead-source` (Lead source) and `src/app/zoho-integration` ("Export leads to Zoho": leads from RDS by date range → Zoho CRM + a Campaigns list, via the `zohoexport` backend) and `src/app/bitrix-export` ("Bitrix export": leads from a Bitrix24 CRM form by date range, via the `bitrixexport` backend → exported through the Zoho module's `/zoho/export`). Each talks to its own backend; never point one module at another's backend (Bitrix export's reuse of the Zoho export endpoint is the one deliberate exception).
- **Proxies:** the browser only calls `/api/ad/*`, `/api/lead/*`, `/api/zoho/*` and `/api/bitrix/*`; `src/app/api/{ad,lead,zoho,bitrix}/[...path]` forward allow-listed endpoints to the matching backend (`src/lib/server/`). New backend endpoints must be added to the allow-list.
- **Backend URLs:** Ad generator uses `AD_GENERATOR_BACKEND_URL` → `BACKEND_BASE_URL`. Lead source uses `LEAD_SOURCE_BACKEND_URL` → legacy `BACKEND_URL` → `backend.default_url` in `src/config/lead-source.json`, and must NOT fall back to `BACKEND_BASE_URL` (that is the Ad generator's backend). Zoho integration uses `ZOHO_INTEGRATION_BACKEND_URL` only; Bitrix export uses `BITRIX_EXPORT_BACKEND_URL` only, plus `BITRIX_EXPORT_API_KEY` (sent server-side as `X-API-Key`). Both API contracts are in the README.
- **Lead source UI config** is data, not code: `src/config/lead-source.json` (optionally overridden from S3 / a file via `STREAMLIT_CONFIG_S3_URI` / `STREAMLIT_CONFIG_FILE`; names kept for deployment compatibility). Add industries, states, roles, provider labels there. City suggestions per state are `geography.state_areas` (cities only, no counties). Every provider in `provider_labels` is used on every run and results are always saved (`persist_to_database`); neither is shown in the UI. The page uses only the backend's V2 pipeline.
- **No shared code with either backend.** Never import from a backend project. Values mirrored from a backend (e.g. ad countries) are kept in sync by hand. No backend changes are needed for frontend work.
- **Theme:** brand palette lives in `src/app/globals.css` (`@theme`).
- **Env:** `.env.example` → `.env` / `.env.local`. Frontend-only keys; the only secret is `BITRIX_EXPORT_API_KEY`, which never reaches the browser.
- **Deployment:** Docker (standalone build, port 3000) on ECS Fargate + ALB. See README.
- Checks: `npm run lint` and `npm run build` (there are no tests).
