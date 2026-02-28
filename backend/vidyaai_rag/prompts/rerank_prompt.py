"""Prompt for contextual re-ranking of retrieved documents."""

def get_rerank_prompt(query: str, root_cause: str, documents: str) -> str:
    return f"""You are an expert educational content curator. 
Your task is to select the TOP 4 most relevant snippets from a list of retrieved documents to help a student solve a specific doubt.

STUDENT QUESTION: {query}
ROOT CAUSE OF DOUBT: {root_cause}

RETRIVED SNIPPETS:
{documents}

STRICT SELECTION CRITERIA:
1. Prioritize snippets that directly address the "ROOT CAUSE OF DOUBT".
2. Ensure the snippets contain the actual answer or steps to the student's question.
3. Remove redundant or overly repetitive information.
4. Keep the original text of the snippets exactly as they are.

OUTPUT FORMAT:
Respond ONLY with the text of the 4 best snippets, separated by '---'. 
Do not add any introductory or concluding remarks."""
