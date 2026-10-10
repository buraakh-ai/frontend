# Growth Suite glossary

Short definitions of the fields, numbers and statuses shown in the Growth Suite, for answering client questions. Grouped by page. The lead fields appear first because they show up on several pages.

## Lead fields (Lead Finder results)

| Field | What it means |
|---|---|
| Business / Name | The business's name as listed in the source directory or on its website. For a practice named after a professional ("Peter D. Cancellier DDS"), the name is the person's practice. |
| Category | The industry or specialty the business was found under (for example "Dentists", "Indian restaurants"). |
| Website | The business's own website. Directory pages, social media pages and review sites are never used as the website. |
| Address / City / State / Country | Where the business is located, from the directory listing or the website. |
| Phone | A public business phone number from the directory listing or the business's website. US and Canada numbers are checked to be valid 10-digit numbers. |
| Business email | The business's general email address (for example info@, office@, appointments@), found on its own website or in a public directory. |
| Personal email | A named person's work email at the business, when one is published (for example jane@business.com). |
| Decision maker | The owner, founder or manager, with their role. It is shown only when a page or search result names that person with that role at this business. It is never guessed. |
| LinkedIn | The person's LinkedIn profile or the company's LinkedIn page, when one was found. Only linkedin.com links are accepted. |
| Source pages | The web pages where the details were found (directory listing, the business's contact or team page, search results). They let anyone check where a lead came from. |
| Score | 0–100: how complete the lead's contact details are (see below). |
| Status | Verified, Enriched or Incomplete (see below). |
| Marketing notes | One or two sentences from the AI on why the business might need the client's services, based on what was found. |

### Score (0–100)

Points for each piece of contact information found:

| Found | Points |
|---|---|
| Business email | 25 |
| Phone | 20 |
| Decision maker's name | 20 |
| Decision maker's role | 10 |
| LinkedIn (person or company) | 10 |
| Website | 10 |
| At least one source page | 5 |

The score measures how many ways there are to reach the business. It does not measure how good a prospect the business is. Leads are listed highest score first.

### Status

| Status | Meaning |
|---|---|
| Verified | Has a business email, a phone, a decision maker's name and role, and a source page. Ready for outreach to a named person. |
| Enriched | Score of 45 or more, typically phone + email + website, or phone + a named person. A good lead that is missing part of the full set. |
| Incomplete | Score under 45, typically a phone or an email and little else. Still contactable, usually through the front desk. |

"Verified" means every required detail was found in published sources. It does not mean anyone called the number or sent a test email.

### Qualified lead

A lead the person can contact: it has a phone number or an email. Anything without one is dropped before the results are shown, so every lead in the results is qualified.

## Lead Finder: run settings

| Setting | What it means |
|---|---|
| Country / State / Cities | Where to look. Cities are searched together with their state, so "Irvine" means Irvine, California. |
| Industries | Kinds of business to find (for example Dentists, Restaurants). |
| Specialties | A narrower kind within an industry (for example "Indian restaurants" within Restaurants). When a specialty is picked, only that specialty is searched, and businesses that aren't really that specialty are left out. |
| Include / Exclude keywords | Prefer businesses that match the include keywords; leave out any business that matches an exclude keyword. |
| Qualified leads | How many leads the run should return. |
| Search depth | Quick, Standard or Thorough: how many businesses are checked for each lead requested (about 1.5×, 2× or 3×). Deeper runs find more, but take longer. |
| Businesses to check | How many businesses are researched in total (set by the depth unless changed by hand). |
| Find decision makers | Also looks for the owner or managers: reads the business's team or about page and searches the web and LinkedIn. Turning it off makes runs faster, and leads then have business contacts only. |
| Decision-maker roles | The roles to look for first (Owner, Founder, General Manager, …). |
| Search the web for emails | When a business's website shows no email, searches the web for addresses at its domain (for example "@business.com"). |
| Results per search / Pages per search | How many results each directory or web search reads. |
| Businesses per batch / Parallel batches | How the research is split up to run faster. Batches of businesses are researched at the same time. |
| Est. time / Est. cost | A forecast before the run. It adjusts to the actual results of earlier runs in the same browser. |

## Lead Finder: progress and results

| Item | What it means |
|---|---|
| Stage | Starting → Discovering (finding businesses) → Enriching (reading their websites, finding contacts) → Finishing → Done. |
| Stop | Ends the run within a few seconds and keeps the leads found so far. No further searches or AI work start after it. |
| Search results read | Every listing and search result looked at, including duplicates and rejected results. |
| Unique businesses | Distinct businesses after removing duplicates, closed businesses, and list pages or articles (such as "Top 10 dentists in Irvine"). |
| Businesses checked | Businesses whose websites and contacts were researched. |
| Qualified leads | Businesses that ended up with a phone or an email. |
| With phone / With email / Decision makers / Fully verified | How many of the leads have each item. "Fully verified" is the number with Verified status. |
| Found by source | How many businesses each source supplied (Yellow Pages, OpenStreetMap, …). |
| Some searches failed | A source didn't answer (busy or blocked). The run carries on with the other sources. |
| Export to Lead Hub | Sends only the leads someone has ticked and confirmed to the Lead Hub. Nothing is saved automatically. |

## Where leads come from (sources)

| Source | What it is |
|---|---|
| Yellow Pages | Public US business directory. The main source: almost every listing has a phone number, and most have a website. |
| OpenStreetMap | Free, open map of businesses worldwide, often with a phone, email and website. Coverage varies by area. |
| Public web | Results from free web search engines. List pages and articles are filtered out, so only individual businesses remain. |
| Chambers | Chamber of commerce member directories found through web search. |
| Sulekha | Directory used mainly for Indian-owned and South Asian businesses. |
| The business's website | Each business's own site is read (home, contact, about and team pages) for emails, phones, people and LinkedIn links. |

All of these are published, public sources. No private databases or bought lists are used.

## Cost and usage (cost breakdown)

| Item | What it means |
|---|---|
| Total cost / Cost per lead | Estimated cost of the run, from list prices. It is not a bill. With the default free search sources, the cost per lead is all AI: reading each business's website and writing up the lead (about $0.01 or less per lead). |
| AI model / AI calls | The AI model that turned the collected information into leads, and how many times it was called (about once per batch of ~10 businesses). |
| Tokens in / out | The amount of text the AI read and wrote. AI cost is based on it. |
| AI cost | Estimated AI cost. About $0.004–0.006 for a 10-lead run. |
| Free web searches | Searches through free search engines. Cost: $0. |
| Directory lookups (free) | Yellow Pages and OpenStreetMap pages read. Cost: $0. |
| Free-tier API searches (Tavily, Brave) | Searches through optional search services that have a free monthly allowance. Normally $0. |
| Search cost | Total cost of searches. $0 with the default (free) sources. |
| Time per lead | Run time divided by the number of leads. |

In no-AI mode (an administrator setting) the whole run costs $0, but leads have no decision makers and no specialty check.

## Lead Hub

The central store (AWS database) that every lead source sends its approved leads to.

| Field | What it means |
|---|---|
| Source | Where the lead came from: Lead Finder, Bitrix24 or Zoom webinar. |
| Name / Email / Phone / Company / Job title | The contact's details. For Lead Finder leads, the person is the decision maker (when found) and the company is the business. |
| Landed | When the lead arrived in the Lead Hub. |
| Zoho | Whether the lead has been sent to Zoho ("synced"). |
| Already in Zoho | Leads already synced to Zoho. They are not selected again. |
| Sync to Zoho | Sends the selected leads to Zoho CRM and adds them to a Zoho Campaigns list. Zoho needs an email and a last name, so leads without both can't be synced. |
| Succeeded / Failed | Results of the last sync. A failed lead shows the reason. |

## Bitrix24 Export

| Field | What it means |
|---|---|
| Date range | Leads created in Bitrix24 CRM between these dates. |
| Category | The Bitrix24 lead category, used to filter the list. |
| Stage | The lead's stage in Bitrix24. |
| Created | When the lead was created in Bitrix24. |
| Bitrix lead ID | The lead's ID in Bitrix24. |
| Lead Hub | "Exported" once the lead has been sent to the Lead Hub. |

## Export leads to Zoho

| Field | What it means |
|---|---|
| Lead date range | Leads saved in the database between these dates. |
| Zoho Campaigns list | The mailing list in Zoho Campaigns that exported leads are added to (an existing list or a new one). |
| Exported / Succeeded / Failed | How many leads reached Zoho CRM and the list, and how many didn't (with the reason). |

## Ad generator

| Field | What it means |
|---|---|
| Company name / website / What does the company do? | What the ad is for. Used to write the ad. |
| Ad idea or angle / Audience / Tone / Current event | Optional direction for the ad's message. |
| Countries to target | Where the ad is shown. |
| Image prompt / Aspect ratio | What the generated ad image should show, and its shape. |
| Daily budget / Run for how many days / Estimated total spend | Ad spend: the daily budget × the number of days. |
| Call-to-action URL | Where people go when they click the ad. |
| Execution password | Required to activate an ad, because activating starts spending real budget. |
