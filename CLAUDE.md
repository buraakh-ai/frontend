# CLAUDE.md

The single Streamlit frontend for the Buraq Growth Suite: a merge of the former `ad-generator-frontend` and `leadscraping-frontend`. It has no backend code of its own.

- **Migration in progress:** `web/` is a Next.js 16 + Tailwind 4 rebuild of this frontend (light agfintax.com theme) that will replace Streamlit. It has its own README; server-side proxies in `web/src/app/api/{ad,lead}` keep each module on its own backend, and `web/src/config/lead-source.json` is a copy of `lead_source/streamlit_config.json` — edit both until Streamlit is removed. Feature changes go in both apps until then.
- **Entrypoint:** `streamlit_app.py` (flat layout; run from this folder so `.streamlit/`, `utils/`, `app_pages/`, `lead_source/` resolve). It owns `st.set_page_config`, the theme, and the `st.navigation` list — pages must not call `set_page_config`.
- **Modules:** `app_pages/ad_generator.py` (Ad generator) and `app_pages/lead_source.py` (Lead source). Each talks to its own backend; never point one module at the other's backend.
- **Backend URLs:** Ad generator uses `utils/api.resolve_backend_url("AD_GENERATOR_BACKEND_URL")` (falls back to `BACKEND_BASE_URL`). Lead source resolves `LEAD_SOURCE_BACKEND_URL` → legacy `BACKEND_URL` → `lead_source/streamlit_config.json`, and must NOT use `resolve_backend_url` (its `BACKEND_BASE_URL` fallback is the Ad generator's backend).
- **Lead source UI config** is data, not code: `lead_source/streamlit_config.json` (validated by `lead_source/config_loader.py`, optionally overridden from S3 / a file). Add industries, states, roles, provider labels there.
- **Session state:** the two modules use disjoint keys (Ad generator: `campaign`, `image`, `*_ad_draft`, …; Lead source: `campaign_id`, `leads`, `lead_sources`, `run_summary`, `loaded_campaign`). Keep them disjoint.
- **No shared code with either backend.** Never import from a backend project. Values mirrored from a backend (e.g. `AD_COUNTRIES`) are kept in sync by hand.
- **Theme:** `.streamlit/config.toml` and `utils/theme.py` carry the same palette — change both together.
- **Deployment:** ECS Fargate + ALB (WebSocket). No deploy script; see README.
- Tests: `python -m unittest discover -s tests -v` (Lead source config loader only; there are no UI tests).
