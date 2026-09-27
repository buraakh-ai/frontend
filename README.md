# Frontend — AGFinTax Growth Suite

Next.js (App Router, TypeScript, Tailwind CSS 4) frontend for the Growth Suite,
styled after agfintax.com (light theme, navy `#03045E`, orange `#FA5F11`,
Montserrat/Roboto). It replaced the earlier Streamlit app. It holds no business
logic and no secrets: each module calls **its own backend** through a
server-side proxy. No backend changes are needed.

| Module | Page | Backend | Backend URL env |
|---|---|---|---|
| Ad generator | `src/app/ad-generator` | ad-generator-backend | `AD_GENERATOR_BACKEND_URL` → `BACKEND_BASE_URL` |
| Lead source | `src/app/lead-source` | leadscraping-backend | `LEAD_SOURCE_BACKEND_URL` → `BACKEND_URL` → `src/config/lead-source.json` |
| Export leads to Zoho | `src/app/zoho-integration` | zohoexport | `ZOHO_INTEGRATION_BACKEND_URL` |

## Run locally

```bash
cp .env.example .env   # point at your backends
npm install
npm run dev            # http://localhost:3000
```

Locally both existing backends default to port 8000, so run one on another
port; the examples assume lead-source on `8001` and zoho-integration on `8002`. The browser never calls the
backends directly, so they need no CORS setup.

Production build: `npm run build && npm start`. Lint: `npm run lint`.

## How it's put together

- `src/app/ad-generator`, `src/app/lead-source`, `src/app/zoho-integration` — the module pages. Each
  `page.tsx` is a server component that reads env/config and renders the
  client component next to it.
- `src/app/api/{ad,lead,zoho}/[...path]` — server-side
  proxies to each module's own backend. Only allow-listed endpoints pass
  through. Long calls stream keep-alive whitespace so a load balancer's idle
  timeout doesn't drop them (Lead source runs can take up to 20 minutes).
- `src/lib/server/lead-config.ts` + `src/config/lead-source.json` — Lead
  source UI config (industries, states, roles, provider labels, slider
  limits). Add options in the JSON, not in code. `STREAMLIT_CONFIG_S3_URI` /
  `STREAMLIT_CONFIG_FILE` optionally override it (names kept from the
  Streamlit app so deployments carry over).
- `src/components/sidebar.tsx` — the left menu. Add a module to `MODULES`.
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

## Adding a module

1. Add `<MODULE>_BACKEND_URL` to `.env.example`.
2. Add a proxy route under `src/app/api/` and a page under `src/app/`.
3. Add it to `MODULES` in `src/components/sidebar.tsx`.
