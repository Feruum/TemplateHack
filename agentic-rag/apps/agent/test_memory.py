import pytest
from agent.memory import AgentMemory

pytestmark = pytest.mark.integration


def test_memory():
    mem = AgentMemory()

    user_id = "test_user_123"
    mem.add("My name is Lain.", user_id=user_id)

    results = mem.search("What is my name?", user_id=user_id)

    found = any("Lain" in r.get("memory", "") for r in results)

    assert found


if __name__ == "__main__":
    test_memory()
