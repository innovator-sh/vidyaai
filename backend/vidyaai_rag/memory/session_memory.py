"""In-session FAISS memory (Memory 1) — ephemeral, per session."""

from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from utils.embeddings import get_embeddings
from utils.chunker import chunk_text
from typing import List, Optional


class SessionMemory:
    """FAISS-backed in-session vector memory with semantic search.

    Lifecycle: created at session start, destroyed at session end.
    Stores document chunks and conversation turns for within-session retrieval.
    """

    def __init__(self):
        self.store: Optional[FAISS] = None
        self.all_documents: List[Document] = []
        self.conversation_history: List[str] = []

    def init_from_text(self, document_text: str) -> None:
        """Initialize the FAISS store for semantic search."""
        from utils.document_cache import get_document_hash, get_cached_index, save_index_to_cache
        
        doc_hash = get_document_hash(document_text)
        cached_store = get_cached_index(doc_hash)
        
        chunks = chunk_text(document_text)
        self.all_documents.extend(chunks)
        
        # Vector Store (FAISS)
        if cached_store:
            print(f"📦 Using cached embeddings for document (hash: {doc_hash[:10]}...)")
            self.store = cached_store
        else:
            print(f"⚙️ Generating new embeddings for document (hash: {doc_hash[:10]}...)")
            embeddings = get_embeddings()
            self.store = FAISS.from_documents(chunks, embeddings)
            save_index_to_cache(doc_hash, self.store)

    def retrieve(self, query: str, k: int = 4) -> List[Document]:
        """Semantic search over the session store."""
        if self.store is None:
            return []
        
        return self.store.similarity_search(query, k=k)

    def add_text(self, text: str, metadata: Optional[dict] = None) -> None:
        """Add a new text entry to the vector store."""
        meta = metadata or {}
        doc = Document(page_content=text, metadata=meta)
        self.all_documents.append(doc)
        
        if self.store:
            self.store.add_documents([doc])
            
        self.conversation_history.append(text)

    def get_session_history_text(self) -> str:
        """Return the full conversation history as a single string."""
        return "\n".join(self.conversation_history)
