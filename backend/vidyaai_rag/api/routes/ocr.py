"""OCR preprocessing endpoints — /ocr/process."""

import os
import tempfile
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Literal
from utils.ocr import process_document_with_ocr


router = APIRouter(prefix="/ocr")


class OCRResponse(BaseModel):
    """Response model for OCR processing."""
    extracted_text: str
    ocr_type: str
    format: str  # "markdown" for handwriting, "latex" for math


@router.post("/process", response_model=OCRResponse)
async def process_ocr(
    file: UploadFile = File(..., description="Image file (PNG, JPG, JPEG)"),
    ocr_type: Literal["handwriting", "math"] = Form(
        default="handwriting",
        description="Type of OCR: 'handwriting' for notes, 'math' for equations"
    )
):
    """
    Process an uploaded image with OCR.
    
    - **handwriting**: Extracts handwritten text using SarvamAI (returns markdown)
    - **math**: Extracts mathematical equations using pix2tex (returns LaTeX)
    
    The extracted text can then be sent to /rag/session/start as document_text.
    """
    
    # Validate file type
    allowed_extensions = {".png", ".jpg", ".jpeg"}
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(allowed_extensions)}"
        )
    
    # Get SarvamAI API key from environment
    sarvam_api_key = os.getenv("SARVAM_API_KEY")
    if not sarvam_api_key and ocr_type == "handwriting":
        raise HTTPException(
            status_code=500,
            detail="SARVAM_API_KEY not configured in environment"
        )
    
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_path = temp_file.name
        
        # Process with OCR
        extracted_text = process_document_with_ocr(
            image_path=temp_path,
            sarvam_api_key=sarvam_api_key,
            ocr_type=ocr_type
        )
        
        # Clean up temp file
        os.unlink(temp_path)
        
        # Determine output format
        output_format = "markdown" if ocr_type == "handwriting" else "latex"
        
        return OCRResponse(
            extracted_text=extracted_text,
            ocr_type=ocr_type,
            format=output_format
        )
    
    except Exception as e:
        # Clean up temp file if it exists
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.unlink(temp_path)
        
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")


@router.get("/health")
async def ocr_health():
    """Check if OCR service is configured correctly."""
    sarvam_key = os.getenv("SARVAM_API_KEY")
    
    return {
        "status": "ok",
        "handwriting_ocr": "configured" if sarvam_key else "missing_api_key",
        "math_ocr": "configured"  # pix2tex doesn't need API key
    }
