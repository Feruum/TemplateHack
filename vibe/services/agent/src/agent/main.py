"""Optional local command-line client for the default RAG module."""

import asyncio
import sys

from langchain_core.messages import AIMessageChunk

from agent.core.agent import Agent
from agent.utils.logging import configure_logging, get_logger

logger = get_logger(__name__)


async def chat_loop():
    configure_logging()
    sys.stdout.write("Local document assistant. Type 'exit' to stop.\n")
    async with Agent("rag") as agent:
        while True:
            try:
                user_input = input("\nYou: ").strip()
                if user_input.casefold() in {"exit", "quit", "q"}:
                    sys.stdout.write("Goodbye!\n")
                    return
                if not user_input:
                    continue

                sys.stdout.write("\nAssistant: ")
                sys.stdout.flush()
                async for chunk in agent.astream(
                    user_input,
                    thread_id="local-cli",
                    user_id="local",
                ):
                    if not isinstance(chunk, tuple) or len(chunk) != 2:
                        continue
                    mode, data = chunk
                    if (
                        mode == "messages"
                        and isinstance(data, tuple)
                        and isinstance(data[0], AIMessageChunk)
                    ):
                        content = data[0].content
                        if isinstance(content, str):
                            sys.stdout.write(content)
                            sys.stdout.flush()
                sys.stdout.write("\n")
            except KeyboardInterrupt:
                sys.stdout.write("\nGoodbye!\n")
                return
            except Exception:
                logger.exception("local_cli_request_failed")
                sys.stdout.write("\nThe agent could not finish that request.\n")


def main():
    asyncio.run(chat_loop())


if __name__ == "__main__":
    main()
