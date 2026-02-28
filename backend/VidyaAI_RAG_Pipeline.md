# VidyaAI — RAG Pipeline Specification
> Intelligent Educational Doubt Clearing Chatbot — AI/RAG Layer

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Assumptions — What This Module Receives](#assumptions--what-this-module-receives)
3. [Tech Stack](#tech-stack)
4. [Memory Architecture](#memory-architecture)
5. [Feature 1 — Doubt Root Cause Analysis](#feature-1--doubt-root-cause-analysis)
6. [Feature 2 — Background & Related Concepts](#feature-2--background--related-concepts)
7. [Feature 3 — Doubt Resolution & Solution](#feature-3--doubt-resolution--solution)
8. [Feature 4 — Student-Centric Long-Term Memory (Core USP)](#feature-4--student-centric-long-term-memory-core-usp)
9. [LangGraph Workflow DAG](#langgraph-workflow-dag)
10. [Prompt Engineering Guidelines](#prompt-engineering-guidelines)
11. [API Contract](#api-contract)
12. [Project Folder Structure](#project-folder-structure)

---

## Project Overview

**VidyaAI** is an educational doubt-clearing chatbot designed to act as a **student's personal AI tutor** — not a generic assistant. This document covers **only the RAG pipeline** — the AI reasoning layer responsible for analyzing doubts, surfacing background concepts, and delivering personalized solutions.

OCR, PDF conversion, image processing, and audio-to-text transcription are handled upstream by a separate service. This pipeline receives clean, pre-processed text as input and is solely responsible for the intelligent reasoning, retrieval, and memory management on top of it.

---

## Assumptions — What This Module Receives

This RAG pipeline assumes the following inputs are already prepared and passed in by the pre-processing service:

| Input | Type | Description |
|---|---|---|
| `document_text` | `string` | Clean extracted text from the uploaded PDF/image (post-OCR) |
| `query_text` | `string` | The student's doubt in plain text (audio already transcribed) |
| `student_id` | `string` | Unique identifier for the student |
| `session_id` | `string` | Unique identifier for the current session |

> **Note:** Chunking and embedding of `document_text` into the in-session vector store is the first responsibility of this RAG pipeline. Everything upstream of that (OCR, file conversion, speech-to-text) is out of scope.

---

## Tech Stack

| Layer | Technology |
|---|---|
| LLM Orchestration | LangChain, LangGraph |
| LLM Provider | OpenAI GPT-4o / Anthropic Claude (configurable) |
| Embeddings | OpenAI `text-embedding-3-small` |
| Vector Store — In-Session Memory | FAISS (ephemeral, per session) |
| Vector Store — Long-Term Memory | ChromaDB / Pinecone (persistent, per student namespace) |
| Backend | FastAPI (Python) |
| Metadata Store | PostgreSQL |

---

## Memory Architecture

> VidyaAI maintains **two independent vector memory systems** — one for within-session context, one for long-term student personalization. This dual-memory design is what separates VidyaAI from a generic AI assistant.

---

### Memory 1 — In-Session Conversational Memory

**Purpose:** Maintain full context within the current chat session. Ensures the LLM never loses track of what has been discussed, what concepts have been explained, and how the student has responded — all within this session.

**Implementation:** FAISS in-memory vector store + LangChain `VectorStoreRetrieverMemory`

**What gets stored:**
- Embedded chunks of the current session's uploaded document
- Full conversation history (student turns + AI turns), embedded and indexed
- Concepts explained so far in this session (to avoid repetition)
- Student follow-up questions within this session

**Lifecycle:** Initialized at session start with the chunked `document_text`. Destroyed when the session ends (a summary is auto-generated and pushed to Memory 2 before destruction).

**Retrieval:** Before every LLM call, a semantic search over this FAISS store retrieves the most relevant session context to inject into the prompt.

---

### Memory 2 — Long-Term Student Profile Memory

**Purpose:** Build a persistent, evolving model of each student across all sessions. This makes VidyaAI behave like a **private tutor who remembers you** — not a chatbot that resets every time.

**Implementation:** ChromaDB or Pinecone with a **per-student isolated namespace/collection**.

**What gets stored:**
- All past student queries and doubts (embedded)
- Embedded chunks from all documents the student has ever uploaded
- Topics and concepts the student has struggled with (tagged `weak_area`)
- Concepts the student has demonstrably mastered (tagged `mastered`)
- Preferred explanation depth/style (inferred from past interactions)
- Auto-generated session summaries

**Retrieval:** At the start of every session and before every LLM call, a semantic search retrieves the most relevant past context for the current query. This is injected directly into the system prompt.

**Student Isolation:** Every student has a completely isolated namespace. No data ever crosses between students.

---

## Feature 1 — Doubt Root Cause Analysis

**Goal:** Given the uploaded document and the student's query, identify *why* the doubt has arisen — which specific concept gap or misconception is at the root.

### LangGraph Node: `analyze_doubt`

**Inputs:**
- `query_text` — the student's doubt
- `document_chunks` — top-k semantic matches retrieved from Memory 1 (FAISS)
- `student_history` — top-k semantic matches retrieved from Memory 2 (past doubts, weak areas)

**Process:**
1. Chunk and embed `document_text` into Memory 1 (FAISS) — this is the RAG pipeline's first action on receiving input.
2. Perform semantic retrieval from Memory 1 using `query_text` → get the most relevant document segments.
3. Perform semantic retrieval from Memory 2 using `query_text` → get the student's past related doubts and known weak areas.
4. Pass combined context to LLM with the Root Cause Analysis prompt.
5. LLM outputs a structured root cause identifying the specific concept gap.

**Output:** `root_cause_analysis`
```json
{
  "core_gap": "The fundamental concept the student is missing",
  "misconception": "Any specific misconception detected (null if none)",
  "topic_area": "The broader topic this falls under",
  "reasoning": "Why this doubt arose, grounded in the document and student history"
}
```

---

## Feature 2 — Background & Related Concepts

**Goal:** Based on the root cause from Feature 1, identify and explain all prerequisite and related concepts the student needs before the solution will make sense. Personalized using Memory 2 to skip what's already known and reinforce known weak spots.

### LangGraph Node: `fetch_background_concepts`

**Inputs:**
- `root_cause_analysis` — output from Feature 1
- `student_history` — Memory 2 retrieval (mastered concepts, weak areas, past explanations)
- `document_chunks` — Memory 1 retrieval for any document-grounded concept context

**Process:**
1. Using `root_cause_analysis`, identify the prerequisite concept tree.
2. Cross-reference against Memory 2: skip concepts already mastered; flag and emphasize known weak areas.
3. Retrieve any relevant prior explanations from Memory 2 (concepts explained in past sessions from earlier uploaded docs).
4. Pass to LLM with the Background Concepts prompt, instructing it to calibrate depth per the student's history.

**Output:** `background_concepts` — ordered list from most fundamental to most advanced, each with a student-tailored explanation.

---

## Feature 3 — Doubt Resolution & Solution

**Goal:** Deliver a complete, step-by-step solution to the student's doubt, fully personalized using the root cause, prerequisites, session context, and the student's long-term profile.

### LangGraph Node: `solve_doubt`

**Inputs:**
- `query_text`
- `root_cause_analysis` — Feature 1 output
- `background_concepts` — Feature 2 output
- `document_chunks` — Memory 1 retrieval
- `student_history` — Memory 2 retrieval
- `session_context` — full current session history from Memory 1

**Process:**
1. Retrieve full session context from Memory 1 and relevant long-term context from Memory 2.
2. Construct solution prompt combining root cause, background, document context, and student profile.
3. LLM generates a step-by-step solution calibrated to the student's demonstrated knowledge level.
4. The resolved Q&A pair is stored back into Memory 1 (session) and a summarized form is pushed to Memory 2 (for future sessions).

**Output:** `solution` — structured markdown with numbered steps, highlighted key terms, worked examples, and a closing summary sentence.

---

## Feature 4 — Student-Centric Long-Term Memory (Core USP)

> **This is the soul of VidyaAI. This is what transforms it from a chatbot into a private tutor.**

### Philosophy

A private tutor does not start from scratch every session. They remember what the student got wrong last time, which explanations clicked, and what topics still need work. VidyaAI replicates this entirely through its long-term vector memory. Every interaction makes the system smarter about this specific student.

---

### LangGraph Node: `load_student_context`
**Triggered:** At the start of every session, before any LLM call.

**What it retrieves from Memory 2:**
- Top-k semantically similar past doubts to the current query
- Summaries of past sessions
- Concepts tagged `weak_area` — topics the student has historically struggled with
- Concepts tagged `mastered` — topics to skip or reference briefly
- Inferred explanation style preference

**How it is used:** This retrieved context is injected into the **system prompt** for every LLM call across Features 1, 2, and 3. It ensures the LLM always reasons as a tutor who *knows this student personally*.

---

### LangGraph Node: `update_student_memory`
**Triggered:** At session close, and optionally after each resolved doubt.

**What it writes to Memory 2:**
- Embedded representation of the current query and resolution
- Embedded chunks of the newly uploaded document (added to the student's long-term knowledge base)
- Auto-generated session summary (via LLM summarization chain)
- Metadata tags: `topic`, `difficulty`, `resolved`, `weak_area_flag`
- Inferred student struggle level (derived from follow-up question count and nature)

---

### How Feature 4 Elevates Features 1, 2, and 3

- **Feature 1** knows what misconceptions *this specific student* has exhibited before — not a generic learner.
- **Feature 2** knows exactly which prerequisites to skip (already mastered) and which ones to double down on (known weak areas).
- **Feature 3** knows the student's level, past performance patterns, and preferred style — so the solution is never a generic textbook answer.

---

## LangGraph Workflow DAG

```
START
  │
  ▼
[load_student_context]        ← Semantic retrieval from Memory 2 (long-term)
  │
  ▼
[ingest_document]             ← Chunk + embed document_text → initialize Memory 1 (FAISS)
  │
  ▼
[analyze_doubt]               ← Feature 1: RAG over Memory 1 + Memory 2
  │
  ▼
[fetch_background_concepts]   ← Feature 2: RAG over Memory 1 + Memory 2
  │
  ▼
[solve_doubt]                 ← Feature 3: Full context from Memory 1 + Memory 2
  │
  ▼
[update_student_memory]       ← Write session summary + embeddings to Memory 2
  │
  ▼
END → Return structured response to pre-processing/frontend layer
```

---

## Prompt Engineering Guidelines

> Every prompt in VidyaAI must enforce the private tutor persona. Generic, impersonal AI responses are explicitly forbidden at the prompt level.

---

### Shared System Prompt (Injected into Every LLM Call)

```
You are VidyaAI — a dedicated private tutor assigned exclusively to one student.
You are NOT a general-purpose AI assistant. You do not give generic answers.
You know this student's history, and you use it every time you respond.

STUDENT PROFILE (from long-term memory):
- Known weak areas: {weak_areas}
- Concepts already mastered: {mastered_concepts}
- Past struggle patterns: {past_struggles}
- Preferred explanation style: {explanation_style}
- Recent session summary: {recent_session_summary}

CURRENT SESSION CONTEXT:
{session_history}

RELEVANT DOCUMENT CONTEXT:
{document_chunks}

STRICT RULES:
1. Never re-explain concepts already in {mastered_concepts}. Reference them briefly if needed.
2. Always give extra attention to concepts in {weak_areas} — more examples, simpler language.
3. If this topic has come up before and the student struggled, explicitly approach it differently this time.
4. Adapt explanation depth to the student's demonstrated level — never over-explain, never under-explain.
5. Never produce a generic textbook answer. Every response must feel like it was written for this student specifically.
```

---

### Feature 1 — Root Cause Analysis Prompt

```
Your task is to identify exactly why the student's doubt has arisen.
Do not solve the doubt yet. Only diagnose the root cause.

Student's Doubt: {query_text}

Relevant Document Segments: {document_chunks}

Student's Past Related Doubts: {past_related_doubts}

Respond ONLY in the following JSON format:
{
  "core_gap": "The fundamental concept the student is missing",
  "misconception": "A specific misconception if detected, else null",
  "topic_area": "The broader subject area this falls under",
  "reasoning": "A concise explanation of why this doubt arose based on the document and student history"
}
```

---

### Feature 2 — Background Concepts Prompt

```
Based on the root cause identified below, provide all prerequisite and related concepts
the student must understand before the solution will make sense.

Root Cause Analysis: {root_cause_analysis}

Concepts this student has ALREADY mastered (DO NOT re-explain these): {mastered_concepts}

Concepts this student has STRUGGLED with before (give extra depth here): {weak_areas}

Instructions:
- Skip everything in {mastered_concepts} entirely.
- For anything in {weak_areas}, go deeper — use simpler language and extra examples.
- Order concepts from most fundamental to most advanced.
- Each concept must have a brief, student-friendly explanation grounded in the uploaded document where possible.
```

---

### Feature 3 — Solution Prompt

```
Now deliver the complete solution to the student's doubt.
You have the root cause and the background concepts already prepared.
Build directly on top of them. Do not repeat what has already been explained.

Student's Doubt: {query_text}
Root Cause: {root_cause_analysis}
Background Concepts Already Covered: {background_concepts}
Current Session History: {session_history}
Student Profile: {student_profile}

Instructions:
- Start where the background concepts left off — do not repeat them.
- Walk through the solution step by step.
- Use examples or analogies that fit the student's level and past interactions.
- If this is a topic the student has struggled with before, be explicit about the tricky part.
- End with a single memorable summary sentence the student can use to retain this concept.
- Format with clear numbered steps. Highlight key terms.
```

---

## API Contract

> This defines what the RAG pipeline expects to receive and what it returns. Upstream pre-processing must conform to this contract.

### `POST /rag/session/start`
Initializes session memory, loads long-term student context, runs the full 3-feature pipeline.

**Request Body:**
```json
{
  "student_id": "string",
  "session_id": "string",
  "document_text": "string",
  "query_text": "string"
}
```

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
  "solution": "string (markdown)"
}
```

---

### `POST /rag/session/followup`
Handles a follow-up query within the same session using Memory 1 (no new document).

**Request Body:**
```json
{
  "session_id": "string",
  "student_id": "string",
  "query_text": "string"
}
```

**Response:**
```json
{
  "solution": "string (markdown)"
}
```

---

### `POST /rag/session/end`
Closes the session — generates a session summary and writes everything to Memory 2.

**Request Body:**
```json
{
  "session_id": "string",
  "student_id": "string"
}
```

---

## Project Folder Structure

```
vidyaai_rag/
├── main.py                          # FastAPI app entry point
├── requirements.txt
├── .env                             # API keys, vector DB URIs, LLM config
│
├── api/
│   └── routes/
│       ├── rag_session.py           # /rag/session/start, /followup, /end
│       └── health.py
│
├── pipeline/
│   ├── graph.py                     # LangGraph graph definition & compilation
│   ├── state.py                     # Shared LangGraph state schema (TypedDict)
│   └── nodes/
│       ├── load_student_context.py  # Memory 2 retrieval node
│       ├── ingest_document.py       # Chunk + embed document_text → Memory 1
│       ├── analyze_doubt.py         # Feature 1 node
│       ├── fetch_background.py      # Feature 2 node
│       ├── solve_doubt.py           # Feature 3 node
│       └── update_student_memory.py # Memory 2 write-back node
│
├── memory/
│   ├── session_memory.py            # FAISS in-session Memory 1 (init, retrieve, store)
│   └── student_memory.py            # ChromaDB/Pinecone long-term Memory 2 (init, retrieve, store)
│
├── prompts/
│   ├── system_prompt.py             # Shared system prompt template
│   ├── root_cause_prompt.py         # Feature 1 prompt
│   ├── background_concepts_prompt.py # Feature 2 prompt
│   └── solution_prompt.py           # Feature 3 prompt
│
├── models/
│   ├── schemas.py                   # Pydantic request/response models
│   └── student_profile.py           # Student metadata & profile model
│
└── utils/
    ├── embeddings.py                # Embedding utility wrapper
    ├── chunker.py                   # LangChain text splitter (document_text → chunks)
    └── llm_client.py               # LLM abstraction (OpenAI / Claude)
```

---

*VidyaAI RAG Pipeline — Built to know your student, not just their question.*
