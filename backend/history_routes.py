# ── History Endpoints ────────────────────────────────────────────────────────

@router.post("/save")
async def save_chat_entry(
    firebase_uid: str,
    question: str,
    answer: str,
    subject: str = "General",
):
    """Lightweight endpoint to save a Q&A pair to ChromaDB."""
    try:
        student_id = user_manager.get_or_create_student_id(firebase_uid)
    except Exception:
        return {"status": "skipped", "reason": "could not map user"}

    try:
        student_mem = StudentMemory(student_id)
        content = f"Doubt: {question}\n\nAnswer: {answer}"
        student_mem.add_entry(
            content,
            metadata={
                "tag": "doubt_resolution",
                "topic_area": subject.lower(),
                "question": question[:200],
                "answer_preview": answer[:200],
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
        return {"status": "saved"}
    except Exception as e:
        return {"status": "error", "reason": str(e)}


@router.get("/history")
async def get_history(firebase_uid: str, limit: int = 50):
    """Return the student's chat history from ChromaDB for the history page."""
    try:
        student_id = user_manager.get_or_create_student_id(firebase_uid)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get student ID: {str(e)}")

    student_mem = StudentMemory(student_id)
    entries = student_mem.get_history(k=limit)

    history_items = []
    for entry in entries:
        content = entry["content"]
        meta = entry["metadata"]
        ts_str = meta.get("timestamp", "")

        title = "Chat Session"
        preview = content[:200]
        if "Doubt: " in content or "Student: " in content:
            first_line = content.split("\n")[0]
            title = first_line.replace("Doubt: ", "").replace("Student: ", "").strip()[:80]
            if len(title) > 80:
                title = title[:77] + "..."

        subject = meta.get("topic_area", meta.get("subject", "General"))
        subject_map = {
            "mathematics": "Mathematics", "math": "Mathematics",
            "physics": "Physics", "chemistry": "Chemistry",
            "biology": "Biology", "history": "History",
            "english": "English", "computer science": "Computer Science",
            "economics": "Economics",
        }
        subject = subject_map.get(subject.lower(), subject.title())
        
        history_items.append({
            "id": meta.get("id", str(hash(content))),
            "title": title,
            "preview": preview,
            "subject": subject,
            "date": ts_str,
            "isFavorite": meta.get("isFavorite", False)
        })
        
    return {"history": history_items}

@router.delete("/history/{item_id}")
async def delete_history_item(firebase_uid: str, item_id: str):
    """Delete a specific history entry."""
    try:
        student_id = user_manager.get_or_create_student_id(firebase_uid)
        student_mem = StudentMemory(student_id)
        student_mem.delete_entry(item_id)
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
