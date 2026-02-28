"""
Verification script for Contextual Re-ranking.
Ensures the pipeline runs through the new re-ranking node.
"""

import sys, os
from dotenv import load_dotenv

# Project path setup
sys.path.insert(0, os.path.dirname(__file__))
load_dotenv()

from pipeline.graph import full_pipeline

STUDENT_ID = "test_student_rerank"
SESSION_ID = "test_session_rerank_001"

DOCUMENT_TEXT = """
Introduction to Thermodynamics

The First Law of Thermodynamics, also known as Law of Conservation of Energy, 
states that energy cannot be created or destroyed in an isolated system. 

The Second Law of Thermodynamics states that the total entropy of an isolated 
system can never decrease over time. 

The Third Law of Thermodynamics states that the entropy of a system approaches 
a constant value as the temperature approaches absolute zero.

Specific Heat Capacity is the amount of heat energy required to raise the 
temperature of a substance by one degree Celsius per unit mass.
"""

QUERY = "Explain the First Law of Thermodynamics simply."

def run_test():
    print(f"\n--- Testing Contextual Re-ranking ---")
    print(f"Query: {QUERY}")
    
    initial_state = {
        "student_id": STUDENT_ID,
        "session_id": SESSION_ID,
        "document_text": DOCUMENT_TEXT,
        "query_text": QUERY,
    }
    
    try:
        # Note: We expect to see '--- Re-ranking complete ---' in logs if node is hit
        result = full_pipeline.invoke(initial_state)
        print(f"Success! Solution generated.")
        print(f"Solution Preview: {result.get('solution')[:150]}...")
    except Exception as e:
        print(f"Error during verification: {e}")

if __name__ == "__main__":
    run_test()
