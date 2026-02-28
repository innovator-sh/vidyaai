"""Node: rerank_documents — Select top chunks based on doubt analysis."""

from pipeline.state import PipelineState
from prompts.rerank_prompt import get_rerank_prompt
from utils.llm_client import get_llm
from langchain_core.messages import SystemMessage, HumanMessage

def rerank_documents(state: PipelineState) -> dict:
    """
    Use the LLM to re-rank and filter the retrieved candidates.
    If no documents available, skip re-ranking.
    """
    
    documents = state.get("document_chunks", "")
    
    # If no documents, skip re-ranking
    if not documents or not documents.strip():
        print(f"⚠️  No documents to rerank for session {state['session_id']} - proceeding with student memory only")
        return {"document_chunks": ""}
    
    llm = get_llm()
    query = state["query_text"]
    root_cause = state.get("root_cause_analysis", "Not analyzed yet")

    # Create the re-ranking prompt
    prompt = get_rerank_prompt(query, root_cause, documents)
    
    # Use a faster/cheaper model if possible, but keep it high quality
    response = llm.invoke([
        SystemMessage(content="You are a precise document re-ranker. Output ONLY the selected snippets."),
        HumanMessage(content=prompt),
    ])
    
    selected_chunks = response.content.strip()
    
    # We clean up the separator if the LLM followed instructions
    final_chunks = selected_chunks.replace("---", "\n\n")
    
    print(f"--- Re-ranking complete for session {state['session_id']} ---")
    
    return {"document_chunks": final_chunks}
