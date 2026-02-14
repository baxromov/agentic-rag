"""Response validation and quality assessment."""
import re
from typing import Any


def validate_generation(response: str, documents: list[dict], query: str) -> dict[str, Any]:
    """
    Validate LLM response quality and detect potential issues.

    Args:
        response: Generated answer from LLM
        documents: Source documents used for generation
        query: Original user query

    Returns:
        Dictionary with validation results and metadata
    """
    if not response or len(response.strip()) < 10:
        return {
            "generation": response,
            "confidence": 0.0,
            "is_generic": True,
            "has_citations": False,
            "contradicts_sources": False,
            "validation_passed": False,
            "validation_warnings": ["Response too short or empty"],
        }

    warnings = []

    # 1. Check for generic non-answers
    generic_patterns = [
        r"i don't know",
        r"i cannot answer",
        r"no information",
        r"not enough information",
        r"unable to answer",
        r"i don't have.*information",
    ]
    is_generic = any(re.search(pattern, response.lower()) for pattern in generic_patterns)
    if is_generic:
        warnings.append("Response appears generic or non-committal")

    # 2. Calculate confidence based on document overlap
    confidence = calculate_document_overlap_confidence(response, documents)

    # 3. Check for citation patterns
    has_citations = check_citations(response)
    if not has_citations and documents:
        warnings.append("No citations found despite having source documents")

    # 4. Detect potential contradictions (basic check)
    contradicts_sources = detect_contradictions(response, documents)
    if contradicts_sources:
        warnings.append("Response may contradict source documents")

    # 5. Overall validation
    validation_passed = (
        confidence > 0.3
        and not contradicts_sources
        and (has_citations or not documents)  # Citations not required if no docs
    )

    return {
        "generation": response,
        "confidence": confidence,
        "is_generic": is_generic,
        "has_citations": has_citations,
        "contradicts_sources": contradicts_sources,
        "validation_passed": validation_passed,
        "validation_warnings": warnings,
    }


def calculate_document_overlap_confidence(response: str, documents: list[dict]) -> float:
    """
    Calculate confidence score based on word overlap with source documents.

    Higher overlap = higher confidence that response is grounded in sources.

    Args:
        response: Generated answer
        documents: Source documents

    Returns:
        Confidence score between 0.0 and 1.0
    """
    if not documents:
        # No documents means we can't verify grounding
        return 0.5

    # Extract meaningful words (lowercase, remove punctuation)
    response_words = set(re.findall(r"\b\w{4,}\b", response.lower()))
    if not response_words:
        return 0.0

    # Combine all document text
    doc_text = " ".join(d.get("text", "") for d in documents)
    doc_words = set(re.findall(r"\b\w{4,}\b", doc_text.lower()))

    if not doc_words:
        return 0.0

    # Calculate overlap
    overlap = len(response_words & doc_words)
    total_response_words = len(response_words)

    # Confidence = percentage of response words found in documents
    overlap_ratio = overlap / total_response_words if total_response_words > 0 else 0.0

    # Scale to 0-1 range (30%+ overlap = high confidence)
    confidence = min(overlap_ratio / 0.3, 1.0)

    return round(confidence, 2)


def check_citations(response: str) -> bool:
    """
    Check if response contains citation patterns.

    Args:
        response: Generated answer

    Returns:
        True if citations are present
    """
    citation_patterns = [
        r"\[\d+\]",  # [1], [2], etc.
        r"\(page \d+\)",  # (page 3)
        r"\(pages \d+-\d+\)",  # (pages 3-5)
        r"according to",
        r"as stated in",
        r"the document mentions",
        r"page \d+ states",
    ]

    return any(re.search(pattern, response.lower()) for pattern in citation_patterns)


def detect_contradictions(response: str, documents: list[dict]) -> bool:
    """
    Detect potential contradictions between response and source documents.

    This is a basic heuristic check - in production, you'd use an LLM for this.

    Args:
        response: Generated answer
        documents: Source documents

    Returns:
        True if potential contradictions detected
    """
    # Basic negation detection
    # If response uses strong negatives but documents don't mention them, flag it
    strong_negations = [
        r"\bnot\b",
        r"\bno\b",
        r"\bnever\b",
        r"\bdoes not\b",
        r"\bcannot\b",
        r"\bimpossible\b",
    ]

    response_lower = response.lower()
    has_negation = any(re.search(pattern, response_lower) for pattern in strong_negations)

    if not has_negation or not documents:
        return False

    # Check if documents support the negation
    doc_text = " ".join(d.get("text", "") for d in documents).lower()

    # If response says "not/no/never" but appears very different from docs, flag it
    # This is a very basic check - in production, use semantic similarity
    response_words = set(re.findall(r"\b\w{5,}\b", response_lower))
    doc_words = set(re.findall(r"\b\w{5,}\b", doc_text))

    if response_words and doc_words:
        overlap = len(response_words & doc_words) / len(response_words)
        # If overlap is very low and we have negations, it might be a contradiction
        if overlap < 0.1:
            return True

    return False


def add_confidence_warning(response: str, confidence: float) -> str:
    """
    Add a confidence warning to low-confidence responses.

    Args:
        response: Generated answer
        confidence: Confidence score (0.0-1.0)

    Returns:
        Response with warning prepended if confidence is low
    """
    if confidence < 0.3:
        return f"⚠️ [Low confidence] {response}"
    elif confidence < 0.5:
        return f"ℹ️ [Moderate confidence] {response}"
    return response
