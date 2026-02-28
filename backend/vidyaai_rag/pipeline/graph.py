"""LangGraph graph definition & compilation."""

from langgraph.graph import StateGraph, START, END
from pipeline.state import PipelineState
from pipeline.nodes.load_student_context import load_student_context
from pipeline.nodes.ingest_document import ingest_document
from pipeline.nodes.analyze_doubt import analyze_doubt
from pipeline.nodes.fetch_background import fetch_background
from pipeline.nodes.solve_doubt import solve_doubt
from pipeline.nodes.update_student_memory import update_student_memory
from pipeline.nodes.rerank_documents import rerank_documents


def build_full_pipeline() -> StateGraph:
    """Build the full 7-node LangGraph DAG for session start."""

    graph = StateGraph(PipelineState)

    # Add nodes
    graph.add_node("load_student_context", load_student_context)
    graph.add_node("ingest_document", ingest_document)
    graph.add_node("analyze_doubt", analyze_doubt)
    graph.add_node("rerank_documents", rerank_documents)
    graph.add_node("fetch_background", fetch_background)
    graph.add_node("solve_doubt", solve_doubt)
    graph.add_node("update_student_memory", update_student_memory)

    # Define edges (linear DAG with re-ranking)
    graph.add_edge(START, "load_student_context")
    graph.add_edge("load_student_context", "ingest_document")
    graph.add_edge("ingest_document", "analyze_doubt")
    graph.add_edge("analyze_doubt", "rerank_documents")
    graph.add_edge("rerank_documents", "fetch_background")
    graph.add_edge("fetch_background", "solve_doubt")
    graph.add_edge("solve_doubt", "update_student_memory")
    graph.add_edge("update_student_memory", END)

    return graph.compile()


def build_followup_pipeline() -> StateGraph:
    """Build a lighter pipeline for follow-up queries (no document ingestion)."""

    graph = StateGraph(PipelineState)

    graph.add_node("load_student_context", load_student_context)
    graph.add_node("analyze_doubt", analyze_doubt)
    graph.add_node("rerank_documents", rerank_documents)
    graph.add_node("fetch_background", fetch_background)
    graph.add_node("solve_doubt", solve_doubt)
    graph.add_node("update_student_memory", update_student_memory)

    graph.add_edge(START, "load_student_context")
    graph.add_edge("load_student_context", "analyze_doubt")
    graph.add_edge("analyze_doubt", "rerank_documents")
    graph.add_edge("rerank_documents", "fetch_background")
    graph.add_edge("fetch_background", "solve_doubt")
    graph.add_edge("solve_doubt", "update_student_memory")
    graph.add_edge("update_student_memory", END)

    return graph.compile()


# Pre-compiled pipelines
full_pipeline = build_full_pipeline()
followup_pipeline = build_followup_pipeline()
