"""VidyaAI RAG Pipeline — FastAPI entry point."""

import sys
import os

# Add project root to path so all imports resolve correctly
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import health, rag_session, ocr, auth
from dotenv import load_dotenv

load_dotenv()

print("--- VidyaAI RAG Startup Diagnostics ---")
print(f"Current Working Directory: {os.getcwd()}")
print(f"Python Search Path (sys.path): {sys.path[:3]}")
print(f"GROQ_API_KEY set: {'Yes' if os.getenv('GROQ_API_KEY') else 'No'}")
print("---------------------------------------")

app = FastAPI(
    title="VidyaAI RAG Pipeline",
    description="Intelligent Educational Doubt Clearing Chatbot — AI/RAG Layer",
    version="1.0.0",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development; restrict to specific domains in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router)
app.include_router(rag_session.router)
app.include_router(ocr.router)
app.include_router(auth.router)


@app.get("/")
async def root():
    return {
        "service": "VidyaAI RAG Pipeline",
        "docs": "/docs",
        "health": "/health",
    }
