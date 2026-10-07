"""Logging configuration."""

import logging
import sys

import structlog
from opentelemetry import trace
from pythonjsonlogger import jsonlogger


def _add_trace_context(_, __, event_dict):
    span_context = trace.get_current_span().get_span_context()
    if span_context.is_valid:
        event_dict["trace_id"] = format(span_context.trace_id, "032x")
        event_dict["span_id"] = format(span_context.span_id, "016x")
    return event_dict


def configure_logging(level: str = "INFO"):
    """Configure structured logging.

    Args:
        level: Logging level.
    """
    # Standard library logging configuration
    root_log = logging.getLogger()
    root_log.setLevel(level)

    # Clear existing handlers
    for handler in root_log.handlers[:]:
        root_log.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)

    # Use JSON formatter if not a TTY (production behavior)
    if not sys.stdout.isatty():
        formatter = jsonlogger.JsonFormatter(
            fmt="%(timestamp)s %(level)s %(name)s %(message)s",
            rename_fields={"levelname": "level", "asctime": "timestamp"},
        )
        handler.setFormatter(formatter)

    root_log.addHandler(handler)

    # Structlog configuration
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            _add_trace_context,
            structlog.processors.add_log_level,
            structlog.processors.format_exc_info,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            (
                structlog.dev.ConsoleRenderer()
                if sys.stdout.isatty()
                else structlog.processors.JSONRenderer()
            ),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(level)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str):
    """Get a structured logger."""
    return structlog.get_logger(name)
