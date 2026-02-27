"""Node: ingest_document — chunks + embeds document_text into FAISS (Memory 1)."""

from pipeline.state import PipelineState
from pipeline.session_store import get_session


def ingest_document(state: PipelineState) -> dict:
    """Chunk the document text and initialize the in-session FAISS store."""

    session_id = state["session_id"]
    document_text = state["document_text"]

    # Get or create session memory
    session_mem = get_session(session_id)
    session_mem.init_from_text(document_text)

    # Retrieve top chunks for the current query
    query = state["query_text"]
    docs = session_mem.retrieve(query, k=4)
    chunks_text = "\n\n".join([doc.page_content for doc in docs])

    return {
        "document_chunks": chunks_text,
        "session_history": "",
    }
