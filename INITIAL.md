# INITIAL.md - ReviewLens Product Definition

> Turn hundreds of raw customer reviews into tagged, prioritised insights and a weekly report a manager can act on in five minutes.

Source brief: `SocialEagle_UseCase_Definitions.pdf` (Track 01 Gen AI | LangChain). The brief's Streamlit UI is replaced by a full-stack React + FastAPI app.

---

## PRODUCT

### Name
ReviewLens: Customer Feedback Analyzer

### Description
A restaurant chain or online store receives 200-500 reviews every week from Google, Zomato, Swiggy and Amazon, in English, Tamil and Tanglish. Today a manager reads them by hand, urgent complaints (food poisoning, wrong order, rude staff) get missed for days, and nobody can say with numbers what customers complain about most.

ReviewLens lets a user upload a weekly CSV of reviews per business. A LangChain chain (OpenAI, structured output) tags every review with sentiment, category, urgency, language, a one-line English summary and a polite suggested reply. Counts are computed in pandas, never guessed by the LLM. A second chain writes a weekly insights report (top complaints, top praises, 3 action items). A dashboard shows the sentiment split, category chart, HIGH urgency reviews and week-over-week trends, and the enriched table exports as an Excel-friendly CSV.

### Target User
Operations managers, customer support teams and business owners of restaurant chains / online stores.

### Type
- [x] SaaS (Software as a Service)

---

## TECH STACK

### Backend
- [x] FastAPI + Python 3.11+
- [x] LangChain (`langchain-core`, `langchain-openai`): ChatPromptTemplate, LCEL `|` chains, `with_structured_output()` with Pydantic, `chain.batch(..., config={"max_concurrency": N})`
- [x] pandas for CSV validation and all aggregation
- [x] FastAPI `BackgroundTasks` for analysis jobs; progress persisted in PostgreSQL

### Frontend
- [x] React + Vite + TypeScript (strict)
- [x] TanStack Query (server state + polling), TanStack Table (reviews grid), Recharts (charts), react-dropzone (upload)

### Database
- [x] PostgreSQL 16 + pgvector (Docker image `pgvector/pgvector:pg16`) + SQLAlchemy 2.0 + Alembic (driver: psycopg 3)

### Authentication
- [x] Email/Password + Google OAuth (JWT access + refresh tokens)

### UI Framework
- [x] Tailwind CSS + shadcn/ui + Framer Motion

### LLM
- [x] RAG: `OpenAIEmbeddings` (`text-embedding-3-small`) + `langchain_postgres.PGVector` retriever
- [x] OpenAI via `langchain-openai` (model name from `OPENAI_MODEL` env var; chain must stay model-agnostic so the provider can be swapped)

### Payments
- [ ] None

---

## MODULES

### Module 1: Authentication (Required)

**Description:** User authentication and authorization.

**Models:**
- User: id, email, hashed_password (nullable for OAuth users), full_name, is_active, is_verified, oauth_provider, created_at, updated_at
- RefreshToken: id, user_id, token, expires_at, revoked

**API Endpoints:**
- POST /api/v1/auth/register - Create new account
- POST /api/v1/auth/login - Login with email/password
- POST /api/v1/auth/refresh - Refresh access token
- POST /api/v1/auth/logout - Revoke refresh token
- GET /api/v1/auth/me - Get current user profile
- PUT /api/v1/auth/me - Update profile
- GET /api/v1/auth/google - Start Google OAuth (with state param)
- GET /api/v1/auth/google/callback - Google OAuth callback

**Frontend Pages:**
- /login, /register, /forgot-password, /profile (protected)

---

### Module 2: Businesses

**Description:** A user manages one or more businesses/outlets. Every upload, review and report belongs to a business.

**Models:**
- Business: id, user_id (FK), name, business_type (restaurant | online_store | other), created_at, updated_at

**API Endpoints:**
- GET /api/v1/businesses - List my businesses
- POST /api/v1/businesses - Create
- GET /api/v1/businesses/{id} - Get one
- PUT /api/v1/businesses/{id} - Update
- DELETE /api/v1/businesses/{id} - Delete (cascades uploads, reviews, reports)

**Frontend Pages:**
- /businesses - List + create
- Business switcher in the app header (current business stored in context)

---

### Module 3: Uploads & Analysis (MVP priority #1)

**Description:** Upload a weekly CSV, validate it, then analyse every review in a background job with live progress.

**Flow:**
1. **Upload:** user drops a CSV (columns: `review_id, date, platform, rating, review_text`).
2. **Validate (pandas):** check required columns (reject with a clear 400 if missing), drop rows with empty `review_text`, parse dates, coerce rating to 1-5, skip `review_id`s already analysed for this business (duplicates). Record counts.
3. **Classify (background job):** per-review LangChain chain with `with_structured_output(ReviewAnalysis)`, run via `chain.batch()` in chunks with `max_concurrency`. Progress (`processed_count`) is written to the DB after each chunk.
4. **Retry rule:** if the LLM returns an invalid value (e.g. category not in the allowed list) or errors, retry that review automatically (up to 2 retries); if it still fails, save it with `analysis_status = needs_review`.
5. **Complete:** mark upload `completed` (or `failed` with `error_message`).

**Structured output (Pydantic) - allowed values are strict enums:**
- sentiment: positive | neutral | negative
- category: food_quality | delivery | price | staff | packaging | app
- urgency: low | medium | high (high = reply today: health, refund, abuse, wrong order)
- language: English | Tamil | Tanglish
- summary: one English sentence (even for Tamil/Tanglish reviews)
- suggested_reply: polite, ready-to-post response (English)

**Models:**
- Upload: id, business_id (FK), filename, status (pending | processing | completed | failed), total_rows, valid_rows, dropped_rows, duplicates_skipped, processed_count, needs_review_count, error_message, created_at, completed_at
- Review: id, business_id (FK), upload_id (FK), review_id (str, from CSV), review_date, platform, rating, review_text, sentiment, category, urgency, language, summary, suggested_reply, analysis_status (ok | needs_review), is_edited, edited_at, created_at
  - Unique constraint: (business_id, review_id)

**API Endpoints:**
- POST /api/v1/businesses/{business_id}/uploads - Upload CSV (multipart), validates, starts background job, returns 202 + upload
- GET /api/v1/businesses/{business_id}/uploads - List uploads
- GET /api/v1/uploads/{id} - Upload status + progress (polled by UI)

**Frontend Pages:**
- /upload - Drag-and-drop CSV, show validation summary (valid / dropped / duplicates), animated progress bar (e.g. 120/248), link to results when done
- /uploads - Upload history with status badges

---

### Module 4: Reviews

**Description:** Browse, filter and correct analysed reviews; export the enriched table.

**API Endpoints:**
- GET /api/v1/businesses/{business_id}/reviews - Paginated list; filters: sentiment, category, urgency, platform, language, analysis_status, date_from, date_to, upload_id, search
- GET /api/v1/reviews/{id} - Get one
- PATCH /api/v1/reviews/{id} - Edit AI tags (sentiment, category, urgency, language, summary); sets is_edited, and analysis_status = ok when all fields valid
- GET /api/v1/businesses/{business_id}/reviews/export.csv - Enriched CSV (same filters), UTF-8 with BOM so Tamil text opens correctly in Excel

**Frontend Pages:**
- /reviews - TanStack Table grid with filter bar, one-click "HIGH urgency only" toggle, "Needs review" filter, coloured badges, detail drawer showing original text, summary, suggested reply (copy button) and an edit form for tags; Export CSV button

---

### Module 5: Dashboard & Trends

**Description:** At-a-glance view of the selected week, compared with the previous week. All numbers computed in pandas/SQL.

**Week definition:** Monday-Sunday range based on the review `date` column (not upload date). Trends compare against the previous week's reviews for the same business.

**API Endpoints:**
- GET /api/v1/businesses/{business_id}/stats?week_start=YYYY-MM-DD - Totals, sentiment split (count + %), category counts, urgency counts, platform breakdown, average rating, needs_review count, and deltas vs previous week
- GET /api/v1/businesses/{business_id}/weeks - Weeks that have reviews (for the week picker)

**Frontend Pages:**
- /dashboard - Week picker; KPI cards (total reviews, % positive / neutral / negative, urgent count, avg rating) with up/down trend arrows vs last week; sentiment donut; category bar chart; platform breakdown; list of HIGH urgency reviews
- /settings - User settings

---

### Module 6: Weekly Insights Report

**Description:** Reduce step: a second LangChain chain reads the pandas-computed stats plus representative review summaries (grouped by category/sentiment so it fits in one prompt) and writes the narrative. Numbers in the report come from pandas, never from the LLM.

**Models:**
- WeeklyReport: id, business_id (FK), week_start, week_end, stats (JSON - pandas computed), top_complaints (JSON: [{title, count, note}]), top_praises (JSON: [{title, mentions}]), action_items (JSON: list of 3 strings), urgent_count, generated_at
  - Unique constraint: (business_id, week_start)

**API Endpoints:**
- POST /api/v1/businesses/{business_id}/reports - Generate/regenerate report for a week
- GET /api/v1/businesses/{business_id}/reports - List reports
- GET /api/v1/reports/{id} - Get report

**Frontend Pages:**
- /reports - Report list
- /reports/:id - Report view: header (date range, total, sentiment %), TOP 3 COMPLAINTS with counts, TOP PRAISE, "URGENT: N reviews need a reply within 24 hours" (links to filtered table), 3 ACTION ITEMS; print-friendly layout

---

### Module 7: Ask Your Reviews (LangChain RAG)

**Description:** A chat page where the manager asks questions in plain English (e.g. "Why are Swiggy customers angry this week?", "What do people say about our biryani?"). A LangChain RAG chain retrieves the most relevant reviews for the selected business (optionally filtered by week, sentiment, category, platform) and answers using only those reviews, citing review IDs.

**How it works:**
1. **Index:** after a review is classified, it is embedded (OpenAI `text-embedding-3-small` via `OpenAIEmbeddings`) and stored in **pgvector** through `langchain_postgres.PGVector`. Document text = review text + English summary; metadata = business_id, review pk, review_id, review_date, platform, rating, sentiment, category, urgency, language. Edited reviews are re-indexed; deleted businesses remove their vectors.
2. **Retrieve:** the vector store retriever runs a similarity search (k = 8) with a metadata filter that always includes `business_id` (tenant isolation), plus optional filters.
3. **Generate:** LCEL chain `{context: retriever | format_docs, question} | prompt | llm | StrOutputParser`. The prompt says to answer only from the retrieved reviews, cite `[R-1042]` style IDs, say so when the reviews don't contain the answer, and never invent counts (point to the dashboard for numbers).
4. **Follow-ups:** the last few chat turns are sent with the question so follow-up questions work. Chat history lives in the browser only (not stored).

**API Endpoints:**
- POST /api/v1/businesses/{business_id}/ask - Body `{question, history?, week_start?, sentiment?, category?, platform?}` → `{answer, sources: [{id, review_id, review_date, platform, rating, sentiment, category, urgency, summary, snippet}]}`
- POST /api/v1/businesses/{business_id}/reindex - Rebuild embeddings for all analysed reviews of a business

**Frontend Pages:**
- /ask - Chat UI (message bubbles, Framer Motion), suggested starter questions, filter chips (week, sentiment, category, platform), each answer shows clickable source review cards that open the review detail sheet

---

## MVP SCOPE

### Must Have (MVP) - build in this order
- [x] User registration and login (email/password + Google)
- [x] Businesses CRUD + switcher
- [x] **Upload CSV + validation + background analysis with live progress** (top priority)
- [x] Reviews table with HIGH urgency filter, needs-review filter, edit AI tags, CSV export
- [x] Dashboard (sentiment split, category chart, urgency) with week-over-week trend arrows
- [x] Weekly insights report
- [x] Ask-your-reviews RAG chat (LangChain + pgvector)

### Nice to Have (Post-MVP)
- [ ] Suggested replies in the same language as the review (Tamil/Tanglish)
- [ ] Email the weekly report automatically every Monday
- [ ] PDF export of the weekly report
- [ ] Reply-status tracking (pending / replied / ignored)
- [ ] Team members per business
- [ ] Admin panel

---

## ACCEPTANCE CRITERIA

### Authentication
- [ ] User can register and login with email/password
- [ ] User can sign in with Google OAuth (state parameter verified)
- [ ] JWT tokens work correctly with refresh
- [ ] Protected routes redirect to login
- [ ] A user can never read or modify another user's businesses, uploads, reviews or reports (404)

### Uploads & Analysis
- [ ] Processes a 200+ row CSV without crashing or timing out (upload request returns 202 immediately)
- [ ] Missing required columns returns a clear 400 listing the missing columns
- [ ] Empty rows are dropped and duplicates skipped, with counts shown in the UI
- [ ] Progress bar updates live while the job runs
- [ ] Every review has all 6 fields and every value is from the allowed list, or is marked `needs_review` after automatic retries
- [ ] Tamil and Tanglish reviews get a correct English summary

### Reviews
- [ ] HIGH urgency filter works
- [ ] Editing tags persists and clears `needs_review` when valid
- [ ] Enriched CSV opens correctly in Excel (including Tamil characters)

### Dashboard & Report
- [ ] Report and dashboard numbers (counts, percentages) exactly match the reviews table because they are calculated in pandas/SQL, not by the LLM
- [ ] Trend arrows correctly compare with the previous week
- [ ] Weekly report shows top 3 complaints, top praises, urgent count and exactly 3 action items

### Ask (RAG)
- [ ] Analysed reviews are embedded into pgvector automatically after classification
- [ ] Answers cite review IDs that exist and belong to the selected business (never another business's reviews)
- [ ] Filters (week, sentiment, category, platform) narrow retrieval
- [ ] When no relevant reviews exist, the answer says so instead of making things up

### Quality
- [ ] All API endpoints documented in OpenAPI
- [ ] Backend test coverage 80%+ (LLM calls mocked in tests)
- [ ] Frontend TypeScript strict mode passes, no `any`
- [ ] Docker builds and runs successfully
- [ ] OpenAI API key loaded from `.env`, never hard-coded

---

## SPECIAL REQUIREMENTS

### Security
- [x] Rate limiting on auth endpoints
- [x] Input validation on all endpoints (Pydantic); CSV size limit (e.g. 5 MB / 5,000 rows)
- [x] SQL injection prevention (ORM only)
- [x] XSS prevention (review text rendered as plain text, never as HTML)
- [x] CSRF protection for OAuth (state parameter)
- [x] Ownership checks on every business-scoped resource

### Integrations
- [x] OpenAI API (via LangChain)
- [x] Google OAuth
- [ ] Email service (post-MVP: Monday report)
- [ ] Stripe / payments

### Sample Data
- Provide `backend/tests/fixtures/reviews_week40.csv` (200+ rows, mixed English / Tamil / Tanglish, Google / Zomato / Swiggy / Amazon) for tests and demos.

---

## AGENTS

> These 6 agents will build your product in parallel:

| Agent | Role | Works On |
|-------|------|----------|
| DATABASE-AGENT | Creates all models and migrations | User, RefreshToken, Business, Upload, Review, WeeklyReport |
| BACKEND-AGENT | Builds API endpoints, services and LangChain chains | All modules' backends |
| FRONTEND-AGENT | Creates UI pages and components | All modules' frontends |
| DEVOPS-AGENT | Sets up Docker, CI/CD, environments | Infrastructure |
| TEST-AGENT | Writes unit and integration tests | All code |
| REVIEW-AGENT | Security and code quality audit | All code |

---

# READY?

```bash
/generate-prp INITIAL.md
```

Then:

```bash
/execute-prp PRPs/reviewlens-prp.md
```
