"""OCR utilities for handwritten notes and mathematical equations."""

import os
import zipfile
import tempfile
from typing import Optional
from sarvamai import SarvamAI
from pix2tex.cli import LatexOCR
from PIL import Image


class HandwritingOCR:
    """Handles handwritten text recognition using SarvamAI Document Intelligence API."""
    
    def __init__(self, api_key: str):
        self.client = SarvamAI(api_subscription_key=api_key)
    
    def process_image(self, image_path: str, language: str = "en-IN") -> str:
        """
        Process a single image containing handwritten text.
        
        Args:
            image_path: Path to the image file
            language: Language code (default: en-IN)
            
        Returns:
            Extracted text in markdown format
        """
        with tempfile.TemporaryDirectory() as temp_dir:
            # Wrap image in ZIP (API requires PDF or ZIP)
            zip_path = os.path.join(temp_dir, "input.zip")
            with zipfile.ZipFile(zip_path, "w") as z:
                z.write(image_path, arcname=os.path.basename(image_path))
            
            # Create job
            job = self.client.document_intelligence.create_job(
                language=language,
                output_format="md"
            )
            
            # Upload and process
            job.upload_file(zip_path)
            job.start()
            status = job.wait_until_complete()
            
            if status.job_state != "Completed":
                raise Exception(f"OCR job failed with state: {status.job_state}")
            
            # Download result
            result_zip = os.path.join(temp_dir, "result.zip")
            job.download_output(result_zip)
            
            # Extract markdown content
            with zipfile.ZipFile(result_zip, "r") as z:
                # Look for document.md in the output
                for name in z.namelist():
                    if name.endswith("document.md"):
                        with z.open(name) as f:
                            return f.read().decode("utf-8")
            
            raise Exception("No markdown output found in OCR result")


class MathOCR:
    """Handles mathematical equation recognition using pix2tex LatexOCR."""
    
    def __init__(self):
        self.model = LatexOCR()
    
    def process_image(self, image_path: str) -> str:
        """
        Process an image containing mathematical equations.
        
        Args:
            image_path: Path to the image file
            
        Returns:
            LaTeX representation of the equation
        """
        img = Image.open(image_path)
        latex = self.model(img)
        return latex


def process_document_with_ocr(
    image_path: str,
    sarvam_api_key: str,
    ocr_type: str = "handwriting"
) -> str:
    """
    Process a document image with OCR.
    
    Args:
        image_path: Path to the image file
        sarvam_api_key: SarvamAI API key
        ocr_type: Type of OCR - "handwriting" or "math"
        
    Returns:
        Extracted text (markdown for handwriting, LaTeX for math)
    """
    if ocr_type == "handwriting":
        ocr = HandwritingOCR(api_key=sarvam_api_key)
        return ocr.process_image(image_path)
    elif ocr_type == "math":
        ocr = MathOCR()
        return ocr.process_image(image_path)
    else:
        raise ValueError(f"Invalid ocr_type: {ocr_type}. Must be 'handwriting' or 'math'")
