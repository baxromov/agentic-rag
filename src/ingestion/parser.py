import base64
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

from unstructured.partition.auto import partition

if TYPE_CHECKING:
    from langchain_core.language_models.chat_models import BaseChatModel


@dataclass
class ParsedElement:
    text: str
    page_number: int | None = None
    element_type: str = ""
    section_header: str = ""
    metadata: dict = field(default_factory=dict)


@dataclass
class ParsedDocument:
    elements: list[ParsedElement]
    file_type: str
    source: str


SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".doc", ".csv", ".html", ".htm", ".md", ".txt", ".xlsx"}


def parse_document(file_bytes: bytes, filename: str) -> ParsedDocument:
    """Parse a document file into structured elements with page numbers."""
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported file type: {ext}. Supported: {SUPPORTED_EXTENSIONS}")

    file_type = ext.lstrip(".")

    with tempfile.NamedTemporaryFile(suffix=ext, delete=True) as tmp:
        tmp.write(file_bytes)
        tmp.flush()

        # Use ocr_only for PDFs to force Tesseract OCR (scanned docs get garbled
        # text with the default "auto" strategy which uses pdfminer text extraction).
        # For other file types, use auto strategy.
        strategy = "ocr_only" if ext == ".pdf" else "auto"

        raw_elements = partition(
            filename=tmp.name,
            strategy=strategy,
            languages=["rus", "uzb_cyrl", "uzb", "eng"],
        )

    elements = []
    current_section_header = ""
    _header_types = {"Title", "Header"}

    for el in raw_elements:
        text = str(el).strip()
        if not text:
            continue
        element_type = type(el).__name__
        page_number = getattr(el.metadata, "page_number", None) if hasattr(el, "metadata") else None

        # Update section header when we encounter a Title or Header element
        if element_type in _header_types:
            current_section_header = text

        elements.append(
            ParsedElement(
                text=text,
                page_number=page_number,
                element_type=element_type,
                section_header=current_section_header,
            )
        )

    return ParsedDocument(elements=elements, file_type=file_type, source=filename)


async def parse_document_llm(
    file_bytes: bytes, filename: str, llm: "BaseChatModel"
) -> ParsedDocument:
    """Parse a document using LLM for text extraction and structuring."""
    from langchain_core.messages import HumanMessage, SystemMessage

    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported file type: {ext}. Supported: {SUPPORTED_EXTENSIONS}")

    file_type = ext.lstrip(".")

    # First extract raw text with unstructured (fast, no OCR)
    with tempfile.NamedTemporaryFile(suffix=ext, delete=True) as tmp:
        tmp.write(file_bytes)
        tmp.flush()
        raw_elements = partition(filename=tmp.name, strategy="auto")

    raw_text = "\n".join(str(el).strip() for el in raw_elements if str(el).strip())

    if not raw_text:
        return ParsedDocument(elements=[], file_type=file_type, source=filename)

    # Use LLM to clean and structure the extracted text
    system_prompt = (
        "You are a document parser. Clean and structure the following raw text extracted from a document. "
        "Fix encoding issues, correct OCR errors, and return the text as clean paragraphs separated by blank lines. "
        "Do NOT summarize — return the full content, just cleaned up. "
        "Return ONLY the cleaned text, nothing else."
    )

    # Process in chunks to stay within LLM context limits
    chunk_size = 4000
    text_chunks = [raw_text[i : i + chunk_size] for i in range(0, len(raw_text), chunk_size)]

    cleaned_parts: list[str] = []
    for part in text_chunks:
        response = await llm.ainvoke(
            [SystemMessage(content=system_prompt), HumanMessage(content=part)]
        )
        cleaned_parts.append(response.content.strip())

    cleaned_text = "\n\n".join(cleaned_parts)

    # Build ParsedElements from cleaned paragraphs
    elements: list[ParsedElement] = []
    current_section_header = ""
    for paragraph in cleaned_text.split("\n\n"):
        text = paragraph.strip()
        if not text:
            continue
        # Heuristic: short ALL-CAPS or title-case lines are headers
        is_header = len(text) < 100 and (text.isupper() or (text.istitle() and "\n" not in text))
        element_type = "Title" if is_header else "NarrativeText"
        if is_header:
            current_section_header = text
        elements.append(
            ParsedElement(
                text=text,
                page_number=None,
                element_type=element_type,
                section_header=current_section_header,
            )
        )

    return ParsedDocument(elements=elements, file_type=file_type, source=filename)
