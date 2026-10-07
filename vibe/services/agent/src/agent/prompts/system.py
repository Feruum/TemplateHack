"""Prompt factory used by module-specific agents."""

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder


def get_agent_prompt(instructions: str) -> ChatPromptTemplate:
    return ChatPromptTemplate.from_messages(
        [
            ("system", instructions),
            MessagesPlaceholder(variable_name="messages"),
        ]
    )
