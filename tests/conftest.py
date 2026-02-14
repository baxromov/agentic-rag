import pytest


@pytest.fixture
def sample_text():
    return "This is a sample document text for testing purposes."


@pytest.fixture
def sample_chunks():
    return [
        {"text": "First chunk of text.", "metadata": {"page_number": 1, "chunk_index": 0}},
        {"text": "Second chunk of text.", "metadata": {"page_number": 1, "chunk_index": 1}},
        {"text": "Third chunk of text.", "metadata": {"page_number": 2, "chunk_index": 2}},
    ]
