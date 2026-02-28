# OCR Integration Guide

## Overview

VidyaAI now supports OCR preprocessing for handwritten notes and mathematical equations. This is implemented as a separate FastAPI endpoint that processes images BEFORE sending text to the RAG pipeline.

## Architecture

```
Frontend Upload → /ocr/process → Clean Text → /rag/session/start → RAG Pipeline
```

The OCR service is a **preprocessing layer** that converts images into text, which can then be fed into the main RAG pipeline.

## Supported OCR Types

### 1. Handwriting OCR
- **Provider**: SarvamAI Document Intelligence API
- **Input**: Images of handwritten notes (PNG, JPG, JPEG)
- **Output**: Markdown formatted text
- **Use Case**: Student uploads handwritten class notes

### 2. Math OCR
- **Provider**: pix2tex LatexOCR
- **Input**: Images of mathematical equations (PNG, JPG, JPEG)
- **Output**: LaTeX notation
- **Use Case**: Student uploads photo of math problem from textbook

## API Endpoints

### POST `/ocr/process`

Process an uploaded image with OCR.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Parameters:
  - `file` (required): Image file (PNG, JPG, JPEG)
  - `ocr_type` (optional): `"handwriting"` or `"math"` (default: `"handwriting"`)

**Response:**
```json
{
  "extracted_text": "The extracted text or LaTeX",
  "ocr_type": "handwriting",
  "format": "markdown"
}
```

**Example using curl:**
```bash
curl -X POST "http://localhost:8000/ocr/process" \
  -F "file=@handwriting.png" \
  -F "ocr_type=handwriting"
```

**Example using Python:**
```python
import requests

with open("handwriting.png", "rb") as f:
    response = requests.post(
        "http://localhost:8000/ocr/process",
        files={"file": f},
        data={"ocr_type": "handwriting"}
    )

result = response.json()
extracted_text = result["extracted_text"]
```

### GET `/ocr/health`

Check OCR service configuration status.

**Response:**
```json
{
  "status": "ok",
  "handwriting_ocr": "configured",
  "math_ocr": "configured"
}
```

## Complete Workflow Example

### Scenario: Student uploads handwritten notes and asks a question

**Step 1: OCR Preprocessing**
```bash
curl -X POST "http://localhost:8000/ocr/process" \
  -F "file=@chemistry_notes.png" \
  -F "ocr_type=handwriting"
```

Response:
```json
{
  "extracted_text": "# Chemical Reactions\n\nWhen metals react with oxygen, they form metal oxides...",
  "ocr_type": "handwriting",
  "format": "markdown"
}
```

**Step 2: Send to RAG Pipeline**
```bash
curl -X POST "http://localhost:8000/rag/session/start" \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "student_123",
    "session_id": "session_456",
    "document_text": "# Chemical Reactions\n\nWhen metals react with oxygen, they form metal oxides...",
    "query_text": "What types of oxides are formed when non-metals combine with oxygen?"
  }'
```

## Configuration

### Environment Variables

Add to `.env`:
```bash
# SarvamAI API Key (for handwriting OCR)
SARVAM_API_KEY=sk_96iztzf8_RaZUDv3Rp3umxS438aMDgfZo
```

### Dependencies

The following packages are required (already added to `requirements.txt`):
```
sarvamai
pix2tex
pillow
```

Install with:
```bash
pip install -r vidyaai_rag/requirements.txt
```

## Testing

### Test Script

Use the provided test script:
```bash
# Test handwriting OCR
bash test_ocr.sh handwriting_notes.png handwriting

# Test math OCR
bash test_ocr.sh math_equation.jpg math
```

### Manual Testing

1. Start the FastAPI server:
```bash
python -m uvicorn vidyaai_rag.main:app --reload --host 0.0.0.0 --port 8000
```

2. Open the interactive docs:
```
http://localhost:8000/docs
```

3. Navigate to `/ocr/process` endpoint and test with sample images

## Frontend Integration

### React/Next.js Example

```typescript
// Step 1: OCR preprocessing
async function processImageWithOCR(imageFile: File, ocrType: 'handwriting' | 'math') {
  const formData = new FormData();
  formData.append('file', imageFile);
  formData.append('ocr_type', ocrType);
  
  const response = await fetch('http://localhost:8000/ocr/process', {
    method: 'POST',
    body: formData,
  });
  
  const result = await response.json();
  return result.extracted_text;
}

// Step 2: Send to RAG pipeline
async function startRAGSession(studentId: string, documentText: string, query: string) {
  const response = await fetch('http://localhost:8000/rag/session/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      student_id: studentId,
      session_id: `session_${Date.now()}`,
      document_text: documentText,
      query_text: query,
    }),
  });
  
  return await response.json();
}

// Complete workflow
async function handleImageUpload(imageFile: File, query: string) {
  // Detect if image contains math or handwriting
  const ocrType = detectOCRType(imageFile); // Your logic here
  
  // Extract text from image
  const extractedText = await processImageWithOCR(imageFile, ocrType);
  
  // Send to RAG pipeline
  const result = await startRAGSession('student_123', extractedText, query);
  
  return result;
}
```

## Error Handling

### Common Errors

**1. Missing API Key**
```json
{
  "detail": "SARVAM_API_KEY not configured in environment"
}
```
Solution: Add `SARVAM_API_KEY` to `.env` file

**2. Invalid File Type**
```json
{
  "detail": "Invalid file type. Allowed: .png, .jpg, .jpeg"
}
```
Solution: Convert image to supported format

**3. OCR Processing Failed**
```json
{
  "detail": "OCR processing failed: <error details>"
}
```
Solution: Check image quality, file size, and API quota

## Performance Considerations

- **Handwriting OCR**: Takes 5-15 seconds depending on image size and complexity
- **Math OCR**: Takes 1-3 seconds (runs locally, no API call)
- **Recommended**: Show loading indicator to user during OCR processing
- **File Size**: Keep images under 10MB for optimal performance

## Limitations

1. **Handwriting OCR**:
   - Requires clear, legible handwriting
   - Works best with high-contrast images
   - Supports multiple languages (configured via `language` parameter)

2. **Math OCR**:
   - Works best with printed or clearly written equations
   - May struggle with complex multi-line derivations
   - Outputs LaTeX notation (may need rendering on frontend)

## Future Enhancements

- [ ] Batch processing for multiple images
- [ ] PDF support (multi-page documents)
- [ ] Automatic OCR type detection
- [ ] Image quality validation before processing
- [ ] Caching of OCR results
- [ ] Support for tables and diagrams

## Support

For issues or questions about OCR integration, check:
1. `/ocr/health` endpoint for configuration status
2. FastAPI logs for detailed error messages
3. SarvamAI API documentation: https://docs.sarvam.ai/
4. pix2tex documentation: https://github.com/lukas-blecher/LaTeX-OCR
