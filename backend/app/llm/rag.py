"""LangChain RAG over customer reviews (pgvector via langchain_postgres.PGVector).

Index: each analysed review -> Document(review text + English summary, metadata) -> PGVector.
Retrieve: similarity search ALWAYS filtered by business_id (tenant isolation) + optional filters.
Generate: LCEL chain {docs, question, history} -> ASK_PROMPT -> LLM -> StrOutputParser.
"""

import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date
from operator import itemgetter
from typing import Any

from langchain_core.documents import Document
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import Runnable, RunnableLambda, RunnablePassthrough
from langchain_core.vectorstores import InMemoryVectorStore, VectorStore

from app.config import settings
from app.llm import client
from app.llm.prompts import ASK_PROMPT
from app.models import Review
from app.models.enums import AnalysisStatus

logger = logging.getLogger(__name__)

_store: VectorStore | None = None


def get_vector_store() -> VectorStore:
    """Lazily create the shared PGVector store (tests replace it via set_vector_store)."""
    global _store
    if _store is None:
        from langchain_postgres import PGVector

        _store = PGVector(
            embeddings=client.get_embeddings(),
            collection_name=settings.RAG_COLLECTION,
            connection=settings.sqlalchemy_url,
            use_jsonb=True,
        )
    return _store


def set_vector_store(store: VectorStore | None) -> None:
    """Override the vector store (used by tests)."""
    global _store
    _store = store


# ---------------------------------------------------------------- indexing


def review_to_document(review: Review) -> Document:
    """Convert an analysed review into a LangChain Document."""
    rating = f"{review.rating}/5" if review.rating is not None else "no rating"
    content = (
        f"[{review.review_id}] ({review.platform}, {rating}, {review.review_date.isoformat()}) {review.review_text}"
    )
    if review.summary:
        content += f"\nSummary: {review.summary}"
    metadata: dict[str, Any] = {
        "business_id": review.business_id,
        "review_pk": review.id,
        "review_id": review.review_id,
        "review_date": review.review_date.isoformat(),
        "platform": review.platform,
        "rating": review.rating,
        "sentiment": review.sentiment.value if review.sentiment else None,
        "category": review.category.value if review.category else None,
        "urgency": review.urgency.value if review.urgency else None,
        "language": review.language.value if review.language else None,
    }
    return Document(page_content=content, metadata=metadata)


def index_reviews(reviews: Sequence[Review]) -> int:
    """Embed and upsert analysed reviews (id = review pk). Returns number indexed."""
    docs_and_ids = [(review_to_document(r), str(r.id)) for r in reviews if r.analysis_status == AnalysisStatus.ok]
    if not docs_and_ids:
        return 0
    docs, ids = zip(*docs_and_ids, strict=True)
    get_vector_store().add_documents(list(docs), ids=list(ids))
    return len(ids)


def safe_index_reviews(reviews: Sequence[Review]) -> None:
    """Index reviews but never raise (RAG indexing must not break analysis or edits)."""
    try:
        index_reviews(reviews)
    except Exception:
        logger.exception("RAG indexing failed for %d reviews", len(reviews))


def delete_review_vectors(review_pks: Sequence[int]) -> None:
    """Remove vectors for the given review primary keys (never raises)."""
    if not review_pks:
        return
    try:
        get_vector_store().delete(ids=[str(pk) for pk in review_pks])
    except Exception:
        logger.exception("RAG vector delete failed for %d reviews", len(review_pks))


# ---------------------------------------------------------------- retrieval


@dataclass(frozen=True)
class RetrievalFilter:
    """Metadata filter for retrieval. business_id is mandatory."""

    business_id: int
    date_from: date | None = None
    date_to: date | None = None
    sentiment: str | None = None
    category: str | None = None
    platform: str | None = None

    def to_pgvector(self) -> dict[str, Any]:
        """PGVector JSONB filter syntax."""
        clauses: list[dict[str, Any]] = [{"business_id": {"$eq": self.business_id}}]
        if self.date_from and self.date_to:
            clauses.append({"review_date": {"$between": [self.date_from.isoformat(), self.date_to.isoformat()]}})
        for key in ("sentiment", "category", "platform"):
            value = getattr(self, key)
            if value:
                clauses.append({key: {"$eq": value}})
        return clauses[0] if len(clauses) == 1 else {"$and": clauses}

    def to_callable(self) -> Callable[[Document], bool]:
        """Predicate for InMemoryVectorStore (tests / local fallback)."""

        def _match(doc: Document) -> bool:
            md = doc.metadata
            if md.get("business_id") != self.business_id:
                return False
            if (
                self.date_from
                and self.date_to
                and not (self.date_from.isoformat() <= md.get("review_date", "") <= self.date_to.isoformat())
            ):
                return False
            for key in ("sentiment", "category", "platform"):
                value = getattr(self, key)
                if value and md.get(key) != value:
                    return False
            return True

        return _match


def build_retriever(store: VectorStore, flt: RetrievalFilter, k: int) -> Runnable[str, list[Document]]:
    """Vector-store retriever with the tenant filter applied."""
    native_filter: Any = flt.to_callable() if isinstance(store, InMemoryVectorStore) else flt.to_pgvector()
    return store.as_retriever(search_kwargs={"k": k, "filter": native_filter})


def format_docs(docs: Sequence[Document]) -> str:
    """Render retrieved reviews for the prompt."""
    lines = []
    for doc in docs:
        md = doc.metadata
        tags = ", ".join(str(md[k]) for k in ("sentiment", "category", "urgency") if md.get(k))
        lines.append(f"{doc.page_content}\nTags: {tags}" if tags else doc.page_content)
    return "\n\n".join(lines)


def to_messages(history: Sequence[dict[str, str]]) -> list[BaseMessage]:
    """Convert [{role, content}] chat history to LangChain messages."""
    messages: list[BaseMessage] = []
    for turn in history:
        if turn["role"] == "user":
            messages.append(HumanMessage(content=turn["content"]))
        else:
            messages.append(AIMessage(content=turn["content"]))
    return messages


def build_ask_chain(retriever: Runnable[str, list[Document]]) -> Runnable[dict[str, Any], dict[str, Any]]:
    """RAG chain: {question, history} -> {docs, answer}.

    retrieve (question -> docs) | format context | prompt | llm | str parser
    """
    answer_chain = (
        RunnablePassthrough.assign(context=lambda x: format_docs(x["docs"]))
        | ASK_PROMPT
        | client.get_chat_model()
        | StrOutputParser()
    )
    return RunnablePassthrough.assign(docs=itemgetter("question") | retriever) | RunnablePassthrough.assign(
        answer=answer_chain
    )


NO_RESULTS_ANSWER = (
    "I couldn't find any analysed reviews matching these filters. Try removing a filter or uploading more reviews."
)


def ask(question: str, history: Sequence[dict[str, str]], flt: RetrievalFilter) -> tuple[str, list[Document]]:
    """Answer a question about one business's reviews. Returns (answer, source docs)."""
    store = get_vector_store()
    retriever = build_retriever(store, flt, settings.RAG_TOP_K)
    docs = retriever.invoke(question)
    if not docs:
        return NO_RESULTS_ANSWER, []
    # Reuse the retrieved docs: run the answer half of the chain with a fixed retriever.
    fixed: Runnable[str, list[Document]] = RunnableLambda(lambda _q: docs)
    result = build_ask_chain(fixed).invoke({"question": question, "history": to_messages(history[-6:])})
    return str(result["answer"]), list(result["docs"])
