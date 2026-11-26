# MotoAI — AI Car Sales Advisor (Plan + Context)

> இந்த file தான் project-ஓட single source of truth. Plan, discussion, decisions எல்லாம் இங்கதான் இருக்கும். ஒவ்வொரு Claude Code session-லயும் தானா load ஆகும். புது decision எடுத்தா இங்க update பண்ணணும்.

## Discussion log
- **2026-11-25 · Idea (user):** Customer WhatsApp அல்லது Telegram-ல கேப்பாங்க. Bot showroom-ல கேக்குற மாதிரியே முதல்ல இருந்து கடைசி வரை கேள்வி கேக்கும். நம்மகிட்ட இருக்கிற data-ல இருந்து எந்த car better-னு suggest பண்ணும். Car பிடிச்சா exact on-road price சொல்லும். Admin வேற இடத்துல இருந்து PDF upload பண்ணா data தானா store ஆகணும். Website + dashboard இருக்கும், ஆனா customer அங்க போய் search பண்ண மாட்டாங்க, WhatsApp தான் main. Bot website link கொடுக்கும். அதை open பண்ணா bottom-ல AI chat bubble தானா வரும், அதே customer-னு கண்டுபிடிச்சு conversation-ஐ continue பண்ணும்.
- **Scope (user):** இது ஒரு dealer-க்கான tool இல்ல. எந்த customer-ம் use பண்ணக்கூடிய common product. Showroom-க்கும் customer-க்கும் நடுவுல இருக்கிற **RM / sales person-ஐ replace பண்றது** தான் நோக்கம். Proper data வச்சு convince பண்ணணும்: family, price, quality பாத்து. இப்போ Toyota data மட்டும். அப்புறம் **எல்லா brand, எல்லா dealer / showroom data-வும்** user தருவாங்க.
- **Choices (user):** WhatsApp = Meta Cloud API direct. Specs = brochure PDF upload + AI web lookup ரெண்டும், admin approve பண்ணணும். Languages = English + தமிழ் + Tanglish.
- **Follow-up (user):** Plan OK. முதல்ல customer end. Prototype design பாத்துட்டு முடிவு பண்ணலாம். Meta verification, domain பின்னாடி தருவாங்க. Car photos internet-ல இருந்து auto-fetch → approve queue. Business model: commission + subscription, அப்புறம் discuss பண்ணலாம். Website-ல Google login வேணும். Budget கம்மி, profit இப்போ இல்ல. Customer-க்கு bot பிடிக்கணும், அதுதான் முக்கியம்.
- **DB (user + Claude):** Local-ல test பண்றோம். Postgres போதும், Supabase வேண்டாம். Claude opinion: சரியான முடிவு. Docker-ல `pgvector/pgvector:pg16`. Drizzle ORM. Lock-in இல்ல. Prod-க்கு போகும்போது அதே Postgres-ஐ VPS-ல ஓட்டலாம்.

## Context
Showroom-ல இருக்கிற RM / sales person-ஐ replace பண்ற customer-facing AI advisor. Customer WhatsApp-ல பேசுவாங்க. Bot showroom மாதிரியே கேள்வி கேக்கும் (family, budget, usage, fuel), எல்லா brand / dealer data-வையும் வச்சு சரியான car-ஐ suggest பண்ணும். Exact on-road price breakup தரும். Website link கொடுக்கும். அந்த link-ஐ open பண்ணா அதே conversation web chat bubble-ல continue ஆகும். Admin PDF upload பண்ணா data தானா DB-க்குள்ள போயிடும்.

Current data: `NEW CAR DATA/` folder-ல 19 PDF, Epic Toyota Chennai, w.e.f. 11 Oct 2026. ஒவ்வொன்னும் ஒரு table: Model / Variant / Suffix / Ex-showroom / TCS 1% / Life tax+Reg+Fastag / Insurance (1+3, 3+3) / EW / Service pack / Accessories / PPO or Sprint kit / Ceramic / Underbody / On-road (1+3) / On-road (3+3) / TGA package items. ஒவ்வொரு model-க்கும் column மாறுது. Taxi / Commercial list தனி. Specs இல்ல. Bank account details இருக்கு.

Checked: Hyryder E-MT-ல component எல்லாம் கூட்டினா 15,06,738 வருது. PDF-ல இருக்கிற on-road total-ஓட exact-ஆ match ஆகுது. அதனால extraction சரியா வந்திருக்கான்னு math வச்சே auto-validate பண்ணலாம்.

## Core design principle (2026 trend)
- **Numbers = structured SQL. LLM ஒருபோதும் price-ஐ generate பண்ணாது.** Agent ஒரு tool-ஐ call பண்ணும். அந்த tool DB-ல இருந்து exact row-ஐ எடுக்கும். Bot அதை மட்டும் quote பண்ணும்.
- Plain vector RAG tabular price-க்கு ஒத்து வராது. அதனால **agentic tool-use + typed DB** use பண்றோம். Vector search (pgvector) unstructured text-க்கு மட்டும்: brochure text, T&C, FAQ.
- PDF ingestion: **vision LLM + JSON-schema structured output → arithmetic validation → human review → publish (versioned)**.

## Decisions (25 Nov 2026, user)
- Plan OK. **முதல்ல customer end மட்டும்.** Bot customer-க்கு பிடிக்கணும், அதுதான் focus. Profit இப்போ இல்ல, low budget.
- Meta verification, domain: பின்னாடி user தருவாங்க.
- Car photos: internet-ல இருந்து auto-fetch பண்ணி **admin approve queue**-க்கு அனுப்பணும்.
- Business model: commission + subscription ரெண்டும். Detail அப்புறம் discuss பண்ணலாம்.
- Website customer login: **Google login**.

## Local dev decision (final): Postgres local, Supabase வேண்டாம்
- இப்போ local-ல மட்டும் test பண்றோம். **Docker-ல `pgvector/pgvector:pg16`** ஓட்டலாம் (Docker 29.8 machine-ல already install ஆகியிருக்கு, psql இல்ல, அதனால Docker தான் easy). `docker-compose.yml` ஒண்ணு, `docker compose up -d` போதும்.
- Node 20.19 ✓, Python 3.11.9 ✓ (PDF extraction-க்கு).
- Prototype (Step 0)-க்கு DB-யே தேவையில்ல. Static data file போதும். Postgres Phase 1-ல இருந்து வரும்.

## Context save location
- எல்லா plan, discussion, decisions, context-ம் project folder-லயே: **`.claude/CLAUDE.md`**. ("cloud folder / cloud.md" = Claude. இந்த file ஒவ்வொரு Claude Code session-லயும் தானா load ஆகும்.) Home-ல இருக்கிற plan file reference-க்கு மட்டும்.

## Supabase vs open source? → Plain PostgreSQL (no lock-in)
Supabase-ம் open source தான், ஆனா அதோட Auth / Realtime / Storage-ல மாட்டிக்க வேண்டியதில்ல. Recommendation:
- **PostgreSQL 16 + pgvector**, **Drizzle ORM** (SQL-first, migrations)
- Start: **Neon** அல்லது Supabase **free tier**-ஐ plain Postgres-ஆ மட்டும் use பண்ணணும் (₹0). Traffic வந்ததும் cheap VPS (Hetzner / DO, ~₹500–800/mo) + Docker Compose-ல self-host. Connection string மாத்தினா போதும்.
- Auth: **Auth.js (NextAuth) Google provider**. Open source, free.
- Realtime widget: நம்ம API-ல இருந்தே SSE streaming. தனி service வேண்டாம்.
- Files / photos: **Cloudflare R2** (10GB free, S3-compatible). Self-host-க்கு MinIO.
- Queue: **pg-boss** (Postgres-க்குள்ளயே ஓடும்).

## Stack (TypeScript)
- **Next.js** (one app): public website + chat widget + admin dashboard + API/webhooks
- DB/Auth/Storage/Queue: மேல சொன்னது
- **LLM**: Claude API `@anthropic-ai/sdk`, model `claude-opus-5-5`
  - Chat: effort `low`/`medium`, prompt caching on (system + tools + playbook index stable prefix)
  - Extraction: effort `high`, PDF `document` block + `output_config.format` JSON schema
  - Refusal fallback: `fallbacks: "default"` enabled
  - Cost later tune: Haiku 5.5 / Sonnet 5.5 for chat. Eval பண்ணி நீங்க முடிவு பண்ணலாம்.
- **WhatsApp**: Meta Cloud API direct (webhook + interactive buttons + CTA URL buttons + approved templates)

## Data model (multi-brand, multi-dealer)
- `brands`, `models`, `variants` (suffix, fuel, transmission, trim, color tone, segment: private/taxi/commercial)
- `dealers` (name, city, RTO jurisdiction, address, contact), `dealer_brands`
- `price_lists` (dealer_id, source_pdf, effective_date, status: draft/review/published/archived, version)
- `price_rows` (price_list_id, variant_id, ex_showroom, tcs, tax_reg, insurance_1p3, insurance_3p3, ew, service_pack, accessories, ceramic, underbody, onroad_1p3, onroad_3p3, `extras jsonb` for model-specific columns like PPO / Sprint kit, package_items[])
- `specs` (variant_id, seats, mileage, engine, power, boot, safety_rating, airbags, ADAS, dimensions…, `source`: brochure/web/manual, `verified` bool)
- `media` (model/variant photos, colors)
- `documents` + `doc_chunks` (pgvector): brochure text, T&C, FAQ
- `customers` (wa_id/phone, name, city, profile jsonb: family size, budget, usage, preferences)
- `conversations` (one per customer, channel-agnostic), `messages` (channel: whatsapp/web, role, content, tool calls)
- `web_sessions` (signed link tokens), `leads` (stage, dealer_id, variant shortlist, test-drive slot, assigned human)

## Component 1 — PDF ingestion pipeline
1. Admin dashboard → Upload (multiple PDF, dealer select, effective date auto-detect)
2. Job: Claude reads PDF (vision) → JSON schema output: rows + column mapping + footnotes
3. **Validators**:
   - TCS = 1% of ex-showroom
   - Σ components = on-road total (1+3 and 3+3)
   - suffix format, variant matches known catalog, new variant → flag
4. **Diff view**: old price vs new price per variant, changed cells highlighted, validation fail = red
5. Admin "Publish". Old list archived, so history stays (price trend analytics-க்கு உதவும்)
6. Same pipeline brochure PDF-க்கும் → `specs` + `doc_chunks`
7. Web enrichment: Claude `web_search` tool வச்சு specs-ஐ draft பண்ணும் → `verified=false` → admin approve. Bot unverified data-ஐ "approx" அப்படின்னு சொல்லும்.

## Component 2 — Sales agent ("Skills" answer)
**Skills பயன்படுமா? ஆமா, ஆனா in-app playbook skills-ஆ.** Claude-ஓட container Agent Skills-க்கு code-execution sandbox வேணும். அது WhatsApp chat-க்கு latency-யும் cost-ம் அதிகம். அதனால அதே idea-வை (progressive disclosure) நம்ம app-க்குள்ளயே பண்றோம்:
- `playbooks/` folder-ல markdown skills. Admin dashboard-லயே edit பண்ணலாம்:
  - `discovery.md`: showroom-style கேள்விகள் (family size, daily km, city/highway, budget, fuel, auto/manual, first car?, exchange?, loan?)
  - `recommend.md`: shortlist logic (budget ±10%, seats, usage → hybrid/CNG/diesel reasoning)
  - `compare.md`, `price-breakup.md` (1+3 vs 3+3 insurance, EW value explain)
  - `objection-handling.md` (price high, competitor, waiting period)
  - `finance-exchange.md`, `test-drive-booking.md`, `taxi-commercial.md`
  - `brand/toyota.md` (warranty, Value Chain, TGA packages). Brand add ஆகும்போது புது file.
- System prompt-ல index மட்டும் இருக்கும். `load_playbook(name)` tool தேவைப்படும்போது load பண்ணும். Conversation stage track ஆகும்.

**Agent tools** (strict JSON schemas):
- `update_customer_profile`, `search_cars(budget, seats, fuel, transmission, body, segment, city)`
- `get_variant_details`, `compare_variants`, `get_onroad_price(variant, dealer|city, insurance_plan)`. Effective date-ம் disclaimer-ம் கூடவே return ஆகும்.
- `search_knowledge` (pgvector), `get_car_link` (signed handoff link), `send_car_card` (photo + buttons)
- `create_lead`, `book_test_drive`, `handoff_to_human`

**Guardrails**:
- Price tool-ல இருந்து மட்டும் வரணும்.
- "Price prevailing at delivery" disclaimer எப்பவும் சேர்க்கணும்.
- Bank account / payment details chat-ல கொடுக்கக் கூடாது. Fraud risk. "Showroom-ல மட்டும் pay பண்ணுங்க" அப்படின்னு சொல்லணும்.
- Data-ல இல்லாத brand கேட்டா honest-ஆ சொல்லிடணும்.
- **Language**: customer எந்த language-ல பேசுறாங்களோ (English / Tamil / Tanglish) அதையே detect பண்ணி அதுலயே reply பண்ணணும்.

## Component 3 — WhatsApp channel
- Webhook `/api/whatsapp` → verify signature → load conversation by `wa_id` → run agent → reply (text / image card / reply buttons / list / CTA URL button)
- Customer start பண்ண 24h window-க்குள்ள free-form reply. Follow-up-க்கு approved templates (e.g., "price update", "test drive reminder").
- Number-ஐ வெளிய காட்டாம அனுப்பணும். Long answer-ஐ சின்ன message-களா பிரிச்சு அனுப்பணும்.

## Component 4 — WhatsApp → Website handoff (உங்க main idea: possible ✅)
1. Bot `get_car_link` call பண்ணும் → `https://motoai.../cars/toyota/hyryder/v-at?t=<signed token>` (token = conversation_id + customer_id, 7 days expiry, HMAC/JWT)
2. WhatsApp-ல CTA URL button "View car & price" வரும்
3. Page open ஆனதும் token verify ஆகும் → httpOnly session cookie set ஆகும் → URL-ல இருந்து token remove ஆகும்
4. Chat bubble **auto-open** ஆகும்: "Hi Ravi 👋 Hyryder V-AT பாக்குறீங்க. 3+3 insurance-ஓட on-road ₹23,54,146. Compare பண்ணலாமா?" Same conversation history load ஆகும் (SSE stream).
5. Web-ல நடக்கிற chat-ம் same `conversations` thread-ல தான் save ஆகும். அப்புறம் WhatsApp-க்கு திரும்பி வந்தா bot-க்கு website-ல என்ன பாத்தாங்கன்னு தெரியும்.
6. Security: link forward ஆனா மத்தவங்க chat history-ஐ பாக்க முடியும். அதனால booking / personal data எடுக்க WhatsApp confirm அல்லது OTP கேக்கணும்.
7. Token இல்லாம நேரா வர visitor-க்கு anonymous web session. Phone கொடுத்தா அந்த customer-ஓட merge ஆகும்.

## Component 5 — Website + Admin dashboard
- **Public site**: brand → model → variant pages, photos, specs, full price breakup table (dealer/city select), compare, EMI calculator, chat bubble எல்லா page-லயும். SEO pages leads கொண்டு வரும்.
- **Admin**: PDF upload + review/publish, catalog/specs/media editor, playbook editor, conversations inbox (live human takeover), leads pipeline (stage, dealer routing), analytics (popular models, drop-off stage, price-quote → lead conversion)

## Proposed repo structure
```
motoai/
  app/(site)/cars/...        public pages
  app/(admin)/admin/...      dashboard
  app/api/whatsapp/route.ts  webhook
  app/api/chat/route.ts      web widget (streaming)
  components/chat-widget/
  lib/agent/                 agent loop, tools, prompts
  lib/ingest/                pdf extraction, schemas, validators
  lib/whatsapp/              Cloud API client, message builders
  lib/handoff/               token sign/verify
  playbooks/                 skills markdown
  db/migrations/
  evals/                     scripted customer conversations
```

## Phases
1. **Foundation**: Next.js + local Postgres (Docker, pgvector) + Drizzle schema + Auth.js (Google)
2. **Ingestion**: upload → extract → validate → review → publish. இந்த 19 PDF-ஐயும் load பண்ணணும். எல்லாம் validation pass ஆகணும்.
3. **Agent core**: tools + playbooks + CLI/web test chat + eval set (~30 scenario: family of 6 budget 20L, taxi buyer, Tanglish speaker, price objection…)
4. **WhatsApp**: Meta app, test number, webhook, interactive messages
5. **Website + widget + handoff link**
6. **Admin inbox/leads/analytics + specs/brochure + web enrichment**
7. Later: voice notes, Telegram, EMI/bank tie-ups, multi-dealer onboarding self-serve

## Verification
- Ingestion: 19 PDF-லயும் Σ-check 100% pass ஆகணும். 5 PDF-ஐ கையால PDF-ஓட cell-by-cell compare பண்ணணும்.
- Agent: eval script. Quote பண்ற ஒவ்வொரு price-ம் DB value-ஓட exact-ஆ match ஆகணும் (regex check). Tamil / Tanglish / English reply சரியா வருதான்னு பாக்கணும். Hallucinated variant இருக்கவே கூடாது.
- WhatsApp: Meta test number-ல end-to-end chat → shortlist → price → link
- Handoff: phone-ல link open பண்ணா widget auto-open ஆகணும், same history வரணும். Expired token → graceful fallback. Forwarded link → booking-க்கு OTP கேக்கணும்.

## NOW — Step 0: plan save + clickable design prototype
Goal: build பண்றதுக்கு முன்னாடியே customer experience எப்படி இருக்கும்னு பாக்கணும். Backend இல்ல, AI API call இல்ல (₹0). Data மட்டும் real, PDF-ல இருந்து எடுத்தது.

1. முழு plan + discussion + decisions எல்லாத்தையும் project-க்குள்ள `.claude/CLAUDE.md`-ல save பண்ணணும்.
2. Data: 19 PDF text extract (pypdf / pdfplumber) → `prototype/data/cars.js` (model → variants → full price breakup, effective date). Σ-check script ஓட்டி எல்லா row-ம் pass ஆகுதான்னு பாக்கணும்.
3. Photos: PDF-க்குள்ள இருக்கிற car images-ஐ extract பண்ணி `prototype/assets/`-ல வைக்கணும் (offline-லயும் வேலை செய்யும்). Internet auto-fetch + approve queue real build-ல வரும்.
4. Specs (seats, fuel, body type, segment): general public knowledge-ல இருந்து எடுக்கணும், "unverified" tag போட்டு.
5. `prototype/index.html` (vanilla HTML/CSS/JS, build step இல்ல, browser-ல நேரா open பண்ணலாம்). Hash routes:
   - **Demo story bar** (மேல): ① WhatsApp chat → ② link tap → ③ website + bubble auto-open
   - `#/whatsapp`: phone frame-ல WhatsApp-style chat. Bot greeting → discovery கேள்விகள் quick-reply buttons-ஆ (family size, budget, usage, fuel, transmission) → real data-ல filter பண்ணி top 3 shortlist cards → price breakup (1+3 vs 3+3) → "View car & price" CTA button
   - `#/` home: hero + "MotoAI-கிட்ட கேளுங்க" + model grid (price-from, segment filter)
   - `#/car/<model>`: photo, variant selector (fuel / transmission / tone), full on-road breakup table, insurance toggle, "unverified" tag-ஓட key specs, EMI calculator, compare-க்கு add
   - `#/compare`: 2–3 variant side-by-side
   - **Chat bubble** எல்லா page-லயும். WhatsApp link வழியா வந்தா auto-open ஆகும், அதே history + "Hyryder V-AT பாக்குறீங்க…" context-ஓட.
   - **Google login** button (mock): login ஆனா "Saved cars / my conversations" காட்டும்.
   - Language switch: English / தமிழ் / Tanglish (scripted bot lines மூணு language-லயும்)
6. Bot logic = scripted state machine + real data filtering. Real Claude agent Phase 3-ல வரும்.
7. Mobile-first design (customer phone-ல தான் open பண்ணுவாங்க). Brand: MotoAI-ஓட own branding. Toyota logo இல்ல. Bank details prototype-ல எங்கயும் காட்டக் கூடாது.

Verify: browser-ல open பண்ணணும் → full story click பண்ணணும் → prices PDF values-ஓட match ஆகணும் (sample 5) → mobile width-ல பாக்கணும்.

## Product Positioning & Design Verdict (Updated 26 Nov 2026 — Round 2 Debate Finalized)
- **NOT a B2B SaaS sold to dealers.** MotoAI is a **B2C Consumer Platform (Spinny / Acko Drive style)** — ONE common platform for car buyers across brands & dealers, replacing the showroom RM.
- **Admin Console = MotoAI's OWN Internal Ops Console** (single-org, NOT multi-tenant dealer SaaS right now; dealer portal is optional future phase).
- **Customer Platform UX Rules:**
  - Bright, trustworthy Spinny/Acko palette (`#F9FAFB` off-white canvas, deep navy `#0F1B2D`, MotoAI teal `#0B6E6E`, amber `#F2A516`).
  - **Zero phone/OTP gate** to view exact Chennai On-Road prices or chat with AI (eliminates CarWale spam-call fear; ask WhatsApp only on "Send shortlist to WhatsApp" / "Book Test Drive").
  - Hero = natural-language AI prompt bar (*"Automatic SUV under ₹20L in Chennai"*) + EN / தமிழ் / Tanglish toggle + instant WhatsApp handoff.
  - Rich Chat UI = interactive car carousel cards, inline on-road breakup card, side-by-side compare card, 1-tap test-drive slot picker (NO text walls).
- **Internal Ops Console (Proper Sidebar + Topbar Dashboard):**
  1. Overview (KPIs, AI vs Human chats, Test-Drive SLA)
  2. Live Advisor Inbox (3-pane: triage queue `AI Stuck / Test-Drive Ready / WhatsApp` | chat thread | buyer profile + 1-click Human Takeover + Showroom Handoff Card)
  3. PDF Upload + Manual Catalog & Price Editor (diff staging grid + inline manual edit + 1-click publish)
  4. Lead & Showroom Router (dispatch verified buyers to Chennai dealers + SLA tracker)
  5. WhatsApp Business Setup (isolated in Setup/Settings: WABA Phone Number ID, Token, Webhook URL copy, Verify status, Approved Templates, Send Test Message)
  6. Internal Team & Roles (4 lean roles + interactive permission matrix):
     - **Platform Admin (Founder/Tech):** WABA/API keys, AI guardrails, team roles, full access
     - **Catalog & Pricing Ops:** Dealer PDF upload, manual price/spec/stock edits, publish
     - **MotoAI Concierge Advisor (RM):** Live chat takeover, buyer consultation, test-drive booking
     - **Dealer Coordinator / Viewer:** Route verified leads to showrooms, track dealer SLAs, read-only on pricing/API

## Open items (later)
- Meta Business verification + WhatsApp number (user தருவாங்க)
- Domain name, hosting (user தருவாங்க)
- Business model detail: commission + subscription (அப்புறம் discuss பண்ணலாம்)

## Deployment Architecture (25 Nov 2026)
- **Modular Plugin Architecture**: `packages/core/` (DB, Auth, Queue, Storage, Events, Config) + `packages/agent/` (loop, tools, guardrails) + `packages/channel/` (adapters). Feature-ஐ add பண்ணா existing code-ல ஒரு line-ம் மாறாது.
- **Business Modules** (`modules/`): catalog, pricing, ingestion, customers, leads, handoff, analytics. ஒவ்வொன்னும் independent — schema, migrations, routes, tools, playbooks export பண்ணும். Auto-discovered at boot.
- **Feature Flags**: `packages/core/config/flags.ts`. Deploy பண்ணிட்டு flag OFF வச்சா production-ல visible ஆகாது.
- **DB Migrations**: ALWAYS additive — add columns, add tables, never drop/rename. Rollback-க்கு safe.
- **Infra files created**: `infra/docker/` (dev + prod compose, Dockerfile, Caddyfile), `infra/ci/deploy.yml` (GitHub Actions), `infra/scripts/` (deploy, rollback, backup).
- **Deploy pipeline**: Git push → lint → typecheck → test → eval (30 scenarios) → Docker build → push GHCR → SSH deploy → health check → auto-rollback on fail.
- **MVP target**: Hetzner CAX11 ARM (₹400/mo) + Docker Compose. Total ~₹700/mo.

## Status
- [x] Plan approve ஆயிடுச்சு (2026-11-25)
- [x] Deployment plan + modular architecture designed (2026-11-25)
- [x] Infra configs created: Docker, CI/CD, scripts (2026-11-25)
- [x] Phase 1 — Foundation complete: pnpm monorepo, `@motoai/core`, `@motoai/agent`, `@motoai/channel`, 6 modular business plugins (`catalog`, `pricing`, `ingestion`, `customers`, `leads`, `handoff`), Next.js 15 App Router scaffold (`/`, `/admin`, `/api/health`, `/api/modules/[...path]`, `/api/chat`, `/api/whatsapp`), Vitest suite passing, production build verified (2026-11-26)
- [ ] Step 0 prototype (`prototype/`) — index.html, data files missing (optional)
- [x] Phase 2 — Ingestion pipeline & Demo DB live: Drizzle 15-table migration + `pgvector` applied, Epic Toyota Chennai demo seed loaded (6 models, 14 variants, 14 Σ-validated price rows), Claude Vision extractor + `extract-preview` + `diff` + versioned `publish` routes, Admin `/admin/upload` & `/admin/catalog` + live `/` showroom grid deployed (2026-11-26)
- [x] Phase 3 — Agent Core + Playbooks + 30-Scenario Evals: Dual-mode agent (Claude API tool-use + prompt caching + DB-backed Smart Advisor fallback), 9 showroom playbooks, 30/30 eval scenarios passing (100%) (2026-11-26)
- [x] Phase 4 — WhatsApp Channel & Shared Persistence: Meta Cloud API webhook/signature/24h window/templates/chunking, shared WhatsApp+Web Postgres conversation history, live `/whatsapp` simulator (2026-11-26)
- [x] Phase 5 — Public Website + Handoff + SEO: `/cars/[brand]/[model]` (1+3/3+3 breakup, EMI calc, test drive modal, signed WhatsApp handoff auto-open), `/compare`, upgraded `<ChatWidget />`, `sitemap.xml` & `robots.txt` (2026-11-26)
- [x] Phase 6 — Admin Dashboard + Pluggable Analytics Module: New `modules/analytics` (16th table `analytics_events`, zero core changes), `/admin/inbox` (live takeover + reply), `/admin/leads` (pipeline), `/admin/analytics`, `/admin/playbooks` editor (2026-11-26)
