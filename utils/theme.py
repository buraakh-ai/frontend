"""Single source of truth for the frontend's color palette and the global
polish CSS layered on top of native Streamlit theming (.streamlit/config.toml
sets the base colors Streamlit itself understands — widget fills, borders,
sidebar; this module adds the semantic tokens Streamlit has no concept of —
success/warning/danger — plus the chrome-level styling that makes cards,
tabs, metrics and alerts read as one cohesive, professional app instead of
default widgets. Import PALETTE for one-off inline styles (score colors,
platform dots) instead of hardcoding hex elsewhere; call inject_global_css()
once, from streamlit_app.py, so it applies across every module page.

Palette is the conventional enterprise CRM/marketing-platform look
(Salesforce/HubSpot-style blue-on-slate, not a purple/creative-tool accent)
— keep "primary"/"primary_dark" here in sync with primaryColor/the sidebar
block in .streamlit/config.toml if either changes."""
import streamlit as st

PALETTE = {
    "primary": "#ff7a59",
    "primary_dark": "#f26042",
    "primary_soft": "#ffe9e0",
    "success": "#4ecdc4",
    "success_soft": "#dffaf7",
    "warning": "#f7c948",
    "warning_soft": "#fff5d6",
    "danger": "#ff6b6b",
    "danger_soft": "#ffe4e4",
    "text": "#eaf2ff",
    "text_muted": "#a9b8cb",
    "border": "#2a3950",
    "surface": "#172334",
    "surface_alt": "#121c2b",
    "canvas": "#0b1220",
}


def score_color(score: float) -> str:
    if score >= 8:
        return PALETTE["success"]
    if score >= 5:
        return PALETTE["warning"]
    return PALETTE["danger"]


def inject_global_css() -> None:
    st.html(f"""
    <style>
    :root {{
        --pal-primary: {PALETTE["primary"]};
        --pal-primary-dark: {PALETTE["primary_dark"]};
        --pal-primary-soft: {PALETTE["primary_soft"]};
        --pal-success: {PALETTE["success"]};
        --pal-success-soft: {PALETTE["success_soft"]};
        --pal-warning: {PALETTE["warning"]};
        --pal-warning-soft: {PALETTE["warning_soft"]};
        --pal-danger: {PALETTE["danger"]};
        --pal-danger-soft: {PALETTE["danger_soft"]};
        --pal-text-muted: {PALETTE["text_muted"]};
        --pal-border: {PALETTE["border"]};
        --pal-surface: {PALETTE["surface"]};
        --pal-surface-alt: {PALETTE["surface_alt"]};
        --pal-canvas: {PALETTE["canvas"]};
    }}

    .stApp {{
        background: linear-gradient(180deg, #0d1627 0%, var(--pal-canvas) 100%);
        color: var(--pal-text);
    }}
    .main .block-container {{
        padding-top: 1.5rem;
        padding-left: 2rem;
        padding-right: 2rem;
        max-width: 1480px;
    }}

    [data-testid="stHeader"] {{
        background: rgba(11, 18, 32, 0.72);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid rgba(154, 184, 255, 0.08);
    }}

    h1, [data-testid="stHeading"] h1 {{
        font-weight: 800 !important;
        letter-spacing: -0.03em;
        color: var(--pal-text) !important;
    }}
    h2, h3, [data-testid="stHeading"] h2, [data-testid="stHeading"] h3 {{
        font-weight: 700 !important;
        letter-spacing: -0.01em;
        color: var(--pal-text) !important;
    }}
    [data-testid="stCaptionContainer"] {{ color: var(--pal-text-muted); }}

    div[data-testid="stVerticalBlockBorderWrapper"] {{
        background: rgba(23, 35, 52, 0.85);
        border: 1px solid rgba(154, 184, 255, 0.12);
        border-radius: 18px !important;
        box-shadow: 0 8px 24px rgba(2, 6, 23, 0.35);
        transition: box-shadow .15s ease, transform .15s ease;
    }}
    div[data-testid="stVerticalBlockBorderWrapper"]:hover {{
        box-shadow: 0 12px 28px rgba(2, 6, 23, 0.42);
        transform: translateY(-1px);
    }}

    div[data-testid="stMetric"] {{
        background: linear-gradient(180deg, rgba(18, 28, 43, 1) 0%, rgba(23, 35, 52, 1) 100%);
        border: 1px solid rgba(154, 184, 255, 0.12);
        border-top: 3px solid var(--pal-primary);
        border-radius: 14px;
        padding: .9rem 1rem .75rem;
        box-shadow: 0 4px 12px rgba(2, 6, 23, 0.22);
    }}
    [data-testid="stMetricLabel"] {{
        text-transform: uppercase;
        letter-spacing: .06em;
        font-size: .7rem !important;
        font-weight: 700 !important;
        color: var(--pal-text-muted);
    }}

    .stButton > button, .stFormSubmitButton > button, .stDownloadButton > button {{
        border-radius: 10px !important;
        font-weight: 700 !important;
        transition: transform .06s ease, box-shadow .15s ease;
    }}
    .stButton > button[kind="primary"], .stFormSubmitButton > button[kind="primary"] {{
        background: linear-gradient(135deg, var(--pal-primary) 0%, #ff8d6d 100%) !important;
        border-color: var(--pal-primary) !important;
        color: #fff !important;
        box-shadow: 0 10px 18px rgba(255, 122, 89, 0.2);
    }}
    .stButton > button[kind="primary"]:hover, .stFormSubmitButton > button[kind="primary"]:hover {{
        background: linear-gradient(135deg, var(--pal-primary-dark) 0%, #ef6848 100%) !important;
        border-color: var(--pal-primary-dark) !important;
        transform: translateY(-1px);
    }}

    [data-testid="stTabs"] [data-baseweb="tab-list"] {{
        gap: 1.5rem;
        border-bottom: 1px solid rgba(154, 184, 255, 0.12);
        background: transparent;
    }}
    [data-testid="stTabs"] [data-baseweb="tab"] {{
        font-weight: 700;
        color: var(--pal-text-muted);
        padding: .8rem 0 .7rem;
    }}
    [data-testid="stTabs"] [aria-selected="true"] {{
        color: var(--pal-primary) !important;
    }}

    div[data-testid="stAlertContainer"] {{
        border-radius: 12px !important;
        border-left: 4px solid currentColor;
    }}

    [data-testid="stExpander"] summary {{
        border-radius: 12px;
        font-weight: 600;
    }}

    [data-testid="stCode"] pre {{
        background: rgba(18, 28, 43, 1) !important;
        border: 1px solid rgba(154, 184, 255, 0.12);
        border-radius: 12px;
    }}

    section[data-testid="stSidebar"] {{
        background: linear-gradient(180deg, #0e1728 0%, #0b1220 100%);
        border-right: 1px solid rgba(154, 184, 255, 0.12);
        width: 310px !important;
        min-width: 310px !important;
    }}
    section[data-testid="stSidebar"] [data-testid="stForm"] {{
        width: 100%;
        margin: 0;
    }}
    section[data-testid="stSidebar"] [data-testid="stVerticalBlockBorderWrapper"] {{
        width: 100%;
        margin: 0;
    }}
    section[data-testid="stSidebar"] [data-testid="stSidebarCollapseButton"],
    section[data-testid="stSidebar"] button[aria-label*="Collapse"],
    section[data-testid="stSidebar"] button[title*="Collapse"] {{
        display: none !important;
    }}
    section[data-testid="stSidebar"] [data-testid="stSidebarHeader"] {{
        display: none;
    }}
    section[data-testid="stSidebar"] [data-testid="stSidebarContent"] {{
        padding-left: 0;
        padding-right: 0;
    }}
    section[data-testid="stSidebar"] [data-testid="stSidebarUserContent"] {{
        padding: 1.25rem 0.75rem 1rem;
    }}
    /* Streamlit gives markdown a -16px bottom margin and page links -6px
       margins, which made the first link overlap the "Modules" label. */
    section[data-testid="stSidebar"] [data-testid="stMarkdownContainer"],
    section[data-testid="stSidebar"] [data-testid="stElementContainer"] {{
        margin-top: 0;
        margin-bottom: 0;
    }}
    /* Tight stack so module links sit right under the "Modules" label; the
       brand/label gap comes from .brand-divider's margin instead. */
    section[data-testid="stSidebar"] [data-testid="stVerticalBlock"] {{
        gap: 0;
    }}
    section[data-testid="stSidebar"] [data-testid="stSidebarNav"] {{
        width: 100%;
        margin: 0;
        padding: 0;
    }}
    section[data-testid="stSidebar"] .brand-shell {{
        margin: 0;
        width: 100%;
        padding: 0 0.5rem;
    }}
    section[data-testid="stSidebar"] .sidebar-section-label {{
        width: 100%;
        margin: 0 0 0.25rem;
        padding-left: 0.5rem;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: .08em;
        text-transform: uppercase;
        color: rgba(226, 232, 240, 0.72);
        text-align: left;
    }}
    section[data-testid="stSidebar"] [data-testid="stPageLink"] {{
        width: 100%;
        margin: 0;
        padding: 0;
    }}
    section[data-testid="stSidebar"] [data-testid="stPageLink-NavLink"] {{
        width: 100%;
        margin: 0;
        padding: .3rem .5rem;
        min-height: 0;
        line-height: 1.3;
        border-radius: 8px;
        border: 1px solid transparent;
        justify-content: flex-start;
        transition: background-color .15s ease;
    }}
    section[data-testid="stSidebar"] [data-testid="stPageLink-NavLink"] p {{
        margin: 0;
    }}
    section[data-testid="stSidebar"] [data-testid="stPageLink-NavLink"]:hover {{
        background: rgba(255, 122, 89, 0.12);
    }}
    section[data-testid="stSidebar"] [data-testid="stPageLink-NavLink"][aria-current="page"],
    section[data-testid="stSidebar"] [aria-current="page"] [data-testid="stPageLink-NavLink"] {{
        background: rgba(255, 122, 89, 0.15);
        border: 1px solid rgba(255, 122, 89, 0.28);
    }}

    section[data-testid="stSidebar"] .stSelectbox, 
    section[data-testid="stSidebar"] .stTextInput, 
    section[data-testid="stSidebar"] .stDateInput, 
    section[data-testid="stSidebar"] .stMultiSelect,
    section[data-testid="stSidebar"] .stTextArea,
    section[data-testid="stSidebar"] .stRadio,
    section[data-testid="stSidebar"] .stCheckbox,
    section[data-testid="stSidebar"] [data-testid="stFileUploaderDropzone"] {{
        background: rgba(18, 28, 43, 0.8);
        border-radius: 10px;
        border: 1px solid rgba(154, 184, 255, 0.12);
    }}

    section[data-testid="stSidebar"] .stSlider .css-1d391kg, 
    section[data-testid="stSidebar"] .stSlider [data-testid="stBaseSlider"] {{
        background: rgba(18, 28, 43, 0.8);
    }}

    section[data-testid="stSidebar"] .stForm,
    section[data-testid="stSidebar"] .stVerticalBlock,
    section[data-testid="stSidebar"] [data-testid="stVerticalBlock"],
    section[data-testid="stSidebar"] [data-testid="stVerticalBlockBorderWrapper"] {{
        width: min(100%, 330px);
        margin: 0 auto;
    }}
    section[data-testid="stSidebar"] [data-testid="stHeader"] {{
        width: min(100%, 330px);
        margin: 0 auto;
        padding-left: 0 !important;
        padding-right: 0 !important;
        text-align: center;
    }}
    section[data-testid="stSidebar"] h1,
    section[data-testid="stSidebar"] h2,
    section[data-testid="stSidebar"] h3,
    section[data-testid="stSidebar"] .stMarkdown {{
        text-align: left;
    }}

    .brand-shell {{
        display: flex;
        align-items: center;
        gap: 0.8rem;
        padding: 0.1rem 0 0.05rem;
        margin: 0;
        background: transparent;
        border: none;
        border-radius: 0;
    }}
    .brand-copy {{
        display: block;
        text-align: left;
        width: 100%;
    }}
    .brand-title-sub {{
        margin-top: 0;
        display: inline;
    }}
    .brand-title {{
        color: #f8fafc;
        font-size: 1.02rem;
        font-weight: 700;
        line-height: 1.35;
        display: block;
        white-space: nowrap;
        letter-spacing: -0.01em;
    }}
    .brand-subtitle {{
        color: rgba(226, 232, 240, .75);
        font-size: .7rem;
        line-height: 1.25;
        margin-top: .12rem;
        width: 100%;
    }}
    .brand-divider {{
        width: 100%;
        height: 1px;
        background: rgba(255, 255, 255, 0.24);
        margin: 1.75rem 0 1.75rem;
    }}
    .sidebar-section-label {{
        margin-top: 0;
    }}
    </style>
    """)
