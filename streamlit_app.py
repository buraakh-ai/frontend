"""CRM-style shell for a suite of AI growth modules, each its own page under
app_pages/ talking to its own backend container (this project's stated
direction: one AWS ECS service per backend). Today's modules:
Ad generator (app_pages/ad_generator.py -> the ad-generator-backend) and
Lead source (app_pages/lead_source.py -> the lead-source backend).

Colors/fonts come from .streamlit/config.toml (native theming) — see that
file's header comment for why it lives at the repo root."""
from dotenv import load_dotenv
import streamlit as st

from utils.theme import inject_global_css

load_dotenv()

st.set_page_config(page_title="AGFinTax Growth Suite", page_icon=":material/rocket_launch:", layout="wide")
inject_global_css()

pages = [
    st.Page("app_pages/ad_generator.py", title="Ad generator", icon=":material/campaign:", default=True),
    st.Page("app_pages/lead_source.py", title="Lead source", icon=":material/person_search:"),
]

with st.sidebar:
    st.markdown(
        """
        <div class="brand-shell">
            <div class="brand-copy">
                <div class="brand-title">AGFinTax Growth Suite</div>
                <div class="brand-subtitle">AI marketing &amp; growth</div>
            </div>
        </div>
        <div class="brand-divider"></div>
        <div class="sidebar-section-label">Modules</div>
        """,
        unsafe_allow_html=True,
    )

    # Streamlit always renders its own nav above sidebar content, so hide it and
    # draw the links here to keep them under the brand and "Modules" label.
    page = st.navigation(pages, position="hidden")
    for p in pages:
        st.page_link(p)

page.run()
