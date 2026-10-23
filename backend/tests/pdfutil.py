"""Tiny PDF/image builders for upload tests (no PDF library needed)."""

from __future__ import annotations


def make_pdf(text: str, pages: int = 1) -> bytes:
    """Build a small valid text PDF (correct xref table)."""
    objs: list[bytes] = [b"<</Type/Catalog/Pages 2 0 R>>"]
    kids = " ".join(f"{3 + 2 * i} 0 R" for i in range(pages))
    objs.append(f"<</Type/Pages/Kids[{kids}]/Count {pages}>>".encode())
    font_id = 3 + 2 * pages
    for i in range(pages):
        content_id = 4 + 2 * i
        objs.append(
            f"<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 200]/Contents {content_id} 0 R"
            f"/Resources<</Font<</F1 {font_id} 0 R>>>>>>".encode()
        )
        stream = f"BT /F1 12 Tf 20 100 Td ({text}) Tj ET".encode()
        objs.append(b"<</Length %d>>stream\n%s\nendstream" % (len(stream), stream))
    objs.append(b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>")
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for n, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n%s\nendobj\n" % (n, body)
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<</Size %d/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF" % (len(objs) + 1, xref)
    return bytes(out)


PDF_MIN = make_pdf("Mitochondria produce ATP energy for the cell")
PNG_MIN = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG_MIN = b"\xff\xd8\xff\xe0" + b"\x00" * 32
