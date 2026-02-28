"""
Local test script — run the full RAG pipeline WITHOUT the API layer.

Usage:
    1. Place a PDF or paste text directly (see DOCUMENT_TEXT below).
    2. Set your query in QUERY_TEXT.
    3. Run:  python test_local.py
"""

import sys, os

# ── Project path setup ───────────────────────────────────────────
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()                          # picks up configuration from .env

from pipeline.graph import full_pipeline, followup_pipeline


# ════════════════════════════════════════════════════════════════
#  ✏️  EDIT THESE TWO BLOCKS TO TEST DIFFERENT INPUTS
# ════════════════════════════════════════════════════════════════

STUDENT_ID = "test_student_001"
SESSION_ID = "test_session_001"

# Paste the document / chapter text you want the pipeline to learn from.
# You can also load from a .txt file (see the helper at the bottom).
DOCUMENT_TEXT = """
Newton's Laws of Motion

First Law (Law of Inertia):
An object at rest stays at rest and an object in motion stays in motion
with the same speed and in the same direction unless acted upon by an
unbalanced force.

Second Law (F = ma):
The acceleration of an object as produced by a net force is directly
proportional to the magnitude of the net force, in the same direction
as the net force, and inversely proportional to the mass of the object.
Mathematically: F = m × a, where F is the net force, m is the mass,
and a is the acceleration.

Third Law (Action-Reaction):
For every action, there is an equal and opposite reaction. When one
body exerts a force on a second body, the second body simultaneously
exerts a force equal in magnitude and opposite in direction on the
first body.
"""

# First doubt the student asks
QUERY_TEXT = "I don't understand why F = ma — what does acceleration really mean here?"


# ════════════════════════════════════════════════════════════════
#  Run the full pipeline (session start + first doubt)
# ════════════════════════════════════════════════════════════════

def run_full():
    """Run the complete 6-node pipeline and print every output."""

    print("=" * 70)
    print("  VidyaAI RAG — LOCAL TEST  (Full Pipeline)")
    print("=" * 70)
    print(f"\n📄 Document length : {len(DOCUMENT_TEXT)} chars")
    print(f"❓ Query           : {QUERY_TEXT}\n")

    initial_state = {
        "student_id":    STUDENT_ID,
        "session_id":    SESSION_ID,
        "document_text": DOCUMENT_TEXT,
        "query_text":    QUERY_TEXT,
    }

    print("⏳ Running full pipeline (this may take a minute on first run)...\n")

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

    return result


# ════════════════════════════════════════════════════════════════
#  Run a follow-up query (reuses the existing session)
# ════════════════════════════════════════════════════════════════

def run_followup(followup_query: str):
    """Run the lighter follow-up pipeline on the same session."""

    print("\n" + "=" * 70)
    print("  VidyaAI RAG — FOLLOW-UP QUERY")
    print("=" * 70)
    print(f"❓ Follow-up : {followup_query}\n")

    followup_state = {
        "student_id": STUDENT_ID,
        "session_id": SESSION_ID,
        "query_text": followup_query,
    }

    print("⏳ Running follow-up pipeline...\n")
    result = followup_pipeline.invoke(followup_state)

    print("-" * 70)
    print("✅ FOLLOW-UP ANSWER")
    print("-" * 70)
    print(result.get("solution", "—"))

    return result


# ════════════════════════════════════════════════════════════════
#  Helpers
# ════════════════════════════════════════════════════════════════

def load_text_file(path: str) -> str:
    """Load a .txt file and return its content as a string."""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


# ════════════════════════════════════════════════════════════════
#  Entrypoint
# ════════════════════════════════════════════════════════════════

if __name__ == "__main__":

    # ── (Optional) Load document from a file instead ──────────
    # DOCUMENT_TEXT = load_text_file("path/to/your/notes.txt")

    # 1️⃣  Full pipeline — first query with document upload
    run_full()

    # 2️⃣  Follow-up — test a second question on the same session
    run_followup("Can you give me a real-life example of F = ma?")
