"""Structured logging and telemetry for observability."""
import json
import logging
import sys
import time
from contextvars import ContextVar
from dataclasses import asdict, dataclass, field
from typing import Any

# Context variable for request tracking
request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)


@dataclass
class RetrievalMetrics:
    """Metrics for the retrieval pipeline."""

    query_length: int
    query_language: str | None = None
    initial_doc_count: int = 0
    reranked_doc_count: int = 0
    graded_doc_count: int = 0
    rewrite_count: int = 0
    retrieval_latency_ms: int = 0
    rerank_latency_ms: int = 0
    grading_latency_ms: int = 0
    generation_latency_ms: int = 0
    total_latency_ms: int = 0
    tokens_used: int = 0
    tokens_available: int = 0
    token_utilization: float = 0.0


@dataclass
class AgentMetrics:
    """Overall agent execution metrics."""

    request_id: str | None = None
    thread_id: str | None = None
    user_id: str | None = None
    query: str = ""
    filters: dict | None = None
    runtime_context: dict | None = None
    retrieval: RetrievalMetrics | None = None
    validation_confidence: float = 0.0
    validation_warnings: list[str] = field(default_factory=list)
    guardrail_warnings: list[str] = field(default_factory=list)
    success: bool = True
    error_message: str | None = None
    total_duration_ms: int = 0
    timestamp: float = field(default_factory=time.time)


class StructuredLogger:
    """JSON structured logger for production observability."""

    def __init__(self, name: str = "rag_agent"):
        self.logger = logging.getLogger(name)
        self._setup_logger()

    def _setup_logger(self):
        """Configure structured JSON logging."""
        if not self.logger.handlers:
            handler = logging.StreamHandler(sys.stdout)
            handler.setFormatter(StructuredFormatter())
            self.logger.addHandler(handler)
            self.logger.setLevel(logging.INFO)
            self.logger.propagate = False

    def info(self, event: str, **kwargs):
        """Log info level event with structured data."""
        self._log(logging.INFO, event, **kwargs)

    def error(self, event: str, **kwargs):
        """Log error level event with structured data."""
        self._log(logging.ERROR, event, **kwargs)

    def warning(self, event: str, **kwargs):
        """Log warning level event with structured data."""
        self._log(logging.WARNING, event, **kwargs)

    def debug(self, event: str, **kwargs):
        """Log debug level event with structured data."""
        self._log(logging.DEBUG, event, **kwargs)

    def _log(self, level: int, event: str, **kwargs):
        """Internal logging with context."""
        # Add request ID from context if available
        request_id = request_id_ctx.get()
        if request_id:
            kwargs["request_id"] = request_id

        # Add timestamp
        kwargs["timestamp"] = time.time()
        kwargs["event"] = event

        # Convert dataclasses to dicts
        for key, value in kwargs.items():
            if hasattr(value, "__dataclass_fields__"):
                kwargs[key] = asdict(value)

        self.logger.log(level, json.dumps(kwargs, default=str))


class StructuredFormatter(logging.Formatter):
    """Custom formatter that outputs structured JSON logs."""

    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON."""
        try:
            # If message is already JSON, parse and enhance it
            log_data = json.loads(record.getMessage())
        except (json.JSONDecodeError, ValueError):
            # If not JSON, create structured log
            log_data = {"message": record.getMessage()}

        # Add standard fields
        log_data["level"] = record.levelname
        log_data["logger"] = record.name

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_data, default=str)


# Global logger instance
logger = StructuredLogger()


class Timer:
    """Context manager for timing operations."""

    def __init__(self, name: str):
        self.name = name
        self.start_time = 0
        self.elapsed_ms = 0

    def __enter__(self):
        self.start_time = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.elapsed_ms = int((time.time() - self.start_time) * 1000)
        if exc_type is None:
            logger.info(
                f"{self.name}_completed",
                operation=self.name,
                latency_ms=self.elapsed_ms,
            )
        else:
            logger.error(
                f"{self.name}_failed",
                operation=self.name,
                latency_ms=self.elapsed_ms,
                error=str(exc_val),
            )
        return False  # Don't suppress exceptions


def log_retrieval(
    query: str,
    doc_count: int,
    latency_ms: int,
    query_language: str | None = None,
    filters: dict | None = None,
):
    """Log retrieval operation."""
    logger.info(
        "retrieval_completed",
        query_length=len(query),
        query_language=query_language,
        doc_count=doc_count,
        latency_ms=latency_ms,
        filters_applied=bool(filters),
    )


def log_rerank(original_count: int, reranked_count: int, latency_ms: int):
    """Log reranking operation."""
    logger.info(
        "rerank_completed",
        original_count=original_count,
        reranked_count=reranked_count,
        latency_ms=latency_ms,
    )


def log_grading(
    initial_count: int,
    graded_count: int,
    latency_ms: int,
    batch_mode: bool = True,
):
    """Log document grading operation."""
    logger.info(
        "grading_completed",
        initial_count=initial_count,
        graded_count=graded_count,
        filtered_count=initial_count - graded_count,
        latency_ms=latency_ms,
        batch_mode=batch_mode,
    )


def log_generation(
    query: str,
    doc_count: int,
    latency_ms: int,
    tokens_used: int | None = None,
    confidence: float | None = None,
    validation_warnings: list[str] | None = None,
):
    """Log answer generation operation."""
    logger.info(
        "generation_completed",
        query_length=len(query),
        doc_count=doc_count,
        latency_ms=latency_ms,
        tokens_used=tokens_used,
        confidence=confidence,
        has_warnings=bool(validation_warnings),
        warning_count=len(validation_warnings) if validation_warnings else 0,
    )


def log_agent_execution(metrics: AgentMetrics):
    """Log complete agent execution with all metrics."""
    logger.info(
        "agent_execution_completed",
        **asdict(metrics),
    )


def log_api_request(
    method: str,
    path: str,
    query_params: dict | None = None,
    latency_ms: int | None = None,
    status_code: int | None = None,
):
    """Log API request."""
    logger.info(
        "api_request",
        method=method,
        path=path,
        query_params=query_params,
        latency_ms=latency_ms,
        status_code=status_code,
    )


def log_error(error_type: str, error_message: str, **context):
    """Log error with context."""
    logger.error(
        "error_occurred",
        error_type=error_type,
        error_message=error_message,
        **context,
    )
