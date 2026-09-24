# AGFinTax Growth Suite — web

Next.js (App Router, TypeScript, Tailwind CSS 4) replacement for the Streamlit
frontend in the parent folder. Same two modules, same backends, styled after
agfintax.com (light theme, navy `#03045E`, orange `#FA5F11`, Montserrat/Roboto).

## Run locally

```bash
cp .env.example .env.local   # point at your backends
npm install
npm run dev                  # http://localhost:3000
```

The backends are run by someone else; nothing in them needs to change. Point
`AD_GENERATOR_BACKEND_URL` / `LEAD_SOURCE_BACKEND_URL` at wherever they already
run (the same URLs the Streamlit app uses). The browser never calls them
directly, so they need no CORS setup.

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
  limits). Add options in the JSON, not in code.
- `src/components/sidebar.tsx` — the left menu. Add a module to `MODULES`.
- `src/app/globals.css` — brand palette (`@theme`).

## Deploy

`docker build -t growth-suite-web .` → one container on port 3000. On ECS
Fargate behind the ALB, set the env vars from `.env.example` on the task. The
ALB needs no WebSocket support (Streamlit did), but its idle timeout must be
above 15 s (the keep-alive interval); the default 60 s is fine.
