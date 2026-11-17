# CLAUDE.md - ReviewLens Project Rules

> Project-specific rules for Claude Code. This file is read automatically.

---

## Project Overview

**Project Name:** ReviewLens: Customer Feedback Analyzer
**Description:** Upload weekly customer-review CSVs (English, Tamil, Tanglish); a LangChain + OpenAI pipeline tags every review (sentiment, category, urgency, language, summary, suggested reply), a dashboard shows insights and week-over-week trends, and a second chain writes a weekly insights report.
**Tech Stack:**
- Backend: FastAPI + Python 3.11+, LangChain (`langchain-core`, `langchain-openai`), pandas
- Frontend: React + Vite + TypeScript (strict), TanStack Query, TanStack Table, Recharts
- Database: PostgreSQL 16 + pgvector (Docker, port 5433) + SQLAlchemy 2.0 + Alembic (psycopg 3)
- RAG: LangChain retrieval chain over review embeddings (OpenAIEmbeddings + PGVector)
- Auth: Email/Password + Google OAuth (JWT)
- UI: Tailwind CSS + shadcn/ui + Framer Motion
- Background jobs: FastAPI `BackgroundTasks`, progress stored in Postgres

---

## Project Structure

```
reviewlens/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/
│   │   │   ├── user.py          # User, RefreshToken
│   │   │   ├── business.py
│   │   │   ├── upload.py
│   │   │   ├── review.py
│   │   │   └── report.py        # WeeklyReport
│   │   ├── schemas/
│   │   ├── routers/             # auth, businesses, uploads, reviews, stats, reports
│   │   ├── services/
│   │   │   ├── csv_service.py       # pandas validation + dedupe
│   │   │   ├── analysis_service.py  # background job, batching, retries
│   │   │   ├── stats_service.py     # pandas/SQL aggregation + trends
│   │   │   └── report_service.py
│   │   ├── llm/
│   │   │   ├── client.py        # get_chat_model() - only place the provider is chosen
│   │   │   ├── schemas.py       # ReviewAnalysis, WeeklyInsights (Pydantic)
│   │   │   ├── prompts.py       # ChatPromptTemplates
│   │   │   ├── chains.py        # classify_chain, report_chain (LCEL)
│   │   │   └── rag.py           # vector store, indexing, ask_chain (RAG)
│   │   └── auth/
│   ├── alembic/
│   ├── tests/
│   │   └── fixtures/reviews_week40.csv
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/          # ui/ (shadcn), charts/, reviews/, upload/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── context/             # AuthContext, BusinessContext
│   │   └── types/
│   └── package.json
├── .claude/
│   └── commands/
├── skills/
├── agents/
└── PRPs/
```

---

## Code Standards

### Python (Backend)
```python
# ALWAYS use type hints
def get_review(db: Session, review_id: int) -> Review:
    pass

# ALWAYS add docstrings for public functions
def create_upload(db: Session, business_id: int, data: UploadCreate) -> Upload:
    """
    Create a new upload record.

    Args:
        db: Database session
        business_id: Owning business
        data: Upload creation data

    Returns:
        Created Upload object
    """
    pass
```

### TypeScript (Frontend)
```typescript
// ALWAYS define interfaces for props and data
type Sentiment = "positive" | "neutral" | "negative";
type Category = "food_quality" | "delivery" | "price" | "staff" | "packaging" | "app";
type Urgency = "low" | "medium" | "high";

interface Review {
  id: number;
  review_id: string;
  review_date: string;
  platform: string;
  rating: number;
  review_text: string;
  sentiment: Sentiment | null;
  category: Category | null;
  urgency: Urgency | null;
  language: "English" | "Tamil" | "Tanglish" | null;
  summary: string | null;
  suggested_reply: string | null;
  analysis_status: "ok" | "needs_review";
  is_edited: boolean;
}

// NO any types allowed
const fetchReview = async (id: number): Promise<Review> => {
  // ...
};
```

---

## Forbidden Patterns

### Backend
- ❌ Never use `print()` - use `logging` module
- ❌ Never store passwords in plain text - use bcrypt
- ❌ Never hardcode secrets (incl. `OPENAI_API_KEY`) - use environment variables
- ❌ Never use `SELECT *` - specify columns
- ❌ Never skip input validation
- ❌ Never let the LLM compute counts or percentages - always pandas/SQL
- ❌ Never call OpenAI in tests - mock the chat model
- ❌ Never import `ChatOpenAI` outside `app/llm/client.py`

### Frontend
- ❌ Never use `any` type
- ❌ Never leave console.log in production
- ❌ Never skip error handling in async operations
- ❌ Never use inline styles - use Tailwind classes / shadcn/ui components
- ❌ Never render review text as HTML (`dangerouslySetInnerHTML`)

---

## Module-Specific Rules

### Businesses
- Every Business belongs to a user (`user_id` FK). Uploads, Reviews and WeeklyReports belong to a Business.
- Every business-scoped endpoint must verify ownership; return 404 (not 403) for other users' resources.

### Uploads & Analysis
- Required CSV columns: `review_id, date, platform, rating, review_text`. Missing columns → 400 listing them.
- Drop rows with empty `review_text`; skip `review_id`s already stored for the business (unique `(business_id, review_id)`).
- Upload status must be one of: `pending`, `processing`, `completed`, `failed`.
- POST upload returns 202 and starts a `BackgroundTasks` job; the job opens its own DB session.
- Classify with `chain.batch(inputs, config={"max_concurrency": LLM_MAX_CONCURRENCY})` in chunks; update `processed_count` after each chunk.
- Invalid LLM output or errors → retry the review up to 2 times, then save with `analysis_status = "needs_review"`. One bad review never fails the whole upload.

### LLM Output (strict enums - Pydantic + DB)
- sentiment: `positive | neutral | negative`
- category: `food_quality | delivery | price | staff | packaging | app`
- urgency: `low | medium | high` (high = health, refund, abuse, wrong order → reply today)
- language: `English | Tamil | Tanglish`
- summary: exactly one English sentence, even for Tamil/Tanglish
- suggested_reply: polite, ready to post, English

### Reviews
- Editing tags sets `is_edited = true`, `edited_at`, and `analysis_status = "ok"` when all fields are valid.
- CSV export: UTF-8 with BOM (`utf-8-sig`) so Excel shows Tamil text correctly.

### Dashboard & Reports
- A week is Monday-Sunday based on the review `date` column, not the upload date.
- Trends compare against the previous week for the same business.
- The report chain receives pandas-computed stats + grouped review summaries; it writes only narrative (complaint titles, praises, exactly 3 action items). Counts shown in the report come from stats.
- One WeeklyReport per `(business_id, week_start)`; regenerate overwrites it.

### Ask (LangChain RAG)
- Vector store: `langchain_postgres.PGVector` (pgvector in the same Postgres), collection `review_embeddings`; embeddings from `get_embeddings()` in `app/llm/client.py` (`OpenAIEmbeddings`, `EMBEDDING_MODEL`).
- Document id = `str(review.id)` so re-indexing upserts. Index after classification and after PATCH edits; delete vectors when a business is deleted.
- **Every retrieval MUST filter on `business_id`** - never retrieve across tenants.
- The answer prompt uses only retrieved reviews, cites `[review_id]`, says when the context lacks the answer, and never states counts/percentages (those come from /stats).
- Vector store is created via `get_vector_store()` only, so tests can swap in `InMemoryVectorStore` + fake embeddings.

---

## API Conventions

- All endpoints prefixed with `/api/v1/`
- Use plural nouns for resources: `/businesses`, `/uploads`, `/reviews`, `/reports`
- Return appropriate HTTP status codes:
  - 200: Success
  - 201: Created
  - 202: Accepted (upload started)
  - 400: Bad Request (e.g. invalid CSV)
  - 401: Unauthorized
  - 404: Not Found
  - 409: Conflict
  - 413: Payload Too Large (CSV over limit)

---

## Authentication

### JWT Configuration
- Access token expires: 30 minutes
- Refresh token expires: 7 days
- Algorithm: HS256

### OAuth Providers
- Google OAuth 2.0 enabled
- Always verify state parameter for CSRF protection

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://reviewlens:reviewlens@localhost:5433/reviewlens

# Auth
SECRET_KEY=your-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

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

## Development Commands

```bash
# Backend
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev

# Docker
docker-compose up -d

# Tests
pytest backend/tests -v
cd frontend && npm test

# Linting / validation
ruff check backend/ && pytest
cd frontend && npm run lint && npm run type-check
docker-compose build
```

---

## Commit Message Format

```
feat([module]): add [feature]
fix([module]): fix [bug]
refactor([module]): refactor [component]
test([module]): add tests for [feature]
docs: update [documentation]
```

Modules: `auth`, `businesses`, `uploads`, `analysis`, `reviews`, `dashboard`, `reports`, `ask`, `llm`

---

## Skills Reference

| Task | Skill to Read |
|------|---------------|
| Database models | skills/DATABASE.md |
| API + Auth | skills/BACKEND.md |
| React + UI | skills/FRONTEND.md |
| Testing | skills/TESTING.md |
| Deployment | skills/DEPLOYMENT.md |

Note: skills/FRONTEND.md may show Chakra UI examples - this project uses Tailwind + shadcn/ui instead.

---

## Agent Coordination

For complex tasks, the ORCHESTRATOR coordinates:
- DATABASE-AGENT → Backend models
- BACKEND-AGENT → API development + LangChain chains
- FRONTEND-AGENT → UI components
- TEST-AGENT → Testing
- REVIEW-AGENT → Code review
- DEVOPS-AGENT → Deployment

Read agent definitions in `/agents/` folder.
