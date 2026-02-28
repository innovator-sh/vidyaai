"""Embedding utility — local HuggingFace model (free, no API key)."""

from langchain_huggingface import HuggingFaceEmbeddings

_embeddings = None


def get_embeddings() -> HuggingFaceEmbeddings:
    """Return a singleton HuggingFaceEmbeddings instance."""
    global _embeddings
    if _embeddings is None:
        _embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    return _embeddings
