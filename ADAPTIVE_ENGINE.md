# Adaptive Persona Engine 🧠

Automatically switches between **Study Buddy 🧑‍🤝‍🧑 / Teacher 👩‍🏫 / Mentor 🧭** based purely on how long the student has been in the session.

---

## Files

| File | Purpose |
|------|---------|
| `persona_engine.py` | Core logic — signal extractor, time-based scorer, engine, prompts |
| `chatbot.py` | Integration layer — session manager + LLM wiring |

---

## How It Works

```
Student message
      ↓
extract_signals(session_start_time)   ← reads elapsed time only
      ↓
score_persona(signals)                ← applies time thresholds, returns persona
      ↓
PERSONA_PROMPTS[persona]              ← selects the right system prompt
      ↓
call_llm(system_prompt, history)      ← your LLM call (Claude, GPT, etc.)
      ↓
Response logged with persona tag
```

---

## Persona Timeline

```
0 ────────── 10 ──────────────── 28 ── 32 ──────── 40 ──────────▶ minutes
  Study Buddy 🧑‍🤝‍🧑   Teacher 👩‍🏫        Study Buddy  Teacher  Mentor 🧭
  (warm up)    (core learning)   (dip)  (resume)  (deep session)
```

| Phase | Time | Persona | Why |
|-------|------|---------|-----|
| Warm-up | 0 – 10 min | Study Buddy 🧑‍🤝‍🧑 | Ease the student in, build comfort |
| Core learning | 10 – 28 min | Teacher 👩‍🏫 | Explain concepts, check understanding |
| Re-engagement dip | 28 – 32 min | Study Buddy 🧑‍🤝‍🧑 | Attention dip at ~30 min — re-energize |
| Resume learning | 32 – 40 min | Teacher 👩‍🏫 | Back to focused learning |
| Deep session | 40+ min | Mentor 🧭 | Guide thinking, Socratic questioning |

---

## Engagement Signals Used

| Signal | How it's computed |
|--------|------------------|
| `session_duration_sec` | `time.time() - session_start_time` |
| `session_duration_min` | `session_duration_sec / 60` |

That's it — no message counting, no response gap tracking.

---

## Quick Start

```python
from persona_engine import ThresholdConfig
from chatbot import StudentChatSession

session = StudentChatSession(
    student_id="student_001",
    config=ThresholdConfig(
        warmup_end_min=10.0,
        mentor_start_min=40.0,
    )
)

result = session.chat("I don't get this topic at all", verbose=True)
print(result["active_persona"])   # → "Study Buddy"
print(result["response"])
```

---

## Plugging in Your LLM

In `chatbot.py`, the `call_llm()` function is wired for Groq. Just install the SDK and set your API key:

```bash
pip install groq
export GROQ_API_KEY=your_key_here
```

```python
from groq import Groq

client = Groq()  # reads GROQ_API_KEY from env

def call_llm(system_prompt: str, conversation_history: list[dict]) -> str:
    messages = [{"role": "system", "content": system_prompt}] + conversation_history
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        max_tokens=1024,
        temperature=0.7,
    )
    return response.choices[0].message.content
```

### Available Groq Models

| Model | Best for |
|-------|---------|
| `llama-3.3-70b-versatile` | Best quality, default choice |
| `llama-3.1-8b-instant` | Fastest, lowest latency |
| `mixtral-8x7b-32768` | Long context windows |
| `gemma2-9b-it` | Lightweight, instruction-tuned |

---

## Tuning Thresholds

All thresholds are configurable via `ThresholdConfig`:

```python
config = ThresholdConfig(
    warmup_end_min=5.0,        # shorter warm-up for returning students
    reengage_start_min=25.0,   # earlier re-engagement dip
    reengage_end_min=30.0,
    mentor_start_min=35.0,     # reach mentor mode sooner
)
```

---

## Persona Prompts

Each persona has a distinct tone and strategy built into its system prompt:

**Study Buddy 🧑‍🤝‍🧑** — casual, encouraging, short replies, keeps it fun. Used during warm-up and the mid-session re-engagement dip.

**Teacher 👩‍🏫** — clear, step-by-step explanations with examples. Checks understanding at the end of responses. The default learning mode.

**Mentor 🧭** — Socratic, reflective, pushes independent thinking. Only activates after 40 minutes of sustained engagement.

---

## Session Summary

```python
print(session.get_session_summary())
# {
#   "student_id": "student_001",
#   "total_exchanges": 8,
#   "session_duration_min": 23.4,
#   "persona_distribution": {"Study Buddy": "25%", "teacher": "75%"},
#   "final_persona": "teacher"
# }
```

---

## Resetting a Session

```python
session.reset()  # clears history, resets timer — same object, fresh session
```
