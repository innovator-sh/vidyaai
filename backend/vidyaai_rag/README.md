# VidyaAI RAG Backend

Intelligent Educational Doubt Clearing System - AI/RAG Layer

## 🚀 Overview

This is the FastAPI backend for VidyaAI that implements a Retrieval-Augmented Generation (RAG) pipeline for personalized educational assistance. The system acts as a private AI tutor that remembers each student's learning history and adapts explanations accordingly.

## 📁 Project Structure

```
vidyaai_rag/
├── api/
│   └── routes/
│       ├── rag_session.py      # Session endpoints (start, followup, end)
│       ├── ocr.py               # OCR preprocessing endpoints
│       └── health.py            # Health check endpoint
├── memory/
│   ├── session_memory.py        # In-session memory (FAISS)
│   └── student_memory.py        # Long-term memory (ChromaDB)
├── pipeline/
│   ├── graph.py                 # LangGraph workflow definition
│   ├── state.py                 # Pipeline state schema
│   ├── session_store.py         # Active session registry
│   └── nodes/
│       ├── load_student_context.py
│       ├── ingest_document.py
│       ├── analyze_doubt.py
│       ├── rerank_documents.py
│       ├── fetch_background.py
│       ├── solve_doubt.py
│       └── update_student_memory.py
├── prompts/
│   ├── system_prompt.py
│   ├── root_cause_prompt.py
│   ├── background_concepts_prompt.py
│   ├── solution_prompt.py
│   └── rerank_prompt.py
├── models/
│   ├── schemas.py               # Pydantic request/response models
│   └── student_profile.py
├── utils/
│   ├── embeddings.py            # Embedding utilities
│   ├── chunker.py               # Text chunking
│   ├── llm_client.py            # LLM abstraction
│   ├── ocr.py                   # OCR utilities (handwriting & math)
│   └── document_cache.py        # Document caching
├── main.py                      # FastAPI application entry point
└── requirements.txt             # Python dependencies
```

## 🛠️ Tech Stack

- **Framework:** FastAPI
- **LLM Orchestration:** LangChain, LangGraph
- **LLM Providers:** Groq (Llama), OpenAI (GPT-4)
- **Embeddings:** HuggingFace (all-MiniLM-L6-v2)
- **Vector Store (Session):** FAISS (in-memory)
- **Vector Store (Long-term):** ChromaDB (persistent)
- **Reranking:** LLM-based semantic reranking

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd vidyaai_rag
pip install -r requirements.txt
```

### 2. Set Up Environment Variables

Create a `.env` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
SARVAM_API_KEY=your_sarvam_api_key_here  # For handwriting OCR
```

### 3. Run the Server

```bash
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at:
- **API:** http://localhost:8000
- **Docs:** http://localhost:8000/docs
- **Health:** http://localhost:8000/health

## 📡 API Endpoints

### OCR Preprocessing

#### Process Image with OCR
```http
POST /ocr/process
Content-Type: multipart/form-data

file: <image_file>
ocr_type: "handwriting" | "math"
```

**Response:**
```json
{
  "extracted_text": "string",
  "ocr_type": "string",
  "format": "markdown" | "latex"
}
```

#### OCR Health Check
```http
GET /ocr/health
```

**See [OCR_INTEGRATION.md](OCR_INTEGRATION.md) for detailed OCR documentation.**

---

### Health Check
```http
GET /health
```

### Start Session
```http
POST /rag/session/start
Content-Type: application/json

{
  "student_id": "string",
  "session_id": "string",
  "document_text": "string | null",  // OPTIONAL - can be null or omitted
  "query_text": "string"
}
```

**Note**: `document_text` is now OPTIONAL. If not provided (null or empty), the system will answer using student's learning history and general knowledge.

**Response:**
```json
{
  "session_id": "string",
  "root_cause_analysis": {
    "core_gap": "string",
    "misconception": "string | null",
    "topic_area": "string",
    "reasoning": "string"
  },
  "background_concepts": ["string"],
  "solution": "string",
  "improvement_advice": "string | null"
}
```

### Follow-up Query
```http
POST /rag/session/followup
Content-Type: application/json

{
  "session_id": "string",
  "student_id": "string",
  "query_text": "string"
}
```

**Response:**
```json
{
  "solution": "string",
  "improvement_advice": "string | null"
}
```

### End Session
```http
POST /rag/session/end
Content-Type: application/json

{
  "session_id": "string",
  "student_id": "string"
}
```

**Response:**
```json
{
  "status": "session_closed",
  "summary": "string"
}
```

## 🧠 Memory Architecture

### Session Memory (Memory 1)
- **Type:** Ephemeral, in-memory
- **Storage:** FAISS vector store
- **Lifetime:** Created at session start, destroyed at session end
- **Purpose:** Maintain context within current conversation
- **Contains:** Document chunks, conversation history

### Student Memory (Memory 2)
- **Type:** Persistent, disk-based
- **Storage:** ChromaDB
- **Location:** `chroma_db/student_{id}/`
- **Lifetime:** Permanent
- **Purpose:** Long-term personalization across all sessions
- **Contains:** Past queries, weak areas, mastered concepts, session summaries

## 🔄 Pipeline Flow

```
User Query
    ↓
1. Load Student Context (ChromaDB)
    ↓
2. Ingest Document (FAISS)
    ↓
3. Analyze Doubt (Root Cause)
    ↓
4. Rerank Documents (Semantic)
    ↓
5. Fetch Background Concepts
    ↓
6. Solve Doubt
    ↓
7. Update Student Memory (ChromaDB)
    ↓
Response
```

## 🧪 Testing

### Test Reranking
```bash
python test_rerank.py
```

### Test with Local Document
```bash
python test_local.py
```

### Inject Mock History
```bash
python inject_mock_history.py
```

## 🔧 Configuration

### LLM Provider
Edit `utils/llm_client.py` to switch between Groq and OpenAI:

```python
# Use Groq (default)
llm = ChatGroq(model="llama-3.3-70b-versatile")

# Use OpenAI
llm = ChatOpenAI(model="gpt-4")
```

### Embeddings
Edit `utils/embeddings.py` to change embedding model:

```python
embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)
```

## 🗄️ Data Storage

### ChromaDB Location
```
vidyaai_rag/chroma_db/
└── student_{id}/
    ├── data files
    └── metadata
```

### Document Cache
```
vidyaai_rag/document_cache/
└── {document_hash}/
    └── cached FAISS index
```

## 🔒 Security Notes

- Never commit `.env` file
- Keep API keys secure
- ChromaDB data is student-isolated (one collection per student)
- Session memory is destroyed after session ends

## 📝 Recent Updates

### v1.3.0 (Latest)
- ✅ Added no-document query support
- ✅ Students can ask questions without uploading documents
- ✅ System uses student memory + general knowledge when no document provided
- ✅ Fully backward compatible with existing document-based queries

### v1.2.0
- ✅ Added OCR preprocessing endpoints
- ✅ Handwriting recognition (SarvamAI)
- ✅ Math equation recognition (pix2tex)
- ✅ Separate preprocessing layer for image-to-text conversion
- ✅ Complete OCR integration documentation

### v1.1.0
- ✅ Removed BM25 hybrid search
- ✅ Implemented pure semantic search with FAISS
- ✅ Added LLM-based document reranking
- ✅ Fixed mock history metadata
- ✅ Updated session memory architecture
- ✅ Improved retrieval accuracy

### v1.0.0
- Initial RAG pipeline implementation
- Dual memory architecture
- LangGraph workflow
- Multi-turn conversations

## 🤝 Contributing

This is the backend module for VidyaAI. For frontend integration, see the main repository.

## 📄 License

[Add your license here]

## 🔗 Links

- **Repository:** https://github.com/innovator-sh/vidyaai-hi/tree/rag-backend-module
- **Documentation:** See `VidyaAI_RAG_Pipeline.md` in project root
- **API Docs:** http://localhost:8000/docs (when running)

---

Built with ❤️ for personalized education
