# Frontend — AGFinTax Growth Suite

Next.js (App Router, TypeScript, Tailwind CSS 4) frontend for the Growth Suite,
styled after agfintax.com (light theme, navy `#03045E`, orange `#FA5F11`,
Montserrat/Roboto). It replaced the earlier Streamlit app. It holds no business
logic and no secrets: each module calls **its own backend** through a
server-side proxy. No backend changes are needed.

Field, score and status definitions for answering client questions:
[docs/glossary.md](docs/glossary.md).

| Module | Page | Backend | Backend URL env |
|---|---|---|---|
| Ad generator | `src/app/ad-generator` | ad-generator-backend | `AD_GENERATOR_BACKEND_URL` → `BACKEND_BASE_URL` |
| Lead source | `src/app/lead-source` | leadscraping-backend | `LEAD_SOURCE_BACKEND_URL` → `BACKEND_URL` → `src/config/lead-source.json` |
| Export leads to Zoho | `src/app/zoho-integration` | zohoexport | `ZOHO_INTEGRATION_BACKEND_URL` |
| Bitrix24 Export | `src/app/bitrix-export` | bitrixexport (which exports to the Lead Hub) | `BITRIX_EXPORT_BACKEND_URL` (+ `BITRIX_EXPORT_API_KEY`) |
| Lead Hub | `src/app/lead-hub` | Lead Hub backend (AWS RDS) (+ zohoexport to sync) | `LEAD_HUB_BACKEND_URL` |

## Run locally

```bash
cp .env.example .env   # point at your backends
npm install
npm run dev            # http://localhost:3000
```

Locally both existing backends default to port 8000, so run one on another
port; the examples assume lead-source on `8001`, zoho-integration on `8002`, bitrix-export on `8003` and the Lead Hub (`leadhubexport`) on `8004`. The browser never calls the
backends directly, so they need no CORS setup.

Production build: `npm run build && npm start`. Lint: `npm run lint`.

## How it's put together

- `src/app/ad-generator`, `src/app/lead-source`, `src/app/zoho-integration`, `src/app/bitrix-export`, `src/app/lead-hub` — the module pages. Each
  `page.tsx` is a server component that reads env/config and renders the
  client component next to it.
- `src/app/api/{ad,lead,zoho,bitrix,hub}/[...path]` — server-side
  proxies to each module's own backend. Only allow-listed endpoints pass
  through. Long calls stream keep-alive whitespace so a load balancer's idle
  timeout doesn't drop them (synchronous Lead source runs can take up to 20
  minutes; the page itself now starts a background job and polls it).
- `src/lib/server/lead-config.ts` + `src/config/lead-source.json` — Lead
  source UI config (industries, states, roles, provider labels, slider
  limits). Add options in the JSON, not in code. `STREAMLIT_CONFIG_S3_URI` /
  `STREAMLIT_CONFIG_FILE` optionally override it (names kept from the
  Streamlit app so deployments carry over).
- `src/components/sidebar.tsx` — the left menu; its entries come from `MODULES` in `src/lib/modules.ts`.
- `src/app/globals.css` — brand palette (`@theme`).

## Docker

```bash
docker compose up --build   # http://localhost:3000
```

Defaults point at the backends' published host ports: Ad generator
`http://host.docker.internal:8000`, Lead source `http://host.docker.internal:8001`,
Zoho integration `http://host.docker.internal:8002`.

## Deploying to AWS

ECS Fargate behind an ALB: build and push the image to ECR, then
`aws ecs update-service ... --force-new-deployment`. Set the env vars from
`.env.example` on the task definition (at least `BACKEND_BASE_URL`,
`LEAD_SOURCE_BACKEND_URL` and `ZOHO_INTEGRATION_BACKEND_URL`).

Changes from the Streamlit deployment:
- Container port is **3000** (was 8501); update the target group.
- ALB health check path is **`/`** (was `/_stcore/health`).
- WebSocket support is no longer needed, but the ALB idle timeout must stay
  above 15 s (the keep-alive interval); the default 60 s is fine.

## Export leads to Zoho: backend contract

The "Export leads to Zoho" page (`src/app/zoho-integration`) talks to the
`zohoexport` backend (`uv run uvicorn zohoexport.api:app --port 8002` in that
project; its own default port is 8000). The proxy allow-lists three endpoints:

| Endpoint | Request | Response |
|---|---|---|
| `GET /records` | `?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` (inclusive) | `[{"email", "first_name", "last_name"}, ...]` from RDS |
| `GET /zoho/lists` | none | `[{"list_id", "list_name"}, ...]` Zoho Campaigns lists |
| `POST /zoho/export` | `{"records": [...], "list_key": "..."}` or `{"records": [...], "list_name": "New list"}` | `{"results": [...], "total", "succeeded", "failed"}`; each result has `lead` (Zoho CRM Lead upserted on Email; no Contacts are created) and `campaigns` stage statuses. At most 200 records per request |

The page sends the fetched leads to `/zoho/export` in batches of 200 and sums the
results. `/records` rejects ranges over 366 days or more than 10,000 rows (422). Errors: a non-2xx status
with FastAPI-style `{"detail": "..."}` is shown to the user.

## Bitrix export: backend contract

The "Bitrix24 Export" page (`src/app/bitrix-export`) reads leads from Bitrix24
through the `bitrixexport` backend (`uv run uvicorn bitrixexport.api:app --port 8003`
in `bitrixexport`) and exports the ones a person approves to the Lead Hub through
the same backend, which posts them to the Lead Hub's `/bitrixLeads`. The
`/api/bitrix` proxy allow-lists two endpoints and sends `BITRIX_EXPORT_API_KEY`
as `X-API-Key` when set:

| Endpoint | Request | Response |
|---|---|---|
| `GET /getBitrixLeads` | `?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&contact_details=true` (dates inclusive) | `{"count", "categories": {"AI call": 71, ...}, "items": [{"id", "createdTime", "category", "category_type", "contact": {"email", "first_name", "last_name", "phone"}, ...}]}` |
| `POST /exportToLeadHub` | `{"leads": [lead, ...]}`, leads exactly as `/getBitrixLeads` returned them | `{"sent", "items": [{"lead_id", "bitrix_lead_id"}]}`; 503 if the backend's `LEAD_HUB_API_URL` is unset, 502 if the Lead Hub rejects them |

Every lead has a `category` (web form name, "Inbound call", "Outbound call",
"AI call", source name, ...), which the page offers as a filter.
`contact_details=true` makes the backend find each lead's email and name wherever
its form stored them (standard lead fields, custom fields labelled "Email",
"First Name", ..., or the linked CRM contact). Leads without an email or phone
are shown but start unchecked. Nothing is sent to the Lead Hub until someone
clicks "Export to Lead Hub" (selected) or "Export all" (the shown category) and
confirms; exporting a lead again updates it in the Lead Hub.

## Lead Hub: backend contract

The Lead Hub (AWS RDS) is served by the `leadhubexport` backend
(`uv run uvicorn leadhubexport.app:app --port 8004` in that project). Every lead
source lands its leads there, but only the leads a person approves, and always
through the source's own backend (which is configured with `LEAD_HUB_API_URL`):

- Lead Finder: a run starts with `POST /v2/sourcing-jobs` (same body as
  `/v2/run-sourcing-campaign`, → `{job_id}`), and the page polls
  `GET /v2/sourcing-jobs/{job_id}` every 2 s for the stage, live counts, leads
  so far and usage (tokens, search calls, estimated cost) until `result` arrives.
  A run in progress keeps being watched while the person is on other pages.
  The pre-run time/cost estimate (`src/app/lead-source/estimate.ts`) mirrors the
  backend's list prices by hand and is calibrated by this browser's past runs.
- Lead Finder: runs are not saved automatically (`persist_to_database: false`);
  "Export to Lead Hub" sends the selected leads to the Lead source backend's
  `POST /export-to-lead-hub` (`{campaign, run_summary, leads}` from the run's
  response → `{sent, message}`), which posts them to the Lead Hub's `/webScrapingLeads`.
- Bitrix24 Export: its backend's `POST /exportToLeadHub` (above) posts them to
  the Lead Hub's `/bitrixLeads`.

The Lead Hub page (`src/app/lead-hub`) only reads from it. The `/api/hub` proxy
allow-lists one endpoint, and answers "not connected" until `LEAD_HUB_BACKEND_URL`
is set:

| Endpoint | Request | Response |
|---|---|---|
| `GET /leads` | `?from=YYYY-MM-DD&to=YYYY-MM-DD` (both required, inclusive, by when the lead landed, UTC) | `[{"source_code", "lead_id", "email", "first_name", "last_name", "phone", "company", "job_title", "city", "country", "zoho_sync_status", "zoho_contact_id", "ingested_at"}, ...]`, newest first |

`source_code` is `WEB_SCRAPING` (Lead Finder), `BITRIX24` or `ZOOM_WEBINAR`; the
page filters by it. `zoho_sync_status` is e.g. `pending` or `synced`; leads already
`synced` start unchecked.

The page syncs the selected leads (or all shown with an email and last name) to
Zoho through the Zoho module's `POST /zoho/export` and `GET /zoho/lists` (above),
so the Zoho backend must be running too. The Lead Hub has no endpoint to record
a sync yet, so `zoho_sync_status` doesn't change after a sync; the page marks
leads synced in this tab.

## Adding a module

1. Add `<MODULE>_BACKEND_URL` to `.env.example`.
2. Add a proxy route under `src/app/api/` and a page under `src/app/`.
3. Add it to `MODULES` in `src/lib/modules.ts` (sidebar and Growth Hub cards).
