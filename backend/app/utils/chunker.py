"""Recursive text chunker (paragraph -> line -> sentence -> word -> char) with overlap.

Same behaviour as the previous LangChain RecursiveCharacterTextSplitter(1000, 200) without the
dependency.
"""

from __future__ import annotations

_SEPARATORS = ("\n\n", "\n", ". ", " ", "")


def _split(text: str, size: int, seps: tuple[str, ...]) -> list[str]:
    if len(text) <= size:
        return [text]
    sep, rest = seps[0], seps[1:]
    if sep == "":
        return [text[i : i + size] for i in range(0, len(text), size)]
    pieces = text.split(sep)
    out: list[str] = []
    for i, piece in enumerate(pieces):
        part = piece + (sep if i < len(pieces) - 1 else "")
        if not part:
            continue
        if len(part) > size:
            out.extend(_split(part, size, rest))
        else:
            out.append(part)
    return out


def chunk_text(text: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> list[str]:
    """Split `text` into chunks of at most `chunk_size` chars with `chunk_overlap` carry-over."""
    if chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be smaller than chunk_size")
    text = text.replace("\r\n", "\n").strip()
    if not text:
        return []
    chunks: list[str] = []
    current = ""
    for piece in _split(text, chunk_size, _SEPARATORS):
        if current and len(current) + len(piece) > chunk_size:
            chunks.append(current.strip())
            tail = current[-chunk_overlap:] if chunk_overlap else ""
            # start the next chunk on a word boundary where possible
            if tail and " " in tail:
                tail = tail.split(" ", 1)[1]
            current = tail
            if len(current) + len(piece) > chunk_size:
                current = ""
        current += piece
    if current.strip():
        chunks.append(current.strip())
    return [c for c in chunks if c]
