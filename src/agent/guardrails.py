"""Input/output guardrails for security and safety."""

import re
from typing import Any


class GuardrailViolation(Exception):
    """Raised when a guardrail check fails."""

    pass


def validate_input(query: str, max_length: int = 2000) -> dict[str, Any]:
    """
    Validate user input before processing.

    Args:
        query: User's query
        max_length: Maximum allowed query length

    Returns:
        Dictionary with validation results and potentially masked query

    Raises:
        GuardrailViolation: If critical validation fails
    """
    warnings = []
    masked_query = query

    # 1. Check query length
    if not query or len(query.strip()) == 0:
        raise GuardrailViolation("Query cannot be empty")

    if len(query) > max_length:
        raise GuardrailViolation(f"Query too long (max {max_length} characters, got {len(query)})")

    # 2. Detect prompt injection attempts
    if detect_prompt_injection(query):
        raise GuardrailViolation(
            "Potential prompt injection detected. Please rephrase your question."
        )

    # 3. Check for PII and mask if found
    pii_found, masked_query = mask_pii(query)
    if pii_found:
        warnings.append("PII detected and masked in query")

    # 4. Check for malicious patterns
    if detect_malicious_patterns(query):
        raise GuardrailViolation(
            "Query contains potentially harmful content. Please rephrase your question."
        )

    return {
        "original_query": query,
        "masked_query": masked_query,
        "warnings": warnings,
        "passed": True,
    }


def detect_prompt_injection(text: str) -> bool:
    """
    Detect potential prompt injection attempts.

    Args:
        text: Input text to check

    Returns:
        True if prompt injection is suspected
    """
    text_lower = text.lower()

    # Common prompt injection patterns
    injection_patterns = [
        # System prompt manipulation
        r"ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|commands)",
        r"disregard\s+(all\s+)?(previous|above|prior)",
        r"forget\s+(all\s+)?(previous|above|prior)",
        r"new\s+instructions?:",
        r"system\s*:",
        r"assistant\s*:",
        r"###\s*instruction",
        # Role manipulation
        r"you\s+are\s+now",
        r"act\s+as\s+(a\s+)?(?!assistant)",
        r"pretend\s+to\s+be",
        r"roleplay\s+as",
        # Jailbreak attempts
        r"jailbreak",
        r"dan\s+mode",
        r"developer\s+mode",
        # Prompt leaking
        r"what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions)",
        r"show\s+me\s+your\s+(system\s+)?(prompt|instructions)",
        r"repeat\s+(your\s+)?(system\s+)?(prompt|instructions)",
    ]

    for pattern in injection_patterns:
        if re.search(pattern, text_lower):
            return True

    # Check for excessive special characters (might indicate encoding attacks)
    # Use \w to support Unicode letters (Cyrillic, Latin, etc.)
    special_char_ratio = len(re.findall(r"[^\w\s.,!?'\"-]", text)) / max(len(text), 1)
    if special_char_ratio > 0.4:
        return True

    return False


def mask_pii(text: str) -> tuple[bool, str]:
    """
    Detect and mask personally identifiable information (PII).

    Args:
        text: Input text

    Returns:
        Tuple of (pii_found, masked_text)
    """
    pii_found = False
    masked = text

    # Email addresses
    email_pattern = r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"
    if re.search(email_pattern, masked):
        masked = re.sub(email_pattern, "[EMAIL]", masked)
        pii_found = True

    # Phone numbers (various formats)
    phone_patterns = [
        r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b",  # 123-456-7890
        r"\b\(\d{3}\)\s?\d{3}[-.]?\d{4}\b",  # (123) 456-7890
        r"\b\+\d{1,3}\s?\d{9,}\b",  # +1 1234567890
    ]
    for pattern in phone_patterns:
        if re.search(pattern, masked):
            masked = re.sub(pattern, "[PHONE]", masked)
            pii_found = True

    # Credit card numbers (basic pattern)
    cc_pattern = r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b"
    if re.search(cc_pattern, masked):
        masked = re.sub(cc_pattern, "[CREDIT_CARD]", masked)
        pii_found = True

    # Social Security Numbers (US format)
    ssn_pattern = r"\b\d{3}-\d{2}-\d{4}\b"
    if re.search(ssn_pattern, masked):
        masked = re.sub(ssn_pattern, "[SSN]", masked)
        pii_found = True

    # IP addresses
    ip_pattern = r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b"
    if re.search(ip_pattern, masked):
        # Only mask if it looks like a real IP (not dates or version numbers)
        potential_ips = re.findall(ip_pattern, masked)
        for ip in potential_ips:
            parts = [int(p) for p in ip.split(".")]
            if all(0 <= p <= 255 for p in parts):
                masked = masked.replace(ip, "[IP_ADDRESS]")
                pii_found = True

    return pii_found, masked


def detect_malicious_patterns(text: str) -> bool:
    """
    Detect potentially malicious content patterns.

    Args:
        text: Input text to check

    Returns:
        True if malicious patterns detected
    """
    text_lower = text.lower()

    # SQL injection attempts
    sql_patterns = [
        r";\s*drop\s+table",
        r";\s*delete\s+from",
        r"union\s+select",
        r"1\s*=\s*1",
        r"'\s*or\s*'1'\s*=\s*'1",
    ]

    for pattern in sql_patterns:
        if re.search(pattern, text_lower):
            return True

    # Command injection attempts
    command_patterns = [
        r";\s*rm\s+-rf",
        r"&&\s*rm\s+",
        r"\|\s*bash",
        r"`.*`",  # Backtick command execution
        r"\$\(.*\)",  # Command substitution
    ]

    for pattern in command_patterns:
        if re.search(pattern, text):
            return True

    return False


def validate_output(
    response: str, validation_result: dict[str, Any], strict: bool = False
) -> dict[str, Any]:
    """
    Validate LLM output before returning to user.

    Args:
        response: Generated response
        validation_result: Result from validators.validate_generation
        strict: If True, reject low-confidence responses

    Returns:
        Dictionary with validation results and potentially modified response

    Raises:
        GuardrailViolation: If strict mode and validation fails
    """
    warnings = validation_result.get("validation_warnings", [])

    # Check confidence threshold in strict mode
    confidence = validation_result.get("confidence", 0.0)
    if strict and confidence < 0.3:
        raise GuardrailViolation(
            "Response confidence too low. Unable to generate reliable answer from available sources."
        )

    # Check for PII in response
    pii_found, masked_response = mask_pii(response)
    if pii_found:
        warnings.append("PII detected and masked in response")
        response = masked_response

    # Check for potential data leakage (system prompts, internal info)
    if detect_data_leakage(response):
        raise GuardrailViolation("Response contains potentially sensitive system information")

    return {
        "response": response,
        "confidence": confidence,
        "warnings": warnings,
        "validation_passed": validation_result.get("validation_passed", True),
    }


def detect_data_leakage(text: str) -> bool:
    """
    Detect potential leakage of system information in responses.

    Args:
        text: Response text to check

    Returns:
        True if data leakage detected
    """
    text_lower = text.lower()

    leakage_patterns = [
        r"system\s+prompt",
        r"my\s+instructions\s+(are|were)",
        r"i\s+was\s+told\s+to",
        r"langchain",
        r"langgraph",
        r"anthropic",
        r"openai",
        r"api\s+key",
        r"secret\s+key",
        r"password",
    ]

    for pattern in leakage_patterns:
        if re.search(pattern, text_lower):
            return True

    return False


def apply_input_guardrails(state: dict[str, Any]) -> dict[str, Any]:
    """
    Apply input guardrails to agent state.

    This can be used as a preprocessing step before the agent runs.

    Args:
        state: Agent state dictionary

    Returns:
        Updated state with guardrail results

    Raises:
        GuardrailViolation: If input validation fails
    """
    query = state.get("query", "")

    # Validate and potentially mask query
    result = validate_input(query)

    # Use masked query if PII was found
    if result["masked_query"] != query:
        state["query"] = result["masked_query"]

    # Add guardrail metadata
    state["input_guardrails"] = {
        "passed": result["passed"],
        "warnings": result["warnings"],
        "pii_masked": result["masked_query"] != query,
    }

    return state
