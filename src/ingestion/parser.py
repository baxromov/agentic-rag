import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from unstructured.partition.auto import partition


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

        raw_elements = partition(filename=tmp.name, languages=["eng", "rus"])

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
