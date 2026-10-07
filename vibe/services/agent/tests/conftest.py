"""Test configuration for isolated service tests."""

import os
import sys
from pathlib import Path

os.environ.setdefault("OTEL_SDK_DISABLED", "true")
os.environ["AGENT_DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["AGENT_ENVIRONMENT"] = "development"
os.environ["AGENT_KNOWLEDGE_BACKEND"] = "chroma"
os.environ["AGENT_REDIS_URL"] = ""

sys.path.append(str(Path(__file__).parent.parent / "src"))
