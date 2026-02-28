# VidyaAI Architecture with OCR Integration

## Complete System Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND                                   │
│  (React/Next.js - handles file uploads, displays results)           │
└────────────┬────────────────────────────────────────┬───────────────┘
             │                                        │
             │ User uploads image                     │ User sends text query
             │                                        │
             ▼                                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      VIDYAAI BACKEND (FastAPI)                       │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              OCR PREPROCESSING LAYER                         │  │
│  │                                                              │  │
│  │  POST /ocr/process                                          │  │
│  │  ┌────────────────────┐      ┌────────────────────┐        │  │
│  │  │  Handwriting OCR   │      │    Math OCR        │        │  │
│  │  │  (SarvamAI API)    │      │    (pix2tex)       │        │  │
│  │  │  Returns: Markdown │      │    Returns: LaTeX  │        │  │
│  │  └────────────────────┘      └────────────────────┘        │  │
│  │                                                              │  │
│  │  Output: Clean extracted text                              │  │
│  └──────────────────┬───────────────────────────────────────────┘  │
│                     │                                               │
│                     │ Extracted text                                │
│                     ▼                                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  RAG PIPELINE                                │  │
│  │                                                              │  │
│  │  POST /rag/session/start                                    │  │
│  │  ┌────────────────────────────────────────────────────────┐ │  │
│  │  │ 1. Load Student Context (ChromaDB - Long-term Memory) │ │  │
│  │  └────────────────────────────────────────────────────────┘ │  │
│  │  ┌────────────────────────────────────────────────────────┐ │  │
│  │  │ 2. Ingest Document (FAISS - Session Memory)           │ │  │
│  │  └────────────────────────────────────────────────────────┘ │  │
│  │  ┌────────────────────────────────────────────────────────┐ │  │
│  │  │ 3. Analyze Doubt (Root Cause Analysis)                │ │  │
│  │  └────────────────────────────────────────────────────────┘ │  │
│  │  ┌────────────────────────────────────────────────────────┐ │  │
│  │  │ 4. Rerank Documents (Semantic Reranking)              │ │  │
│  │  └────────────────────────────────────────────────────────┘ │  │
│  │  ┌────────────────────────────────────────────────────────┐ │  │
│  │  │ 5. Fetch Background Concepts                          │ │  │
│  │  └────────────────────────────────────────────────────────┘ │  │
│  │  ┌────────────────────────────────────────────────────────┐ │  │
│  │  │ 6. Solve Doubt (Generate Solution)                    │ │  │
│  │  └────────────────────────────────────────────────────────┘ │  │
│  │  ┌────────────────────────────────────────────────────────┐ │  │
│  │  │ 7. Update Student Memory (ChromaDB)                   │ │  │
│  │  └────────────────────────────────────────────────────────┘ │  │
│  │                                                              │  │
│  │  Output: Root cause, background concepts, solution         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
             │
             │ Response with solution
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND                                   │
│  Displays: Root cause, concepts, solution, improvement advice       │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow Examples

### Example 1: Handwritten Notes → RAG Pipeline

```
1. Student uploads handwritten chemistry notes (PNG image)
   ↓
2. Frontend → POST /ocr/process (file=notes.png, ocr_type=handwriting)
   ↓
3. SarvamAI processes image → Returns markdown text
   ↓
4. Frontend → POST /rag/session/start (document_text=extracted_markdown, query="Explain oxides")
   ↓
5. RAG pipeline processes query with dual memory
   ↓
6. Frontend displays personalized solution
```

### Example 2: Math Equation → RAG Pipeline

```
1. Student uploads photo of math equation (JPG image)
   ↓
2. Frontend → POST /ocr/process (file=equation.jpg, ocr_type=math)
   ↓
3. pix2tex processes image → Returns LaTeX notation
   ↓
4. Frontend → POST /rag/session/start (document_text=latex, query="Solve this integral")
   ↓
5. RAG pipeline processes with student's math history
   ↓
6. Frontend displays step-by-step solution
```

## Memory Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MEMORY SYSTEM                                 │
│                                                                  │
│  ┌────────────────────────────┐  ┌──────────────────────────┐  │
│  │   SESSION MEMORY           │  │   STUDENT MEMORY         │  │
│  │   (Memory 1)               │  │   (Memory 2)             │  │
│  │                            │  │                          │  │
│  │  Storage: FAISS            │  │  Storage: ChromaDB       │  │
│  │  Location: RAM             │  │  Location: Disk          │  │
│  │  Lifetime: Session only    │  │  Lifetime: Permanent     │  │
│  │                            │  │                          │  │
│  │  Contains:                 │  │  Contains:               │  │
│  │  • Document chunks         │  │  • Past queries          │  │
│  │  • Conversation history    │  │  • Weak areas            │  │
│  │  • Current context         │  │  • Mastered concepts     │  │
│  │                            │  │  • Session summaries     │  │
│  │  Destroyed at session end  │  │  Persists forever        │  │
│  └────────────────────────────┘  └──────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### OCR Layer (Preprocessing)
- ✅ Image to text conversion
- ✅ Handwriting recognition
- ✅ Math equation recognition
- ✅ Format conversion (markdown/LaTeX)
- ❌ Does NOT do reasoning or memory management

### RAG Pipeline (Intelligence)
- ✅ Semantic search and retrieval
- ✅ Root cause analysis
- ✅ Concept explanation
- ✅ Solution generation
- ✅ Memory management (dual memory)
- ❌ Does NOT do image processing

## API Endpoints Overview

| Endpoint | Layer | Purpose | Input | Output |
|----------|-------|---------|-------|--------|
| `/ocr/process` | Preprocessing | Extract text from image | Image file | Text (markdown/LaTeX) |
| `/ocr/health` | Preprocessing | Check OCR status | None | Status info |
| `/rag/session/start` | Intelligence | Start tutoring session | Text + query | Root cause + solution |
| `/rag/session/followup` | Intelligence | Continue conversation | Query | Solution |
| `/rag/session/end` | Intelligence | Close session | Session ID | Summary |
| `/health` | System | Overall health | None | Status |

## Technology Stack

### OCR Layer
- **SarvamAI**: Handwriting recognition (cloud API)
- **pix2tex**: Math OCR (local processing)
- **Pillow**: Image handling

### RAG Pipeline
- **LangChain/LangGraph**: Orchestration
- **Groq/OpenAI**: LLM providers
- **HuggingFace**: Embeddings
- **FAISS**: Session memory
- **ChromaDB**: Student memory

### Backend
- **FastAPI**: Web framework
- **Uvicorn**: ASGI server
- **Pydantic**: Data validation

## Deployment Considerations

### Development
```bash
# Start server locally
python -m uvicorn vidyaai_rag.main:app --reload --host 0.0.0.0 --port 8000

# Access via ngrok (for frontend integration)
ngrok http 8000
```

### Production
- Use process manager (systemd, PM2, or Docker)
- Set up proper CORS for frontend domain
- Secure API keys in environment variables
- Consider rate limiting for OCR endpoints
- Monitor ChromaDB disk usage

## Security Notes

1. **API Keys**: Never commit to git, use environment variables
2. **Student Isolation**: Each student has isolated ChromaDB namespace
3. **Session Security**: Session IDs should be unique and unpredictable
4. **File Upload**: Validate file types and sizes
5. **CORS**: Restrict to specific frontend domains in production

## Performance Optimization

1. **OCR Caching**: Consider caching OCR results by image hash
2. **Document Caching**: Already implemented for FAISS indices
3. **Async Processing**: OCR can be made async for better UX
4. **Batch Processing**: Future enhancement for multiple images
5. **CDN**: Serve static assets via CDN in production

---

**Architecture Status**: ✅ Complete and Production Ready
