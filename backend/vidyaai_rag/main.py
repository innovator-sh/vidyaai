"""VidyaAI RAG Pipeline — FastAPI entry point."""

import sys
import os

# Add project root to path so all imports resolve correctly
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import health, rag_session
from middleware.auth import verify_firebase_token
from dotenv import load_dotenv

load_dotenv()

print("--- VidyaAI RAG Startup Diagnostics ---")
print(f"Current Working Directory: {os.getcwd()}")
print(f"Python Search Path (sys.path): {sys.path[:3]}")
print(f"GROQ_API_KEY set: {'Yes' if os.getenv('GROQ_API_KEY') else 'No'}")
print(f"FIREBASE_SERVICE_ACCOUNT_PATH set: {'Yes' if os.getenv('FIREBASE_SERVICE_ACCOUNT_PATH') else 'No'}")
print(f"FRONTEND_URL: {os.getenv('FRONTEND_URL', 'http://localhost:3000')}")
print("---------------------------------------")

app = FastAPI(
    title="VidyaAI RAG Pipeline",
    description="Intelligent Educational Doubt Clearing Chatbot — AI/RAG Layer",
    version="1.0.0",
)

# CORS Middleware - Allow frontend origin
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://localhost:3000"],  # Allow both configured and default
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# Authentication Middleware - Verify Firebase tokens on protected routes
app.middleware("http")(verify_firebase_token)

# Include routers
app.include_router(health.router)
app.include_router(rag_session.router)


@app.get("/")
async def root():
    return {
        "service": "VidyaAI RAG Pipeline",
        "docs": "/docs",
        "health": "/health",
    }
