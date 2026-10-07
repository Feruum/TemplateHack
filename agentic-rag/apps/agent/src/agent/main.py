"""Main entry point for the agent CLI."""

import asyncio


from agent.core.agent import Agent
from agent.utils.logging import configure_logging


async def chat_loop():
    """Interactive chat loop for the agent."""
    configure_logging()

    print("--- University Agentic RAG Scaffold ---")
    print("Type 'exit', 'quit', or 'q' to stop.")
    print("---------------------------------------")

    # Use the agent as an async context manager for proper lifecycle management
    async with Agent() as agent:
        while True:
            try:
                user_input = input("\nYou: ").strip()
                if user_input.lower() in ["exit", "quit", "q"]:
                    print("Goodbye!")
                    break

                if not user_input:
                    continue

                print("\nAssistant: ", end="", flush=True)

                full_response = ""
                # Use astream with stream_mode="values"
                async for state in agent.astream(user_input):
                    if "messages" in state:
                        messages = state["messages"]
                        if messages:
                            # The last message in the state is the most recent update
                            last_msg = messages[-1]
                            if last_msg.type == "ai":
                                full_response = last_msg.content

                    if "summary" in state and state["summary"]:
                        # Optionally show that LTM was updated
                        pass

                print(full_response)

            except KeyboardInterrupt:
                print("\nGoodbye!")
                break
            except Exception as e:
                print(f"\nError: {e}")


def main():
    """Run the interactive chat."""
    try:
        asyncio.run(chat_loop())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
