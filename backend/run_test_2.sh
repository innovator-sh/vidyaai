#!/bin/bash
export HF_HOME="./hf_cache"
# Path to the PDF in the root directory
PDF_FILE="NCERT-Class-10-Science.pdf"
PROMPT="What types of oxides are formed when non-metals combine with oxygen?Give answer in a short paragraph"

echo "Running VidyaAI RAG Test with PDF: $PDF_FILE"
./myvenv/bin/python vidyaai_rag/test_pdf.py "$PDF_FILE" "$PROMPT"
