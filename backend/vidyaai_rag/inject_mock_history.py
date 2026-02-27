import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vidyaai_rag.memory.student_memory import StudentMemory

STUDENT_ID = "test_student_001"

def inject_mock_data():
    print(f"💉 Injecting mock history for student: {STUDENT_ID}")
    
    mem = StudentMemory(STUDENT_ID)
    
    # Mock past doubts about List vs Tuples
    past_doubts = [
        'Which of the following non-metal oxides is neutral: $SO_2$, $NO_2$, or $CO$?',
        'Write a balanced chemical equation for the reaction between phosphorus ($P_4$) and excess oxygen. What type of oxide is produced?',
        'Explain how the acidic nature of non-metal oxides like $SO_x$ and $NO_x$ contributes to the formation of acid rain.',
        'Contrast the nature of Magnesium Oxide ($MgO$) with Sulfur Dioxide ($SO_2$) in terms of their reaction with water and litmus paper.',
        'In the periodic table, how does the acidic character of oxides change as you move from left to right across a period?'
    ]
    
    # Mock history records
    for doubt in past_doubts:
        mem.add_entry(
            f"Student asked: {doubt}. VidyaAI explained the differences but the student still seems to struggle with mutability concepts.",
            metadata={"type": "qa_pair", "topic": "python_collections"}
        )
    
    # Add a weak area tag
    mem.add_entry(
        "Student struggling with Python data structures mutability.",
        metadata={"tag": "weak_area"}
    )
    
    print("✅ Mock data injected successfully!")

if __name__ == "__main__":
    inject_mock_data()
