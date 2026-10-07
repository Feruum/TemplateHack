# Agent Scaffold

A basic AI agent built with LangGraph and ChromaDB. It includes a CLI, an API server, and document ingestion tools.

## Quick Start

1.  **Install**
    ```bash
    pip install -e .
    ```

2.  **Config**
    ```bash
    cp .env.example .env
    ```

3.  **Ollama**
    Make sure you have `qwen3:4b` and `nomic-embed-text` pulled.

## Usage

Run the chat interface:
```bash
agent-cli
```

Ingest documents:
```bash
agent-ingest path/to/doc.pdf
```

Start the API:
```bash
agent-server
```
