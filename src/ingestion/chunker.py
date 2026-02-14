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
    metadata: dict = field(default_factory=dict)


def chunk_document(doc: ParsedDocument, settings: Settings) -> list[Chunk]:
    """Split parsed document into chunks, preserving page attribution."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    # Group contiguous elements by page
    page_texts: list[tuple[str, int | None]] = []
    for el in doc.elements:
        page_texts.append((el.text, el.page_number))

    # Concatenate all text with page boundary markers
    full_text = ""
    char_to_page: list[int | None] = []
    for text, page in page_texts:
        if full_text:
            full_text += "\n"
            char_to_page.append(char_to_page[-1] if char_to_page else None)
        for ch in text:
            full_text += ch
            char_to_page.append(page)

    if not full_text.strip():
        return []

    # Split
    text_chunks = splitter.split_text(full_text)

    chunks = []
    search_start = 0
    for idx, chunk_text in enumerate(text_chunks):
        # Find chunk position in the full text
        pos = full_text.find(chunk_text, search_start)
        if pos == -1:
            pos = full_text.find(chunk_text)
        if pos >= 0:
            search_start = pos

        # Determine page range
        pages_in_chunk: set[int] = set()
        if pos >= 0:
            for i in range(pos, min(pos + len(chunk_text), len(char_to_page))):
                if char_to_page[i] is not None:
                    pages_in_chunk.add(char_to_page[i])

        page_list = sorted(pages_in_chunk) if pages_in_chunk else []
        page_number = page_list[0] if len(page_list) == 1 else None
        page_start = page_list[0] if page_list else None
        page_end = page_list[-1] if page_list else None

        chunks.append(
            Chunk(
                text=chunk_text,
                chunk_index=idx,
                page_number=page_number if page_number else page_start,
                page_start=page_start,
                page_end=page_end,
            )
        )

    return chunks
