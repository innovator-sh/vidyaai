"""LLM client wrapper — using Groq Cloud API."""

import os
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv

load_dotenv()

# Global cache to avoid recreating the client
_llm_cache = {}

#   
def get_llm(model_id: str = "llama-3.3-70b-versatile", temperature: float = 0.3) -> ChatGroq:
    """Return a ChatGroq instance."""
    
    cache_key = f"{model_id}_{temperature}"
    if cache_key in _llm_cache:
        return _llm_cache[cache_key]

    print(f"Initializing Groq LLM: {model_id}")
    
    chat_model = ChatGroq(
        model_name=model_id,
        temperature=temperature,
        max_tokens=800,  # Reduced from 1800 to prevent garbage output
        groq_api_key=os.getenv("GROQ_API_KEY")
    )
    
    _llm_cache[cache_key] = chat_model
    return chat_model
