# PRP: ReviewLens: Customer Feedback Analyzer

> Implementation blueprint for parallel agent execution

---

## METADATA

| Field | Value |
|-------|-------|
| **Product** | ReviewLens: Customer Feedback Analyzer |
| **Type** | SaaS |
| **Version** | 1.0 |
| **Created** | 2026-11-16 |
| **Complexity** | Medium-High (full-stack + LLM pipeline + background jobs) |
| **Source** | INITIAL.md, SocialEagle_UseCase_Definitions.pdf (Track 01) |

---

## PRODUCT OVERVIEW

**Description:** Users upload a weekly CSV of customer reviews (English, Tamil, Tanglish) for one of their businesses. A LangChain + OpenAI pipeline tags every review with sentiment, category, urgency, language, a one-line English summary and a polite suggested reply. A dashboard shows the sentiment split, category chart, urgent reviews and week-over-week trends. A second chain writes a weekly insights report. The enriched table exports as an Excel-friendly CSV.

**Value Proposition:** A manager stops reading 250 reviews by hand. Urgent complaints (food poisoning, wrong order, rude staff) surface the same day, and "what do customers complain about most" is answered with exact numbers plus 3 concrete action items, in a 5-minute read.

**MVP Scope (build order):**
- [ ] Auth: email/password + Google OAuth
- [ ] Businesses CRUD + header switcher
- [ ] **Upload CSV → validate → background analysis with live progress** (top priority)
- [ ] Reviews table: HIGH urgency filter, needs-review filter, edit AI tags, CSV export
- [ ] Dashboard with week-over-week trend arrows
- [ ] Weekly insights report
- [ ] Ask-your-reviews RAG chat

**Out of scope for v1:** replies in the review's language, Monday email report, PDF export, reply-status tracking, teams, admin panel, payments. Because there is no email service in v1, `/forgot-password` is a static page saying password reset by email is coming soon. No reset endpoint is built.

---

## TECH STACK

| Layer | Technology | Skill Reference |
|-------|------------|-----------------|
| Backend | FastAPI + Python 3.11+ | skills/BACKEND.md |
| LLM | LangChain (`langchain-core`, `langchain-openai`) + OpenAI | this PRP §LLM PIPELINE |
| Data | pandas | this PRP §LLM PIPELINE |
| Frontend | React 18 + TypeScript (strict) + Vite | skills/FRONTEND.md |
| State / data | TanStack Query, TanStack Table, React Router, react-hook-form + zod | skills/FRONTEND.md |
| Charts | Recharts | — |
| Database | PostgreSQL 16 + pgvector (`pgvector/pgvector:pg16`, host port 5433) + SQLAlchemy 2.0 + Alembic, psycopg 3 | skills/DATABASE.md |
| RAG | `OpenAIEmbeddings` + `langchain_postgres.PGVector` retriever + LCEL answer chain | this PRP §Module 7 |
| Auth | JWT (python-jose) + bcrypt (passlib) + Google OAuth (authlib) | skills/BACKEND.md |
| UI | Tailwind CSS + shadcn/ui + Framer Motion + lucide-react | skills/FRONTEND.md (adapt Chakra examples to shadcn) |
| Rate limiting | slowapi | skills/BACKEND.md |
| Testing | pytest + pytest-cov + httpx, Vitest + React Testing Library | skills/TESTING.md |
| Deployment | Docker + docker-compose + GitHub Actions | skills/DEPLOYMENT.md |

---

## DATABASE MODELS

All tables have `id` (int PK), `created_at`; mutable ones also `updated_at`. Enums are Python `str` Enums stored as `sqlalchemy.Enum(..., native_enum=False)` (VARCHAR + CHECK) so migrations stay simple.

### User
- id, email (unique, indexed), hashed_password (nullable for OAuth-only), full_name, is_active (default true), is_verified (default false), oauth_provider (nullable: "google"), created_at, updated_at
- Relationships: businesses (1:N, cascade delete), refresh_tokens (1:N)

### RefreshToken
- id, user_id (FK → users, cascade), token (unique, indexed), expires_at, revoked (default false), created_at

### Business
- id, user_id (FK → users, indexed), name (max 120), business_type (enum: restaurant | online_store | other), created_at, updated_at
- Relationships: uploads, reviews, reports (all cascade delete)

### Upload
- id, business_id (FK, indexed), filename, status (enum: pending | processing | completed | failed)
- total_rows, valid_rows, dropped_rows, duplicates_skipped, processed_count, needs_review_count (ints, default 0)
- error_message (text, nullable), created_at, completed_at (nullable)

### Review
- id, business_id (FK, indexed), upload_id (FK, indexed)
- review_id (str, from CSV), review_date (date, indexed), platform (str, max 50), rating (smallint 1-5, nullable), review_text (text)
- sentiment (enum: positive | neutral | negative, nullable)
- category (enum: food_quality | delivery | price | staff | packaging | app, nullable)
- urgency (enum: low | medium | high, nullable)
- language (enum: English | Tamil | Tanglish, nullable)
- summary (text, nullable), suggested_reply (text, nullable)
- analysis_status (enum: pending | ok | needs_review, default pending)
- is_edited (bool, default false), edited_at (nullable), created_at
- Constraints: `UniqueConstraint(business_id, review_id)`; composite index `(business_id, review_date)`; index `(business_id, urgency)`

### WeeklyReport
- id, business_id (FK, indexed), week_start (date, Monday), week_end (date, Sunday)
- stats (JSONB: the pandas-computed WeekStats, see §LLM PIPELINE)
- top_complaints (JSONB: `[{title, count, note}]`), top_praises (JSONB: `[{title, mentions}]`), action_items (JSONB: `list[str]`, exactly 3)
- urgent_count (int), generated_at
- Constraint: `UniqueConstraint(business_id, week_start)`

---

## LLM PIPELINE

All LangChain code lives in `backend/app/llm/`. `ChatOpenAI` is only instantiated in `llm/client.py::get_chat_model()` (reads `OPENAI_API_KEY`, `OPENAI_MODEL`, `temperature=0`, `timeout=60`, `max_retries=2`), so the provider can be swapped in one place.

### 1. Classify (map)
```python
class ReviewAnalysis(BaseModel):
    sentiment: Literal["positive", "neutral", "negative"]
    category: Literal["food_quality", "delivery", "price", "staff", "packaging", "app"]
    urgency: Literal["low", "medium", "high"]
    language: Literal["English", "Tamil", "Tanglish"]
    summary: str = Field(description="Exactly one English sentence, even if the review is Tamil/Tanglish")
    suggested_reply: str = Field(description="Polite, ready-to-post reply in English, 1-3 sentences")

classify_chain = classify_prompt | get_chat_model().with_structured_output(ReviewAnalysis)
```
- Prompt includes: the allowed values with one-line definitions; urgency rules (high = health/food safety, refund demand, abuse/rude staff, wrong order; medium = clear complaint needing follow-up; low = praise or minor note); Tanglish definition (Tamil written in Latin script) with 2 few-shot examples (one Tanglish such as "Saapadu nalla irundhuchu but bill la extra charge pottanga", one Tamil script); inputs `platform`, `rating`, `review_text`.
- **Batching:** `analysis_service.run_analysis(upload_id)` processes pending reviews in chunks of `LLM_BATCH_SIZE` (25) via `classify_chain.batch(inputs, config={"max_concurrency": LLM_MAX_CONCURRENCY}, return_exceptions=True)`. After each chunk: persist results, update `upload.processed_count`, commit.
- **Retry rule:** any exception/ValidationError result → retry that single review up to 2 more times (`classify_chain.invoke`). Still failing → `analysis_status = needs_review`, fields left null, `upload.needs_review_count += 1`. One review never fails the upload.
- **Job:** started via FastAPI `BackgroundTasks`; opens its own `SessionLocal()`; wraps everything in try/except → on fatal error `status=failed`, `error_message` set, logged with `logging.exception`. On startup, uploads stuck in `processing` are marked `failed` ("Server restarted, please re-upload").

### 2. Aggregate (pandas, no LLM)
`stats_service.compute_week_stats(db, business_id, week_start) -> WeekStats`:
- Load the week's reviews (Mon-Sun on `review_date`) into a DataFrame, selecting only the needed columns.
- total, sentiment counts + percentages (1 decimal, computed over analysed reviews), category counts, urgency counts, platform counts, avg rating, needs_review count, urgent_count (= high urgency).
- Category × sentiment negative counts (used for "top complaints"), positive counts by category (for praise).
- Previous week's stats computed the same way → `deltas` (total, % negative, % positive, urgent_count, avg_rating) for trend arrows. `null` if previous week has no data.

### 3. Report (reduce)
```python
class WeeklyInsights(BaseModel):
    top_complaints: list[ComplaintItem] = Field(max_length=3)  # title, category, note
    top_praises: list[PraiseItem] = Field(max_length=3)        # title, category
    action_items: list[str] = Field(min_length=3, max_length=3)
```
- Input to `report_chain`: the WeekStats JSON plus up to 15 negative and 10 positive summaries per category, sampled with high urgency first. This stays well within one prompt for 500 reviews.
- The LLM writes titles, notes and action items only. **Counts are attached afterwards in Python** from WeekStats (complaint count = negative count of that category; praise mentions = positive count of that category), so report numbers always match the table.
- Prompt instructs: action items must be concrete and operational (who/what/when), and one must reference replying to the urgent reviews.

---

## MODULES

All API routes are prefixed with `/api/v1`. Every business-scoped route uses a `get_owned_business(business_id, current_user, db)` dependency that returns 404 if the business is missing or not owned. Routes keyed by `/uploads/{id}`, `/reviews/{id}` and `/reports/{id}` check ownership by joining through Business.

### Module 1: Authentication
**Agents:** DATABASE-AGENT + BACKEND-AGENT + FRONTEND-AGENT

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/register | Create account (bcrypt), returns tokens. Rate limit 5/min |
| POST | /auth/login | Email/password → `{access_token, refresh_token, token_type}`. Rate limit 5/min |
| POST | /auth/refresh | Rotate refresh token |
| POST | /auth/logout | Revoke refresh token |
| GET | /auth/me | Current user |
| PUT | /auth/me | Update full_name / password |
| GET | /auth/google | Redirect to Google, with `state` stored in a signed, httpOnly cookie |
| GET | /auth/google/callback | Verify state, upsert user, redirect to `FRONTEND_URL/auth/callback#access_token=...&refresh_token=...` |

| Route | Page | Components |
|-------|------|------------|
| /login | LoginPage | AuthCard, LoginForm, GoogleButton |
| /register | RegisterPage | AuthCard, RegisterForm, GoogleButton |
| /forgot-password | ForgotPasswordPage | AuthCard (static "coming soon" notice) |
| /auth/callback | OAuthCallbackPage | reads tokens from hash → AuthContext → /dashboard |
| /profile | ProfilePage (protected) | ProfileForm, ChangePasswordForm |

Token storage: access token in memory + refresh token in localStorage. An axios interceptor refreshes once on 401, then logs out.

---

### Module 2: Businesses
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /businesses | List my businesses |
| POST | /businesses | Create (201) |
| GET | /businesses/{id} | Get one |
| PUT | /businesses/{id} | Update |
| DELETE | /businesses/{id} | Delete + cascade (204) |

| Route | Page | Components |
|-------|------|------------|
| /businesses | BusinessesPage | BusinessCard grid, BusinessFormDialog, DeleteConfirmDialog |
| (layout) | AppShell header | BusinessSwitcher (shadcn Select), stored in BusinessContext + localStorage |

First login with no businesses → redirect to /businesses with a "Create your first business" empty state.

---

### Module 3: Uploads & Analysis (MVP #1)
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /businesses/{business_id}/uploads | multipart `file` → validate → 202 `UploadOut` + start job |
| GET | /businesses/{business_id}/uploads | List uploads (newest first) |
| GET | /uploads/{id} | Status + progress (polled every 1.5s while pending/processing) |

**`csv_service.parse_and_validate(file_bytes, business_id, db)`**
- Reject non-`.csv` / over `MAX_UPLOAD_MB` → 413; decode `utf-8-sig`, fall back to `latin-1`; `pd.read_csv(dtype=str)`.
- Normalize headers (strip, lowercase). Missing any of `review_id, date, platform, rating, review_text` → 400 `{"detail": "Missing required columns: ..."}`.
- Drop rows with blank `review_text` or `review_id`; drop in-file duplicate review_ids (keep first); parse `date` (`pd.to_datetime(errors="coerce")`, drop unparseable); rating → int 1-5 or null.
- Remove review_ids already in DB for this business → `duplicates_skipped`.
- 0 valid rows → 400 "No valid reviews to analyse".
- Insert Upload + Review rows (`analysis_status=pending`) in one transaction, then enqueue the job.

`UploadOut`: id, filename, status, total_rows, valid_rows, dropped_rows, duplicates_skipped, processed_count, needs_review_count, error_message, created_at, completed_at, `progress_pct` (computed).

| Route | Page | Components |
|-------|------|------------|
| /upload | UploadPage | CsvDropzone (react-dropzone), CsvFormatHint (expected columns + sample download), ValidationSummary, AnalysisProgress (animated bar "120 / 248 analysed", Framer Motion), success CTA → /reviews?upload_id= & /dashboard |
| /uploads | UploadsPage | UploadsTable with StatusBadge, progress for running uploads |

Also serve `frontend/public/sample-reviews.csv` (about 20 rows of mixed languages) for the "download sample" link.

---

### Module 4: Reviews
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /businesses/{business_id}/reviews | Paginated `{items, total, page, page_size}`; filters: sentiment, category, urgency, platform, language, analysis_status, date_from, date_to, upload_id, search (ILIKE on text/summary); sort by review_date/urgency |
| GET | /reviews/{id} | Get one |
| PATCH | /reviews/{id} | Edit sentiment/category/urgency/language/summary/suggested_reply; sets is_edited, edited_at; analysis_status=ok if all 6 fields non-null |
| GET | /businesses/{business_id}/reviews/export.csv | Same filters, `StreamingResponse`, `utf-8-sig`, `Content-Disposition: attachment; filename=reviewlens_<business>_<date>.csv`; columns: review_id, date, platform, rating, review_text, sentiment, category, urgency, language, summary, suggested_reply, analysis_status |

| Route | Page | Components |
|-------|------|------------|
| /reviews | ReviewsPage | FilterBar (selects + search + date range, synced to URL params), "HIGH urgency only" toggle, "Needs review" toggle, ReviewsTable (TanStack Table, server pagination, Sentiment/Category/Urgency badges), ReviewDetailSheet (original text, summary, suggested reply with copy button, EditTagsForm), ExportCsvButton |

---

### Module 5: Dashboard & Trends
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /businesses/{business_id}/weeks | `[{week_start, week_end, review_count}]` newest first |
| GET | /businesses/{business_id}/stats?week_start= | WeekStats + deltas vs previous week (defaults to latest week) |

| Route | Page | Components |
|-------|------|------------|
| /dashboard | DashboardPage | WeekPicker, KpiCard ×5 (total, % positive, % negative, urgent, avg rating) with TrendArrow (green/red, the "good" direction depends on the metric), SentimentDonut, CategoryBarChart (stacked by sentiment), PlatformBreakdown, UrgentReviewsList (top 10 high urgency, link to filtered /reviews), EmptyState → /upload |
| /settings | SettingsPage | Account settings, theme toggle (light/dark) |

---

### Module 6: Weekly Insights Report
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /businesses/{business_id}/reports | Body `{week_start}` → compute stats + run report_chain synchronously (one LLM call) → upsert → 201 |
| GET | /businesses/{business_id}/reports | List |
| GET | /reports/{id} | Get one |

| Route | Page | Components |
|-------|------|------------|
| /reports | ReportsPage | ReportList, GenerateReportDialog (WeekPicker) |
| /reports/:id | ReportPage | ReportHeader (date range, total, sentiment %), TopComplaints (numbered with counts and notes), TopPraise, UrgentBanner ("URGENT: N reviews need a reply within 24 hours" → /reviews?urgency=high&week=), ActionItems, Regenerate button, print styles (`print:` Tailwind variants) |

---

### Module 7: Ask Your Reviews (LangChain RAG)
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**`app/llm/rag.py`**
- `get_vector_store() -> VectorStore`: `PGVector(embeddings=get_embeddings(), collection_name="review_embeddings", connection=settings.sqlalchemy_url, use_jsonb=True)`, cached. Tests override it with `InMemoryVectorStore(DeterministicFakeEmbedding(size=64))`.
- `review_to_document(review) -> Document`: page_content = `"[{review_id}] ({platform}, {rating}★, {date}) {review_text}
Summary: {summary}"`; metadata = business_id, review_pk, review_id, review_date (ISO string), platform, rating, sentiment, category, urgency, language.
- `index_reviews(reviews)`: `add_documents(docs, ids=[str(r.id)])` (upsert). Called at the end of each analysed chunk in the analysis job (failures are logged and never fail the upload), and after PATCH /reviews/{id}.
- `delete_business_vectors(review_pks)`: called before business delete.
- `build_filter(business_id, week_start, sentiment, category, platform)`: always includes `business_id`; the week becomes `review_date $gte/$lte` ISO strings.
- `ask_chain`: retrieves the top `RAG_TOP_K` docs with the filter → `format_docs` → `ASK_PROMPT` (system: answer only from the reviews, cite `[review_id]`, say "I couldn't find reviews about that" if irrelevant, no counts or percentages, answer in English) + last 6 history turns → LLM → `StrOutputParser`. Returns `(answer, docs)`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /businesses/{business_id}/ask | `{question (1-500 chars), history?: [{role, content}] (max 6), week_start?, sentiment?, category?, platform?}` → `{answer, sources: [ReviewSource]}`. Rate limit 20/min |
| POST | /businesses/{business_id}/reindex | Re-embed all analysed reviews (202, background) |

| Route | Page | Components |
|-------|------|------------|
| /ask | AskPage | ChatThread (animated MessageBubble), StarterQuestions, AskFilters (chips), SourceReviewCard list per answer (opens ReviewDetailSheet), ChatInput |

---

## PHASE EXECUTION PLAN

**Phase 1: Foundation (4 agents in parallel)**
- DATABASE-AGENT: `database.py` (engine, SessionLocal, Base, get_db), all 6 models + enums, Alembic setup + initial migration.
- BACKEND-AGENT: `main.py` (CORS from `FRONTEND_URL`, `/health`, routers registered, logging config, startup stale-job cleanup), `config.py` (pydantic-settings, all env vars), `auth/` (security utils, `get_current_user`), `llm/` package (client, schemas, prompts, chains), `requirements.txt`.
- FRONTEND-AGENT: Vite + TS strict, Tailwind + shadcn/ui init (button, card, input, select, dialog, sheet, table, badge, progress, toast, tabs, dropdown-menu, skeleton), React Router, TanStack Query provider, axios `api` client with interceptors, `types/` (all API interfaces from this PRP), AppShell (sidebar: Dashboard, Upload, Reviews, Reports, Businesses), ProtectedRoute, AuthContext, BusinessContext.
- DEVOPS-AGENT: `backend/Dockerfile`, `frontend/Dockerfile` (multi-stage → nginx), `docker-compose.yml` (pgvector/pgvector:pg16 on host port 5433 + healthcheck, backend runs `alembic upgrade head` then uvicorn, frontend), `.env.example`, `.gitignore`, `.github/workflows/ci.yml` (ruff, pytest with Postgres service, npm lint + type-check + test + build).

**Validation Gate 1:** `pip install -r backend/requirements.txt`, `alembic upgrade head`, `npm install`, `docker-compose config`

**Phase 2: Modules (backend + frontend in parallel per module, in MVP order)**
1. Auth: endpoints + Login/Register/OAuth callback/Profile pages
2. Businesses: CRUD + switcher
3. Uploads & Analysis: csv_service, analysis_service, routes + Upload/Uploads pages
4. Reviews: list/patch/export + Reviews page
5. Dashboard: stats_service + Dashboard page
6. Reports: report_service + Report pages
7. Ask (RAG): rag.py + ask router + Ask page

Frontend works against the contracts in this PRP, and `types/` must match the backend Pydantic schemas exactly; backend naming wins on conflict.

**Validation Gate 2:** `ruff check backend/`, `npm run lint`, `npm run type-check`

**Phase 3: Quality (3 agents in parallel)**
- TEST-AGENT:
  - Fixture `backend/tests/fixtures/reviews_week40.csv`: 220 rows across 2 weeks, mixed English/Tamil/Tanglish, all 4 platforms, plus some blank rows and duplicate IDs.
  - Mock LLM: a `FakeChatModel` or patching `get_chat_model` to return deterministic `ReviewAnalysis` objects, including injected invalid outputs to test the retry → needs_review path.
  - Tests: auth flows, ownership 404s, CSV validation (missing cols, blanks, dupes, oversize), analysis job end-to-end with the mock, stats exactness against direct pandas counts, trend deltas, report counts equal stats, CSV export BOM and columns, PATCH review.
  - Frontend: RTL tests for CsvDropzone, AnalysisProgress, FilterBar/HIGH toggle, KpiCard trend arrow.
- REVIEW-AGENT: security (ownership on every route, OAuth state, rate limits, no secrets, XSS-safe rendering, upload limits), CLAUDE.md compliance (no print/console.log/any/inline styles, no `SELECT *`), N+1 queries, job robustness.
- (Optional) Live smoke test: one real OpenAI run on 10 sample reviews, only if `OPENAI_API_KEY` is set. Verify Tamil/Tanglish summaries are English.

**Final Validation:** full test suite, docker build, health checks.

---

## VALIDATION GATES

| Gate | Commands |
|------|----------|
| 1 | `alembic upgrade head`, `npm install`, `docker-compose config` |
| 2 | `ruff check backend/`, `npm run lint`, `npm run type-check` |
| 3 | `pytest --cov=app --cov-fail-under=80`, `npm test` |
| Final | `docker-compose build`, `docker-compose up -d`, `curl localhost:8000/health` |

---

## ACCEPTANCE CRITERIA (from brief Done checklist + INITIAL.md)

- [ ] 200+ row CSV processes without crash or timeout (202 + background job + live progress)
- [ ] Every review has all 6 fields from the allowed lists, or is `needs_review` after automatic retries
- [ ] Tamil and Tanglish reviews get a correct one-sentence English summary
- [ ] Report and dashboard numbers exactly match the reviews table (pandas/SQL, never LLM)
- [ ] HIGH urgency filter works; enriched CSV opens correctly in Excel (Tamil intact)
- [ ] Week-over-week trend arrows are correct
- [ ] `OPENAI_API_KEY` is loaded from `.env` and never hard-coded
- [ ] Users only ever see their own businesses' data (including RAG retrieval)
- [ ] RAG answers cite only real review IDs from the selected business
- [ ] OpenAPI docs at `/docs`; backend coverage ≥ 80%; TS strict with no `any`; Docker runs

---

## ENVIRONMENT VARIABLES

```env
# Database
DATABASE_URL=postgresql://reviewlens:reviewlens@localhost:5433/reviewlens

# Auth
SECRET_KEY=your-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback
FRONTEND_URL=http://localhost:5173

# OpenAI / LangChain
OPENAI_API_KEY=sk-...
OPENAI_MODEL=your-model-name
EMBEDDING_MODEL=text-embedding-3-small
RAG_TOP_K=8
LLM_MAX_CONCURRENCY=5
LLM_BATCH_SIZE=25
MAX_UPLOAD_MB=5

# Frontend
VITE_API_URL=http://localhost:8000
```

---

## NEXT STEP

Execute with parallel agents:
/execute-prp PRPs/reviewlens-prp.md
