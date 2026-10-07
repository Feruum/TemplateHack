"""OpenTelemetry export and Deimos service instruments."""

from __future__ import annotations

import os
from typing import Any

from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.trace.sampling import ALWAYS_ON

from agent.build_info import GIT_COMMIT, SERVICE_VERSION
from agent.config.settings import settings

_configured = False

meter = metrics.get_meter("studyverse.agent")
http_requests = meter.create_counter(
    "agent.http.requests",
    unit="{request}",
    description="HTTP requests handled by Deimos",
)
http_duration = meter.create_histogram(
    "agent.http.server.duration",
    unit="s",
    description="HTTP server request duration",
)
stream_active = meter.create_up_down_counter(
    "agent.streams.active",
    unit="{stream}",
    description="Currently admitted Deimos streams",
)
stream_rejections = meter.create_counter(
    "agent.streams.rejected",
    unit="{request}",
    description="Stream admission rejections",
)
stream_ttft = meter.create_histogram(
    "agent.streams.time_to_first_token",
    unit="s",
    description="Time from stream generator start to first model token",
)
stream_duration = meter.create_histogram(
    "agent.streams.duration",
    unit="s",
    description="Accepted stream duration",
)
stream_output_chunks = meter.create_counter(
    "agent.streams.output_chunks",
    unit="{chunk}",
    description="Model output chunks emitted to clients",
)
stream_errors = meter.create_counter(
    "agent.streams.errors",
    unit="{error}",
    description="Accepted streams ending in an error",
)


def configure_observability() -> None:
    """Send traces and metrics to the internal OTLP Collector gateway."""
    global _configured
    if _configured or os.getenv("OTEL_SDK_DISABLED", "false").lower() == "true":
        return

    resource = Resource.create(
        attributes={
            "service.name": "agent",
            "service.version": SERVICE_VERSION,
            "service.instance.id": os.getenv("HOSTNAME", "unknown"),
            "deployment.environment.name": settings.environment,
            "vcs.ref.head.revision": GIT_COMMIT,
        }
    )

    # Sampling is performed at the Collector so errors and slow traces can be
    # retained after their final status and duration are known.
    trace_provider = TracerProvider(resource=resource, sampler=ALWAYS_ON)
    trace_provider.add_span_processor(
        BatchSpanProcessor(
            OTLPSpanExporter(
                endpoint=settings.otlp_endpoint,
                insecure=settings.otlp_insecure,
            )
        )
    )
    trace.set_tracer_provider(trace_provider)

    metric_reader = PeriodicExportingMetricReader(
        OTLPMetricExporter(
            endpoint=settings.otlp_endpoint,
            insecure=settings.otlp_insecure,
        ),
        export_interval_millis=30_000,
    )
    metrics.set_meter_provider(
        MeterProvider(resource=resource, metric_readers=[metric_reader])
    )
    _configured = True


def instrument_fastapi(app: Any) -> None:
    if os.getenv("OTEL_SDK_DISABLED", "false").lower() == "true":
        return
    FastAPIInstrumentor.instrument_app(app)


def get_tracer(name: str):
    return trace.get_tracer(name)


def record_http_request(
    method: str, route: str, status_code: int, duration: float
) -> None:
    attributes = {
        "http.request.method": method,
        "http.route": route,
        "http.response.status_code": status_code,
    }
    http_requests.add(1, attributes)
    http_duration.record(duration, attributes)


def record_stream_admitted() -> None:
    stream_active.add(1)


def record_stream_finished(duration: float, *, model: str, error: bool) -> None:
    attributes = {"gen_ai.request.model": model}
    stream_active.add(-1)
    stream_duration.record(duration, attributes)
    if error:
        stream_errors.add(1, attributes)


def record_stream_rejected(reason: str) -> None:
    stream_rejections.add(1, {"reason": reason})


def record_first_token(duration: float, model: str) -> None:
    stream_ttft.record(duration, {"gen_ai.request.model": model})


def record_output_chunk(model: str) -> None:
    stream_output_chunks.add(1, {"gen_ai.request.model": model})
