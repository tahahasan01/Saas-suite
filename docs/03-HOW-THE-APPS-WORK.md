# How The Apps Work

Plain-language walkthroughs of the Business OS and its three apps — the way a user actually
experiences them. This is the "tell me how it works" document.

---

## 0. The shared experience (true for every app)

**Onboarding.** A business signs up, picks its **industry** (School, Retail Shop, Software House,
Real Estate, Restaurant, Pharmacy…) and its **modules** (CRM, POS, HRMS). Two things happen
instantly:
1. The whole interface **re-labels itself** to that industry (a school sees "Students," a shop sees
   "Customers," a software house sees "Corporate Clients") — same engine underneath, different words
   and forms.
2. Only the paid modules unlock; the rest stay locked behind the paywall.

**Two ways to do everything.** Every screen has both:
- **The manual way** — click, type, forms, keyboard shortcuts (fast for power users).
- **The AI way** — an **AI Prompt Box** in every module. The user types or speaks plain language
  ("show me leads from Lahore that went cold this week and draft a follow-up") and the AI does it.

The AI is not a chatbot bolted on. It's an **active business consultant** that reads your data,
takes actions, and proactively warns you (low stock, resign risk, a hot lead going cold). Section
§4 explains the AI in depth.

---

## 1. App A — CRM / Revenue Intelligence & Field Force

*The first app to build (pure software, sellable, showcases the USP).*

### What it's for
Capture leads from everywhere, never lose one, work them through a pipeline, and close — with the AI
scoring, routing, summarizing, and reminding so nothing falls through the cracks.

### How a lead flows through it (the core journey)

```
Lead is born ─▶ scored & de-duped ─▶ routed to an agent ─▶ worked (omnichannel)
            ─▶ won/lost ─▶ post-sale fulfillment ─▶ (accounts issues invoice)
```

1. **A lead is born.** It can arrive four ways:
   - A Facebook/Instagram/Google/LinkedIn ad form submission (ingested via webhook — no manual
     entry).
   - A WhatsApp message to the business number.
   - A Shopify/WooCommerce checkout (online business ingestion).
   - Manually typed by an agent.
2. **The AI scores it 1–100** using source, geography, industry, company size, and metadata — so the
   best leads rise to the top automatically.
3. **Duplicate detection** fuzzy-matches phone, email domain, and company name so two agents don't
   fight over the same lead.
4. **Auto-routing** assigns it: round-robin across agents, or an instant WhatsApp alert dropped into
   the right department's group — driven by tenant-defined rules in the workflow engine.
5. **The agent works it in an Omnichannel Portal.** Every call, WhatsApp, email, and AI-bot
   interaction with that lead shows on **one timeline**. After each touch the agent logs the outcome
   (Interested / Not Interested / Call Back / Busy), schedules the next follow-up, and writes call
   notes. 15 minutes before that follow-up, the system pings them.
6. **The pipeline is a drag-drop Kanban.** A tenant can run several pipelines at once (Inbound,
   Outbound, "Institutional Admissions" for a school). Moving a card between stages is a state
   machine that can fire automations.
7. **When the deal is Won,** the screen shows an **industry-specific fulfillment form**:
   - Retail → SKU/variant, final price, courier (self-pickup vs BlueEX/Leopards dispatch).
   - Education → batch start/end, class timings, assigned instructor.
   - Real estate → property/plot, possession/registry date.
8. **Sales can't touch the ledgers.** To bill, the agent clicks "Request Quotation/Invoice" (with
   pricing + proposed discount). This fires a **workflow ticket** to the Accounts dashboard.
   Accounts verifies, approves, and the system **auto-generates the PDF invoice** and pushes it to
   both the sales portal and the customer portal. Clean separation, full audit trail.

### Field Force (the mobile half, added in P3)
For businesses with sales reps on the road:
- **Route optimization** solves a Traveling-Salesperson problem over the day's assigned addresses
  (Google Maps Matrix API) so the rep drives the shortest route.
- **Geofenced check-in:** the rep can only mark "visited" when their GPS is within 50 m of the
  client, and only then does the **selfie verification** panel open — the anti-fraud layer rejects
  mock-GPS/VPN/rooted devices.

### Call center (P3)
Click-to-call dials out via a browser VoIP SDK. The call is recorded, **Whisper transcribes it**,
and the AI writes a concise, actionable summary straight into the lead's timeline — the agent never
types call notes again.

### What the AI does *for you* in CRM
Scores and routes leads, de-dupes, summarizes calls, drafts follow-up messages, and answers manager
questions in plain English ("who are my top 10 leads I haven't contacted in 3 days?"). It also warns
you when a hot lead is going cold.

---

## 2. App B — POS & Predictive Inventory

*App #2. A cashier-facing point of sale that works with no internet and predicts what to restock.*

### What it's for
Ring up sales in <100 ms per keystroke, on real shop hardware, even when the internet drops — and
have the AI tell the owner what to buy before they run out.

### How a sale works (the checkout journey)

1. **It runs offline-first.** The whole catalog, prices, and customers live locally in the browser
   (IndexedDB). Billing, barcode scanning, and receipts keep working with the internet down. When
   the connection returns, a background worker **syncs the delta** up to the cloud (with a conflict
   policy so nothing is lost or double-counted).
2. **It's keyboard-driven for speed.** Cashiers never touch the mouse. Function keys are global:
   - F1 new invoice · F2 product search · F3 customer · F4 hold invoice · F5 discount ·
     F6 payment · F7 print · F8 cash drawer · Ctrl+Q change qty · Del remove line · Ctrl+S save draft.
3. **Hardware just works.** A small native bridge (Electron + Node-HID) on the shop PC listens to
   USB/Bluetooth **barcode scanners**, streams **ESC/POS** bytes to thermal **receipt printers**,
   pulses the **cash drawer**, and reads **weighing scales** over serial — injecting clean data into
   the web app. Receipts can carry tax/QR formats (e.g., FBR-compliant).
4. **The UI becomes the shop's industry:**
   - Supermarket → fast scan-and-go grid.
   - Restaurant → table floor map, split bills, **kitchen order tickets** printed to the kitchen.
   - Pharmacy → expiry-date tracking, batch validation, FIFO checks.
   - Wholesale → tiered pricing by customer type.
5. **Labels print precisely.** A ZPL/TSPL engine turns on-screen layouts into exact Zebra/TSC
   barcode and shelf stickers.

### The predictive inventory brain (the differentiator)
Two AI systems run in the background:
- **Restocking consultant.** It watches each product's sales velocity vs stock on hand. When a
  category is heating up and stock is draining, it pops an alert: *"Beverages sales up 35% this
  month, Product X is moving fast — stock at least 400 units to avoid stock-outs."*
- **60-day seasonal forecaster.** A cron worker looks 60 days ahead at a **local event calendar**
  (Eid, Ramadan, Back-to-School, wedding season). Sixty days before an event it pulls *last year's*
  sales for that window, runs a time-series model (Prophet/ARIMA), and shows the owner:
  *"Recommended stock: 850 units · Predicted sales: PKR 15,400 (+22% YoY) · Est. profit: PKR 4,100"*
  — with a **one-click "Draft Purchase Order"** button that pre-fills a supplier order.

### What the AI does *for you* in POS
Proactive restock alerts, seasonal demand forecasts with draft purchase orders, and fraud flags
(a cashier doing suspicious cancellations/refunds gets surfaced to the owner).

---

## 3. App C — HRMS

*App #3. Runs the whole employee lifecycle with AI-verified attendance and payroll.*

### What it's for
Hire, onboard, track attendance honestly, monitor productivity, run payroll, and let staff self-
serve answers — with the AI predicting who might quit and catching attendance fraud.

### The employee journey

1. **Hire.** Job posts collect CVs; the AI **matches CVs to the job description** using vector
   embeddings and can generate targeted interview questions from a candidate's resume gaps.
2. **Onboard.** Upload CNIC/passport/CV → **OCR auto-fills** the profile. Contracts and offer
   letters are **e-signed** with cryptographic audit logs. Everything lands on a chronological
   **employee ledger** (transfers, promotions, contracts over time).
3. **Attend — honestly.** Three modes, all anti-proxy:
   - **Onsite:** biometric-device webhook, or a mobile QR that **rotates every 5 seconds** (so a
     screenshot can't be reused).
   - **Outdoor/field:** geofenced perimeter + route history.
   - **AI selfie verification:** the attendance selfie is face-matched against the profile photo, so
     one employee can't punch in for another. Mock-GPS/VPN/rooted devices are rejected.
4. **Work — measured.** An optional (consent-gated) desktop agent logs activity (idle after 5 min)
   and takes occasional screenshots to secure storage. A shift engine builds rosters with rules
   (e.g., min 11 h rest between rotations).
5. **Get paid.** A configurable payroll engine computes salary with deductions (late arrivals,
   unpaid leave), bonuses, overtime multipliers, and **FBR/local tax slabs**. Expense claims scan
   travel/fuel receipts into approval workflows.
6. **Self-serve.** An **HR chatbot** (RAG over the company policy knowledge base) answers "how many
   leaves do I have left?" or "what's my salary status?" Managers get NL→SQL: *"who was late more
   than 3 times this month?"* → answered instantly.
7. **Collaborate.** Real-time chat, encrypted file sharing, and (later) WebRTC audio/video.

Plus secondary modules: LMS (video + quizzes + certificates), asset lifecycle tracker (assignment +
depreciation), and a visitor gateway (QR kiosk scans visitor CNIC, notifies the host).

### What the AI does *for you* in HRMS
**Resign-risk prediction** (flags employees likely to quit from activity + history patterns),
attendance fraud detection, CV↔JD matching, AI interviewing, and the policy/leave/salary chatbot.

---

## 4. How the AI works across everything (the real product)

The AI is one shared service (**AI Gateway**) that every module calls. It wears five hats:

| Hat | What the user sees | How it works |
|---|---|---|
| **Assistant / chat** | An AI Prompt Box in every module | RAG: retrieves the tenant's relevant records + policy docs, then answers/acts |
| **Ask-your-data (NL→SQL)** | "Who was late 3+ times this month?" → instant answer | Converts language to SQL **over read-only, tenant-scoped curated views** (never raw tables), validates + tenant-filters before running — the key safety design |
| **Summarizer** | Call/chat auto-summaries in the timeline | Whisper transcribes audio → LLM extracts summary + next action |
| **Scorer / classifier** | Lead score, resign risk, fraud flags | Cheap fast model + features from the data |
| **Forecaster** | Restock alerts, 60-day seasonal PO drafts | Python service runs Prophet/ARIMA on historical series |

**Proactive, not passive.** The AI doesn't wait to be asked. Background workers continuously scan
for conditions — low stock, a cold hot-lead, a resign-risk employee, suspicious cashier behavior —
and push alerts + one-click actions to the right person.

**Safety & cost.** Every AI call is tenant-scoped, token-budgeted, model-routed (cheap model for
classification, strong model for reasoning), cached, defended against prompt-injection, and logged.
This is what keeps the "AI everywhere" promise from becoming a security hole or a cost sink.

---

## 5. How the three apps connect (the payoff)

Because they share one platform, data flows *between* apps when a tenant runs more than one:
- A CRM deal marked "Won" for a retail tenant → the sold items decrement **POS inventory** →
  feeds the **restocking forecaster**.
- HRMS **attendance/shifts** feed which sales agents are available for CRM lead routing.
- One AI consultant, one login, one industry vocabulary, one billing relationship across all of it.

That integrated whole — a single AI-run "operating system" for a business, localized to its
industry — is the thing you're selling. No competitor in the SMB space ties CRM + POS + HRMS + a
proactive AI consultant together under one roof with per-industry re-skinning. That's the moat.
