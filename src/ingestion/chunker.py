from collections import Counter
from dataclasses import dataclass, field

from langchain_text_splitters import RecursiveCharacterTextSplitter

from src.config.settings import Settings
from src.ingestion.parser import ParsedDocument


@dataclass
class Chunk:
    text: str
    chunk_index: int
    page_number: int | None = None
    page_start: int | None = None
    page_end: int | None = None
    section_header: str = ""
    element_types: list[str] = field(default_factory=list)
    parent_chunk_index: int | None = None
    parent_chunk_text: str = ""
    metadata: dict = field(default_factory=dict)


def _build_annotated_text(doc: ParsedDocument):
    """Build full text with parallel tracking arrays for page, section, and element type."""
    full_text = ""
    char_to_page: list[int | None] = []
    char_to_section: list[str] = []
    char_to_element_type: list[str] = []

    for el in doc.elements:
        if full_text:
            full_text += "\n"
            char_to_page.append(char_to_page[-1] if char_to_page else None)
            char_to_section.append(char_to_section[-1] if char_to_section else "")
            char_to_element_type.append(
                char_to_element_type[-1] if char_to_element_type else ""
            )
        for ch in el.text:
            full_text += ch
            char_to_page.append(el.page_number)
            char_to_section.append(el.section_header)
            char_to_element_type.append(el.element_type)

    return full_text, char_to_page, char_to_section, char_to_element_type


def _get_page_range(
    pos: int, length: int, char_to_page: list[int | None]
) -> dict:
    """Determine page_number, page_start, page_end from character position."""
    pages: set[int] = set()
    if pos >= 0:
        for i in range(pos, min(pos + length, len(char_to_page))):
            if char_to_page[i] is not None:
                pages.add(char_to_page[i])
    page_list = sorted(pages) if pages else []
    page_number = page_list[0] if len(page_list) == 1 else None
    page_start = page_list[0] if page_list else None
    page_end = page_list[-1] if page_list else None
    return {
        "page_number": page_number if page_number else page_start,
        "page_start": page_start,
        "page_end": page_end,
    }


def _get_dominant_section(
    pos: int, length: int, char_to_section: list[str]
) -> str:
    """Get the most frequent section header in the character range."""
    sections = []
    if pos >= 0:
        for i in range(pos, min(pos + length, len(char_to_section))):
            if char_to_section[i]:
                sections.append(char_to_section[i])
    if not sections:
        return ""
    return Counter(sections).most_common(1)[0][0]


def _get_element_types(
    pos: int, length: int, char_to_element_type: list[str]
) -> list[str]:
    """Collect unique element types in the character range."""
    etypes: set[str] = set()
    if pos >= 0:
        for i in range(pos, min(pos + length, len(char_to_element_type))):
            if char_to_element_type[i]:
                etypes.add(char_to_element_type[i])
    return sorted(etypes)


def chunk_document(doc: ParsedDocument, settings: Settings) -> list[Chunk]:
    """Two-tier chunking: parent (synthesis) + child (retrieval) chunks.

    Child chunks are small for precise embedding.
    Each child stores its parent chunk text for richer LLM context during generation.
    """
    full_text, char_to_page, char_to_section, char_to_element_type = _build_annotated_text(doc)

    if not full_text.strip():
        return []

    separators = ["\n\n", "\n", ". ", " ", ""]

    # Parent (synthesis) chunks — large, for LLM context
    parent_splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.parent_chunk_size,
        chunk_overlap=settings.chunk_overlap,
        separators=separators,
    )
    parent_texts = parent_splitter.split_text(full_text)

    # Child (retrieval) chunks — small, for precise embeddings
    child_splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        separators=separators,
    )

    chunks = []
    chunk_idx = 0

    for parent_idx, parent_text in enumerate(parent_texts):
        child_texts = child_splitter.split_text(parent_text)

        for child_text in child_texts:
            # Find position in full text for metadata extraction
            pos = full_text.find(child_text)

            page_info = _get_page_range(pos, len(child_text), char_to_page)
            section = _get_dominant_section(pos, len(child_text), char_to_section)
            elem_types = _get_element_types(pos, len(child_text), char_to_element_type)

            chunks.append(
                Chunk(
                    text=child_text,
                    chunk_index=chunk_idx,
                    parent_chunk_index=parent_idx,
                    parent_chunk_text=parent_text,
                    section_header=section,
                    element_types=elem_types,
                    **page_info,
                )
            )
            chunk_idx += 1

    return chunks
