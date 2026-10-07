"""Immutable release metadata exposed by the service and telemetry."""

import os
from importlib.metadata import PackageNotFoundError, version


def _installed_version() -> str:
    try:
        return version("agent")
    except PackageNotFoundError:
        return "0.0.0-dev"


SERVICE_VERSION = os.getenv("SERVICE_VERSION", _installed_version())
GIT_COMMIT = os.getenv("GIT_COMMIT", "unknown")
BUILD_TIME = os.getenv("BUILD_TIME", "unknown")


def current_build_info(environment: str) -> dict[str, str]:
    return {
        "service": "agent",
        "version": SERVICE_VERSION,
        "commit": GIT_COMMIT,
        "built_at": BUILD_TIME,
        "environment": environment,
    }
