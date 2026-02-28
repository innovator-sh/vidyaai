"""Node: ingest_document — chunks + embeds document_text into FAISS (Memory 1)."""

from pipeline.state import PipelineState
from pipeline.session_store import get_session


def ingest_document(state: PipelineState) -> dict:
    """
    Chunk the document text and initialize the in-session FAISS store.
    If no document is provided, skip ingestion and rely on student memory only.
    """

    session_id = state["session_id"]
    document_text = state.get("document_text", "")

    # Get or create session memory
    session_mem = get_session(session_id)
    
    # If no document provided, return empty chunks
    if not document_text or not document_text.strip():
        print(f"⚠️  No document provided for session {session_id} - using student memory only")
        return {
            "document_chunks": "",
            "session_history": "",
        }
    
    # Initialize FAISS from document text
    session_mem.init_from_text(document_text)

    # Retrieve fewer candidates for re-ranking to avoid overwhelming the LLM
    query = state["query_text"]
    docs = session_mem.retrieve(query, k=5)  # Reduced from 10 to 5
    chunks_text = "\n\n".join([doc.page_content for doc in docs])

    return {
        "document_chunks": chunks_text,
        "session_history": "",
    }
