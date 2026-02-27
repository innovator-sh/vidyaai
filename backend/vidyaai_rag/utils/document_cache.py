"""Document cache utility — avoids re-embedding the same document."""

import os
import hashlib
from langchain_community.vectorstores import FAISS
from utils.embeddings import get_embeddings

CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "document_cache")

def get_document_hash(text: str) -> str:
    """Return SHA-256 hash of the document text."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def get_file_hash(file_path: str) -> str:
    """Return SHA-256 hash of the file content."""
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hasher.update(chunk)
    return hasher.hexdigest()

def get_cached_text(doc_hash: str) -> str:
    """Retrieve extracted text from cache if it exists."""
    text_path = os.path.join(CACHE_DIR, f"{doc_hash}.txt")
    if os.path.exists(text_path):
        with open(text_path, "r", encoding="utf-8") as f:
            return f.read()
    return None

def save_text_to_cache(doc_hash: str, text: str) -> None:
    """Save extracted text to the cache directory."""
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR)
    
    text_path = os.path.join(CACHE_DIR, f"{doc_hash}.txt")
    with open(text_path, "w", encoding="utf-8") as f:
        f.write(text)

def get_cached_index(doc_hash: str) -> FAISS:
    """Load a FAISS index from cache if it exists."""
    index_path = os.path.join(CACHE_DIR, doc_hash)
    if os.path.exists(index_path):
        embeddings = get_embeddings()
        # allow_dangerous_deserialization=True is safe here as we control the cache directory
        return FAISS.load_local(index_path, embeddings, allow_dangerous_deserialization=True)
    return None

def save_index_to_cache(doc_hash: str, index: FAISS) -> None:
    """Save a FAISS index to the cache directory."""
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR)
    
    index_path = os.path.join(CACHE_DIR, doc_hash)
    index.save_local(index_path)
