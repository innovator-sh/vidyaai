"""Long-term student memory (Memory 2) — persistent ChromaDB, per student."""

import chromadb
from chromadb.config import Settings
from utils.embeddings import get_embeddings
from typing import List, Dict, Any, Optional
import os

CHROMA_DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "chroma_db")


class StudentMemory:
    """ChromaDB-backed persistent memory, isolated per student.

    Each student gets their own ChromaDB collection.
    Stores past doubts, session summaries, weak areas, mastered concepts.
    """

    def __init__(self, student_id: str):
        self.student_id = student_id
        self.client = chromadb.PersistentClient(path=CHROMA_DB_DIR)
        # Each student gets an isolated collection
        self.collection = self.client.get_or_create_collection(
            name=f"student_{student_id}",
            metadata={"hnsw:space": "cosine"},
        )
        self._embeddings = get_embeddings()

    def retrieve(self, query: str, k: int = 5) -> List[Dict[str, Any]]:
        """Retrieve the most relevant past entries for the given query."""
        if self.collection.count() == 0:
            return []

        query_embedding = self._embeddings.embed_query(query)
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=min(k, self.collection.count()),
        )
        entries = []
        if results and results["documents"]:
            for i, doc in enumerate(results["documents"][0]):
                meta = results["metadatas"][0][i] if results["metadatas"] else {}
                entries.append({"content": doc, "metadata": meta})
        return entries

    def add_entry(self, text: str, metadata: Optional[dict] = None) -> None:
        """Add a single text entry to the student's long-term memory."""
        meta = metadata or {}
        embedding = self._embeddings.embed_query(text)
        doc_id = f"{self.student_id}_{self.collection.count()}"
        self.collection.add(
            documents=[text],
            embeddings=[embedding],
            metadatas=[meta],
            ids=[doc_id],
        )

    def add_entries(self, texts: List[str], metadatas: Optional[List[dict]] = None) -> None:
        """Add multiple text entries at once."""
        if not texts:
            return
        metas = metadatas or [{} for _ in texts]
        embeddings = [self._embeddings.embed_query(t) for t in texts]
        start_id = self.collection.count()
        ids = [f"{self.student_id}_{start_id + i}" for i in range(len(texts))]
        self.collection.add(
            documents=texts,
            embeddings=embeddings,
            metadatas=metas,
            ids=ids,
        )

    def get_weak_areas(self) -> List[str]:
        """Retrieve concepts tagged as weak areas."""
        results = self.collection.get(where={"tag": "weak_area"})
        if results and results["documents"]:
            return results["documents"]
        return []

    def get_mastered(self) -> List[str]:
        """Retrieve concepts tagged as mastered."""
        results = self.collection.get(where={"tag": "mastered"})
        if results and results["documents"]:
            return results["documents"]
        return []

    def get_session_summaries(self, k: int = 3) -> List[str]:
        """Retrieve recent session summaries."""
        results = self.collection.get(where={"tag": "session_summary"})
        if results and results["documents"]:
            return results["documents"][-k:]
        return []
