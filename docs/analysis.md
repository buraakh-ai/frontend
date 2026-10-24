# Lead Finder: analysis and recommendations

Prepared 2026-10-20 for team review. Analysis only: nothing has been changed yet.

## 1. What leadership asked for

- More leads, and better-quality leads, so we can add value for clients.
- More "intelligence" in the app: use AI where it truly helps, in the most efficient way.
- Search more efficiently: multiple searches, Google search, a headless browser.
- The concrete example: **searching Google for "Indian restaurant" in a city shows many more restaurants than Lead Finder returns.** The suspicion is that businesses with missing details are disqualified automatically, and that if we visited each business's website (About / Contact pages) we would find the address, email and phone and end up with more qualified leads.

## 2. How Lead Finder works today

1. **Find businesses** (in this order): Yellow Pages (US only, about 30 businesses per page, almost all with a phone number), OpenStreetMap, free web search (SearXNG / DuckDuckGo; SearXNG can query Google, Bing and others but gets rate-limited), and chamber-of-commerce directories.
2. **Read each business's website**: the home page; up to 3 Contact / About / Team links when the home page shows no email; up to 2 more contact pages from the sitemap; a web search for "@their-domain" emails; and, if "Find decision makers" is on, the team page plus web and LinkedIn searches for the owner. A headless browser (Playwright) is already there, but only as the last resort when simpler page fetching fails.
3. **AI step**: one AI call (gpt-4o-mini) per batch of 10 businesses turns everything collected into leads. A grounding check then removes any phone, email or person the AI wrote that was not actually found on a page.
4. **Filter**: a lead is kept only if it has a **phone or an email**. The AI also skips businesses it judges to be the wrong specialty (for example "not really an Indian restaurant"), outside the area, or not a single business (lists, articles).

Today's cost: about **$0.004–0.006 per 10-lead run** (AI only; all searches are free).

## 3. Why Google shows more restaurants than Lead Finder

Ranked by impact:

1. **Lead Finder looks at only a few businesses, by design.** It checks about 1.5×, 2× or 3× the number of leads requested (Quick / Standard / Thorough) and then stops. Ask for 10 leads and it looks at about 20 businesses, usually just the first page of Yellow Pages. Google lists 100+. **Most of the restaurants Google shows were never looked at, rather than rejected.**
2. **No real Google Maps data.** Google Maps has the most complete list of local businesses (especially restaurants). To save cost we removed SerpAPI and Google Places, so today's sources are Yellow Pages, OpenStreetMap and free search, which has only weak, rate-limited access to Google. Restaurants that aren't on Yellow Pages are mostly missed.
3. **Businesses without a phone or email are dropped silently.** The user never sees them, not even as "found, but missing contact details". The AI also drops some for specialty or location reasons without saying why.
4. **Many restaurants have no website of their own.** They use only Facebook, Instagram or a delivery-app page. Lead Finder deliberately ignores those pages, so it never reads the phone or email published there.

About the "About section" idea: Lead Finder already visits Contact / About / Team pages, but only when the home page has no email. It also never takes the **address** from the website; the address comes only from the directory. So the idea is partly in place and can be pushed further.

## 4. Recommendations

Effort is a rough estimate for one developer. Costs are explained in section 5.

### Phase 1: quick wins (fixes "fewer than Google" with free sources)

| # | Change | What it gives | Effort | Extra cost |
|---|---|---|---|---|
| 1 | **"Find as many as possible" mode**: keep going through every Yellow Pages page and search result for the area instead of stopping at about 2× the requested leads | Many more businesses per run | 1–2 days | $0 (AI cost grows with the number of leads: about $0.0005 per lead) |
| 2 | **Show near-misses**: a "Found, needs contact info" list for businesses with a name and address but no phone or email yet, instead of hiding them | The user sees everything found; they can still be used or researched | 1 day | $0 |
| 3 | **Show why a business was dropped**: no contact found, not that specialty, outside the area, duplicate | Transparency; easier to tune | 1 day | $0 |
| 4 | **Read the address and phone from the business's own website** (Contact / About / footer), always, not only when no email was found | More complete leads | 1 day | $0 |

### Phase 2: Google data and smarter searching

| # | Change | What it gives | Effort | Extra cost |
|---|---|---|---|---|
| 5 | **Google Places as a source**: Google Maps listings with phone, website, address, rating and hours (Places API "Text Search") | The single biggest coverage gain: the same businesses people see on Google Maps | 2–3 days | Usually $0 (free monthly allowance); see section 5 |
| 6 | **Multiple searches per request, written by AI**: "Indian restaurant" becomes related searches (biryani, tandoori, dosa, Pakistani, Nepali, Indian buffet), and the city is split into neighborhoods or ZIP codes, as Google does | Finds businesses a single search misses | 1–2 days | About $0.0005 per run (one small AI call) |
| 7 | **Faster, smarter headless browser**: reuse one browser instead of starting Chrome for every page, and render JavaScript-heavy sites (Wix, Squarespace, online-ordering pages) where the phone and email appear only after loading | More contacts found on modern sites, faster | 1–2 days | $0 software; may need more server memory (see section 5) |
| 8 | **Social and listing pages as a contact source**: when a business has no website, read the phone and email from its Facebook "About" or Yelp page | More restaurants qualify | 2–3 days | $0, but see the terms-of-use note in section 6 |

### Phase 3: "true AI" intelligence

| # | Change | What it gives | Effort | Extra cost |
|---|---|---|---|---|
| 9 | **AI browsing agent for the gaps**: for businesses still missing details, an AI agent opens the site in the headless browser, clicks through About / Contact / footer, and pulls out address, email and phone | Fills the last gaps that fixed rules miss | 4–6 days | About $0.005 per business it is used on (only the incomplete ones) |
| 10 | **Fit score for AG FinTax**: rank businesses by how likely they are to need tax or accounting help (newly opened, growing, multiple locations, many reviews), next to today's contact-completeness score | Better leads, not just more leads | 2–3 days | About +20% on the existing AI call: still under $0.001 per lead |
| 11 | **Memory across runs**: skip businesses already in the Lead Hub or seen in past runs | Every run brings new leads | 2 days | $0 |
| 12 | **Email check**: confirm the email's domain can receive mail (MX lookup) | Fewer bounced campaigns, protects the sender's reputation | 0.5–1 day | $0 |

## 5. Costs

### Google Places (recommendation 5)

Google's current list prices for Places API (New) Text Search, checked 2026-10-20 at [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing):

- The tier that includes **phone number and website** is "Text Search Enterprise": **$35 per 1,000 requests**, with the **first 1,000 requests each month free**.
- One request returns up to **20 businesses**; one search can page to at most **60 businesses** (3 requests).
- So each business found costs about **$0.00175** (less than a fifth of a cent) after the free allowance. That is about **$1.75 per 1,000 businesses found**, or roughly **$2.50 per 1,000 qualified leads** if about 70% of them end up with a phone or email.

What that means per month:

| Team usage per month | Google requests | Cost |
|---|---|---|
| 100 runs, one search each (up to 60 businesses per run) | 300 | **$0** (within the free 1,000) |
| 100 runs with AI search expansion (3 searches each, up to 180 businesses per run) | 900 | **$0** |
| 200 runs with AI search expansion | 1,800 | about **$28** (800 billable × $0.035) |
| Budget guard: stop using Google after N requests a month and continue with the free sources | capped | **whatever cap we set**, for example $0 or $5 |

**Recommendation:** add a monthly budget guard (a setting) so Google is used only up to a fixed number of requests. Normal team usage should stay at **$0 to a few dollars a month**, and it can never exceed the cap.

A valid Google Cloud API key with Places API (New) enabled and billing set up is needed. The key in the local backend configuration was rejected by Google (REQUEST_DENIED).

### AI (OpenAI gpt-4o-mini, $0.15 per million input tokens and $0.60 per million output tokens)

| Item | Cost |
|---|---|
| Today: turning collected evidence into leads | about $0.0005 per lead ($0.50 per 1,000 leads) |
| AI search expansion (recommendation 6) | about $0.0005 per run |
| Fit score (recommendation 10) | under $0.001 per lead in total |
| AI browsing agent (recommendation 9), only for incomplete businesses | about $0.005 per business, so about $2 per 1,000 leads if used on 30% of businesses |

### Everything combined

For a busy month of **5,000 qualified leads** with every recommendation in place: AI about $15 (lead writing and fit score about $5, browsing agent about $10), Google Places $0–15 depending on how many repeat searches AI expansion adds and on the budget guard. Searches, directories and the browser are free. **Total: roughly $15–30 for 5,000 leads, i.e. about $3–6 per 1,000 leads.**

At a normal pace (around 1,000 leads a month) it stays at **about $3 a month**: Google within the free allowance, AI about $1, the browsing agent about $2.

### Server

The headless browser (recommendations 7 and 9) uses more memory. If the Lead Finder backend task on AWS needs to grow by 1 vCPU and 2 GB, that is roughly **$35 a month** more at AWS Fargate list prices when running all the time. Reusing one browser should avoid this; we will measure before changing the server size.

## 6. Risks and questions for leadership

1. **Budget for Google Places:** is "free allowance plus a small monthly cap" (for example $5–10) acceptable? This is the biggest single lever on the number of leads.
2. **Google's terms:** Google Maps Platform terms limit storing Google's data (only place IDs may be kept long term). The safe design is to use Google to **find** the business and its website, and take the phone and email we store from the **business's own website**. To confirm before we save Google-sourced details in the Lead Hub or Zoho.
3. **Quantity vs completeness:** more businesses even if some lack an email, or fewer, fully complete leads?
4. **Speed:** "find everything for this city" takes minutes, not seconds. Acceptable?
5. **Terms of use of other sites:** reading Yellow Pages is already a terms-of-use risk; Facebook actively blocks automated reading. Are we comfortable with recommendation 8?
6. **Quality questionnaire:** the questionnaire prepared on 2026-10-11 (`Lead-Finder-Quality-Questions.xlsx`: 9 questions, 20 lead features) covers most of these choices. Have the answers come back?

## 7. Suggested plan

1. **Phase 1** (about 1 week): "find as many as possible", near-miss list, drop reasons, address from website. Measure on the Indian restaurants example against a Google search.
2. **Phase 2** (about 1–2 weeks): Google Places with a budget guard, AI search expansion, faster headless browser. Social pages only if leadership accepts the risk.
3. **Phase 3** (about 2 weeks): AI browsing agent for gaps, AG FinTax fit score, memory across runs, email check.

After each phase we compare the same test searches (for example Indian restaurants in Irvine, dentists in Irvine, plumbers in San Jose): businesses found, qualified leads, leads with email, run time and cost.

## Appendix: where this lives in the code (for developers)

Backend project `leadscraping-backend`:

- Discovery and the "stop at about 2×" limit: `orchestration/discovery_v2.py` (the target is `source_count` × `oversampling_factor`; the frontend sends `oversampling_factor: 1` and `source_count` = leads × depth factor).
- Website reading: `orchestration/enrichment.py` (`gather_evidence`), `tools/contact_scraper.py`, `tools/sitemap_discovery.py`, `tools/people_pages.py`.
- Sites ignored as "not the business's own site" (Facebook, Instagram, Yelp, ...): `NOT_OWN_SITE` in `orchestration/enrichment.py` and `AGGREGATOR_DOMAINS` in `orchestration/discovery_v2.py`.
- Headless browser (a new Chromium per page, last in the chain): `tools/scraping/playwright_engine.py`, `tools/scraping/fallback_chain.py`.
- Qualification and scoring: `lead_quality.py`; AI instructions: `prompts/lead_extractor_agent.yaml`.

Frontend: run settings and depth factors in `src/app/lead-source/lead-source.tsx`; defaults in `src/config/lead-source.json`.
