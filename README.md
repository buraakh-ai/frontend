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

## Run locally

```bash
cp .env.example .env   # point at your backends
npm install
npm run dev            # http://localhost:3000
```

Locally both backends default to port 8000, so run one on another port; the
examples assume the lead-source backend on `8001`. The browser never calls the
backends directly, so they need no CORS setup.

Production build: `npm run build && npm start`. Lint: `npm run lint`.

## How it's put together

- `src/app/ad-generator`, `src/app/lead-source` — the two module pages. Each
  `page.tsx` is a server component that reads env/config and renders the
  client component next to it.
- `src/app/api/ad/[...path]`, `src/app/api/lead/[...path]` — server-side
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
`http://host.docker.internal:8000`, Lead source `http://host.docker.internal:8001`.

## Deploying to AWS

ECS Fargate behind an ALB: build and push the image to ECR, then
`aws ecs update-service ... --force-new-deployment`. Set the env vars from
`.env.example` on the task definition (at least `BACKEND_BASE_URL` and
`LEAD_SOURCE_BACKEND_URL`).

Changes from the Streamlit deployment:
- Container port is **3000** (was 8501); update the target group.
- ALB health check path is **`/`** (was `/_stcore/health`).
- WebSocket support is no longer needed, but the ALB idle timeout must stay
  above 15 s (the keep-alive interval); the default 60 s is fine.

## Adding a module

1. Add `<MODULE>_BACKEND_URL` to `.env.example`.
2. Add a proxy route under `src/app/api/` and a page under `src/app/`.
3. Add it to `MODULES` in `src/components/sidebar.tsx`.
