"""
Local test script for PDF documents — run the full RAG pipeline with a PDF file.

Usage:
    python vidyaai_rag/test_pdf.py <path_to_pdf> <query>
"""

import sys
import os

# ── Project path setup ───────────────────────────────────────────
# Add the directory containing 'vidyaai_rag' to sys.path
# This script is at /Users/dhruv/Desktop/RAG-Backend/vidyaai_rag/test_pdf.py
# We want to be able to import from 'pipeline', etc.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()                          # picks up configuration from .env

from pipeline.graph import full_pipeline
from langchain_community.document_loaders import PyPDFLoader

STUDENT_ID = "test_student_001"
SESSION_ID = "test_session_pdf_001"

def run_pdf_test(pdf_path: str, query: str):
    """Load PDF, extract text, and run the complete pipeline."""

    if not os.path.exists(pdf_path):
        print(f"❌ Error: File not found at {pdf_path}")
        return

    print("=" * 70)
    print("  VidyaAI RAG — PDF TEST")
    print("=" * 70)
    print(f"📄 PDF Path : {pdf_path}")
    print(f"❓ Query    : {query}\n")

    print("⏳ Loading and parsing PDF...")
    try:
        from utils.document_cache import get_file_hash, get_cached_text, save_text_to_cache
        
        # Check cache first
        file_hash = get_file_hash(pdf_path)
        cached_text = get_cached_text(file_hash)
        
        if cached_text:
            print(f"✅ Found cached text for this PDF (hash: {file_hash[:10]}...). skipping parsing.")
            document_text = cached_text
        else:
            print(f"⚙️ No cache found. Parsing PDF...")
            loader = PyPDFLoader(pdf_path)
            pages = loader.load()
            document_text = "\n\n".join([page.page_content for page in pages])
            save_text_to_cache(file_hash, document_text)
            print(f"✅ Extracted {len(document_text)} characters from {len(pages)} pages.")
    except Exception as e:
        print(f"❌ Error loading PDF: {str(e)}")
        return

    initial_state = {
        "student_id":    STUDENT_ID,
        "session_id":    SESSION_ID,
        "document_text": document_text,
        "query_text":    query,
    }

    print("⏳ Running full pipeline (this may take a minute)...\n")
    try:
        result = full_pipeline.invoke(initial_state)

        # ── Print results ────────────────────────────────────────────
        print("-" * 70)
        print("🔍 ROOT CAUSE ANALYSIS")
        print("-" * 70)
        print(result.get("root_cause_analysis", "—"))

        print("\n" + "-" * 70)
        print("📚 BACKGROUND CONCEPTS")
        print("-" * 70)
        print(result.get("background_concepts", "—"))

        print("\n" + "-" * 70)
        print("✅ SOLUTION")
        print("-" * 70)
        print(result.get("solution", "—"))

        advice = result.get("improvement_advice")
        if advice:
            print("\n" + "-" * 70)
            print("💡 IMPROVEMENT ADVICE (Based on Past History)")
            print("-" * 70)
            print(advice)
    except Exception as e:
        print(f"❌ Error running pipeline: {str(e)}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python test_pdf.py <pdf_path> <query>")
    else:
        pdf_path = sys.argv[1]
        query = " ".join(sys.argv[2:])
        run_pdf_test(pdf_path, query)
