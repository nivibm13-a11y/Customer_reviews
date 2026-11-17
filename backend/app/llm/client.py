"""The ONLY place the LLM / embedding provider is chosen.

Swap providers here (e.g. ChatAnthropic, ChatGoogleGenerativeAI) without touching any chain.
"""

from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from app.config import settings


class LLMNotConfiguredError(RuntimeError):
    """Raised when OPENAI_API_KEY is missing."""


def _require_key() -> str:
    if not settings.OPENAI_API_KEY:
        raise LLMNotConfiguredError("OPENAI_API_KEY is not set. Add it to backend/.env.")
    return settings.OPENAI_API_KEY


def get_chat_model() -> BaseChatModel:
    """Chat model used by every chain (temperature 0 for consistent tagging)."""
    return ChatOpenAI(
        model=settings.OPENAI_MODEL,
        api_key=_require_key(),
        temperature=0,
        timeout=60,
        max_retries=2,
    )


def get_embeddings() -> Embeddings:
    """Embedding model used for RAG indexing and retrieval."""
    return OpenAIEmbeddings(model=settings.EMBEDDING_MODEL, api_key=_require_key())
