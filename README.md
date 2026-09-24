# Frontend — Buraq Growth Suite

One Streamlit app with a left-hand module menu, replacing the two standalone frontends (`ad-generator-frontend` and `leadscraping-frontend`). It holds no business logic and no secrets: each module calls **its own backend** over HTTP.

| Module | Page | Backend | Backend URL env |
|---|---|---|---|
| Ad generator | `app_pages/ad_generator.py` | ad-generator-backend | `AD_GENERATOR_BACKEND_URL` → `BACKEND_BASE_URL` |
| Lead source | `app_pages/lead_source.py` | leadscraping-backend | `LEAD_SOURCE_BACKEND_URL` → `BACKEND_URL` → `lead_source/streamlit_config.json` |

## Layout

```
streamlit_app.py            shell: set_page_config, theme, sidebar brand header, st.navigation module list
app_pages/                  one file per module
lead_source/                Lead source's UI config: config_loader.py + streamlit_config.json (states, industries, roles, slider limits)
utils/api.py                resolve_backend_url(), make_api(), env_flag()   (Ad generator)
utils/theme.py              custom CSS on top of the native theme (keep in sync with .streamlit/config.toml)
.streamlit/config.toml      native Streamlit theme (must sit in the directory streamlit is run from)
tests/                      lead_source config-loader tests
```

## Configuration (`.env.example` → `.env`)

See `.env.example`. Key point: **the two backends are different services**, and locally both default to port 8000, so run one on another port. The examples assume the lead-source backend on `8001`. The Lead source module deliberately never falls back to `BACKEND_BASE_URL` (that is the Ad generator's backend).

`STREAMLIT_CONFIG_S3_URI` / `STREAMLIT_CONFIG_FILE` (optional) override the Lead source UI config, same as in the old standalone frontend.

## Local setup

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/python -m streamlit run streamlit_app.py     # http://localhost:8501
.venv/bin/python -m unittest discover -s tests -v       # Lead source config tests
```

Windows + Smart App Control: use `.\run.ps1 -m streamlit run streamlit_app.py`.

## Docker

```bash
docker compose up --build
```

Serves `:8501`. Defaults point at the backends' published host ports: Ad generator `http://host.docker.internal:8000`, Lead source `http://host.docker.internal:8001`.

## Deploying to AWS

ECS Fargate behind an ALB (Streamlit needs a WebSocket, which App Runner doesn't support), same as the old Ad generator frontend: build and push the image to ECR, then `aws ecs update-service ... --force-new-deployment`. Set `BACKEND_BASE_URL` and `LEAD_SOURCE_BACKEND_URL` in the task definition. ALB health check `/_stcore/health`, port 8501.

## Adding a module

1. Add `<MODULE>_BACKEND_URL` to `.env.example`.
2. Add `app_pages/<module>.py` (no `st.set_page_config` — the shell owns it).
3. Register it with an `st.Page(...)` entry in `streamlit_app.py`.

## Known issues (carried over, unchanged)

- Ad generator: the backend returns errors as JSON with HTTP 500, but `utils/api.make_api` calls `raise_for_status()` first, so the UI shows only "500 Server Error".
- `use_container_width=True` is used in both modules; Streamlit 1.64 still accepts it but logs that it "will be removed after 2025-12-31". Replace with `width="stretch"` (or pin Streamlit) before upgrading further.
