import asyncio
import json
import time
from contextlib import suppress

import structlog
from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from langchain_core.messages import BaseMessage, AIMessageChunk

from agent.core.agent import Agent
from agent.config.settings import settings
from agent.utils.rate_limit import limiter
from agent.knowledge import get_knowledge_index
from agent.memory.mem0_client import AgentMemory
from agent.server_auth import get_current_user, UserProfile
from agent.infrastructure.thread_ownership import (
    ensure_thread_ownership,
    check_thread_access,
)
from agent.infrastructure.stream_admission import AdmissionRejected, StreamLease
from agent.utils.observability import (
    record_first_token,
    record_output_chunk,
    record_stream_admitted,
    record_stream_finished,
    record_stream_rejected,
)

router = APIRouter(prefix="/api/v1", tags=["api-v1"])
logger = structlog.get_logger(__name__)


class ModelInfo(BaseModel):
    id: str = Field(..., description="Model identifier")
    name: str = Field(..., description="Human-readable model name")
    context_window: int = Field(..., description="Maximum context window in tokens")
    max_output: int = Field(..., description="Maximum output tokens")
    input_cost_per_1m: float = Field(..., description="Cost per 1M input tokens (USD)")
    output_cost_per_1m: float = Field(
        ..., description="Cost per 1M output tokens (USD)"
    )
    tier: str = Field(..., description="Pricing tier: free or paid")
    capabilities: list[str] = Field(
        default_factory=list,
        description="Model capabilities: chat, reasoning, vision, code",
    )


class ModelsResponse(BaseModel):
    models: list[ModelInfo]
    default_model: str


class CurrentModelResponse(BaseModel):
    model: ModelInfo
    temperature: float
    max_tokens: int


class ChatMessage(BaseModel):
    type: str = Field(..., description="Message type: human or assistant")
    content: str = Field(
        ..., min_length=1, max_length=32000, description="Message content"
    )


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(
        ..., min_length=1, max_length=50, description="Conversation messages"
    )
    model: str | None = Field(
        None, max_length=128, description="Model to use (optional, uses default)"
    )
    thread_id: str | None = Field(
        None, max_length=128, description="Thread ID for conversation persistence"
    )
    user_id: str | None = Field(
        None,
        max_length=128,
        description="Deprecated compatibility field; authenticated identity is authoritative",
    )


class ThreadHistoryResponse(BaseModel):
    thread_id: str
    messages: list[dict]


class TokenizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=64000)


class TokenizeResponse(BaseModel):
    tokens: int
    model: str


class CollectionStats(BaseModel):
    name: str = Field(..., description="Collection name")
    count: int = Field(..., description="Number of documents in collection")


class ChromaStats(BaseModel):
    collections: list[CollectionStats] = Field(..., description="List of collections")
    total_documents: int = Field(
        ..., description="Total documents across all collections"
    )
    sources: list[str] = Field(..., description="Unique document sources")


class Mem0Stats(BaseModel):
    available: bool = Field(..., description="Whether Mem0 is available")
    users_with_memories: int = Field(0, description="Number of users with memories")


class StorageStatsResponse(BaseModel):
    chroma: ChromaStats
    knowledge: ChromaStats | None = None
    mem0: Mem0Stats


def serialize_for_json(obj):
    if isinstance(obj, BaseMessage):
        return obj.model_dump()
    if isinstance(obj, dict):
        return {k: serialize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [serialize_for_json(item) for item in obj]
    return obj


def _extract_message_chunks(chunk: AIMessageChunk) -> list[tuple[str, str]]:
    results = []

    def append_text(event_type: str, value: object) -> None:
        if isinstance(value, str) and value:
            results.append((event_type, value))

    additional_kwargs = getattr(chunk, "additional_kwargs", {}) or {}
    append_text("thinking", additional_kwargs.get("reasoning_content"))
    append_text("thinking", additional_kwargs.get("reasoning"))

    content = chunk.content
    if isinstance(content, str):
        append_text("token", content)
        return results

    if isinstance(content, list):
        for block in content:
            if not isinstance(block, dict):
                continue
            block_type = block.get("type", "")
            if block_type in {"thinking", "reasoning"}:
                thinking_parts = block.get("thinking")
                if isinstance(thinking_parts, list):
                    for sub in thinking_parts:
                        if isinstance(sub, dict):
                            text = sub.get("text", "")
                            append_text("thinking", text)
                else:
                    append_text("thinking", block.get("text"))
                    append_text("thinking", block.get("reasoning"))
                    append_text("thinking", block.get("reasoning_content"))
                    append_text("thinking", thinking_parts)
            elif block_type == "text":
                text = block.get("text", "")
                append_text("token", text)
    return results


def model_to_info(model_id: str) -> ModelInfo:
    # No NVIDIA_MODELS hard dep; generic defaults for OpenAI-compatible
    return ModelInfo(
        id=model_id,
        name=model_id.replace("-", " ").title(),
        context_window=128000,
        max_output=4096,
        input_cost_per_1m=0.0,
        output_cost_per_1m=0.0,
        tier="free",
        capabilities=["chat"],
    )


@router.get("/models", response_model=ModelsResponse)
@limiter.limit("60/minute")
async def list_models(request: Request):
    available = settings.get_available_models()
    models = [model_to_info(m) for m in available]
    return ModelsResponse(models=models, default_model=settings.llm_model)


@router.get("/models/current", response_model=CurrentModelResponse)
@limiter.limit("60/minute")
async def get_current_model(request: Request):
    return CurrentModelResponse(
        model=model_to_info(settings.llm_model),
        temperature=settings.llm_temperature,
        max_tokens=settings.llm_max_tokens,
    )


@router.get("/models/{model_id}", response_model=ModelInfo)
@limiter.limit("60/minute")
async def get_model_info(request: Request, model_id: str):
    # Allow any model (no hard NVIDIA_MODELS list)
    return model_to_info(model_id)


@router.post("/chat/stream")
@limiter.limit(settings.rate_limit_per_user)
async def stream_chat(
    request: Request,
    body: ChatRequest,
    user: UserProfile = Depends(get_current_user),
):
    if not body.messages:
        return StreamingResponse(
            iter(
                [
                    f"event: error\ndata: {json.dumps({'error': 'No messages provided'})}\n\n"
                ]
            ),
            media_type="text/event-stream",
        )

    message_content = None
    for msg in reversed(body.messages):
        if msg.type == "human":
            message_content = msg.content
            break

    if not message_content:
        return StreamingResponse(
            iter(
                [
                    f"event: error\ndata: {json.dumps({'error': 'No human message found'})}\n\n"
                ]
            ),
            media_type="text/event-stream",
        )

    thread_id = body.thread_id or request.headers.get("X-Thread-ID") or "default"
    # Keep the legacy request field for wire compatibility, but identity always
    # comes from the authenticated principal and can no longer be spoofed.
    user_id = user.user_id
    model = body.model or settings.llm_model

    if not await ensure_thread_ownership(thread_id, user_id):
        raise HTTPException(status_code=403, detail="Thread access denied")

    try:
        lease = await request.app.state.stream_admission.acquire(user_id)
    except AdmissionRejected as error:
        record_stream_rejected(error.reason)
        logger.warning(
            "stream_admission_rejected",
            user_id=user_id,
            reason=error.reason,
        )
        raise HTTPException(
            status_code=429,
            detail={
                "code": "STREAM_CAPACITY_EXCEEDED",
                "message": "Deimos is at streaming capacity; retry shortly",
            },
            headers={"Retry-After": str(error.retry_after_seconds)},
        ) from error

    record_stream_admitted()
    if model != settings.llm_model:
        return await _stream_response_with_custom_model(
            model, message_content, thread_id, user_id, lease
        )
    else:
        agent: Agent = request.app.state.agent
        return await _stream_response(agent, message_content, thread_id, user_id, lease)


async def _stream_response(
    agent: Agent,
    message: str,
    thread_id: str,
    user_id: str,
    lease: StreamLease,
) -> StreamingResponse:
    async def event_generator():
        stream_started = time.perf_counter()
        first_token_recorded = False
        stream_failed = False
        lease_lost = asyncio.Event()
        heartbeat = asyncio.create_task(lease.heartbeat(lease_lost))
        try:
            async for chunk in agent.astream(message, thread_id, user_id):
                if lease_lost.is_set():
                    raise RuntimeError("stream admission lease lost")
                if isinstance(chunk, tuple) and len(chunk) == 2:
                    mode, data = chunk
                    if mode == "messages":
                        msg_chunk, _metadata = data
                        if isinstance(msg_chunk, AIMessageChunk):
                            for event_type, text in _extract_message_chunks(msg_chunk):
                                if event_type == "token":
                                    record_output_chunk(agent.model_name)
                                    if not first_token_recorded:
                                        record_first_token(
                                            time.perf_counter() - stream_started,
                                            agent.model_name,
                                        )
                                        first_token_recorded = True
                                yield f"event: {event_type}\ndata: {json.dumps({'content': text})}\n\n"
                        continue
                    serialized = serialize_for_json(data)
                    yield f"event: data\ndata: {json.dumps(serialized)}\n\n"
                else:
                    serialized = serialize_for_json(chunk)
                    yield f"event: data\ndata: {json.dumps(serialized)}\n\n"
            yield "event: end\ndata: {}\n\n"
        except asyncio.CancelledError:
            logger.info("stream_client_disconnected", user_id=user_id)
            raise
        except Exception as e:
            stream_failed = True
            logger.exception("stream_error", error=str(e))
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
        finally:
            heartbeat.cancel()
            with suppress(asyncio.CancelledError):
                await heartbeat
            try:
                await lease.release()
            except Exception:
                logger.exception("stream_admission_release_failed", user_id=user_id)
            record_stream_finished(
                time.perf_counter() - stream_started,
                model=agent.model_name,
                error=stream_failed,
            )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _stream_response_with_custom_model(
    model: str,
    message: str,
    thread_id: str,
    user_id: str,
    lease: StreamLease,
) -> StreamingResponse:
    async def event_generator():
        agent = None
        stream_started = time.perf_counter()
        first_token_recorded = False
        stream_failed = False
        lease_lost = asyncio.Event()
        heartbeat = asyncio.create_task(lease.heartbeat(lease_lost))
        try:
            agent = Agent(model=model)
            await agent.__aenter__()
            async for chunk in agent.astream(message, thread_id, user_id):
                if lease_lost.is_set():
                    raise RuntimeError("stream admission lease lost")
                if isinstance(chunk, tuple) and len(chunk) == 2:
                    mode, data = chunk
                    if mode == "messages":
                        msg_chunk, _metadata = data
                        if isinstance(msg_chunk, AIMessageChunk):
                            for event_type, text in _extract_message_chunks(msg_chunk):
                                if event_type == "token":
                                    record_output_chunk(model)
                                    if not first_token_recorded:
                                        record_first_token(
                                            time.perf_counter() - stream_started, model
                                        )
                                        first_token_recorded = True
                                yield f"event: {event_type}\ndata: {json.dumps({'content': text})}\n\n"
                        continue
                    serialized = serialize_for_json(data)
                    yield f"event: data\ndata: {json.dumps(serialized)}\n\n"
                else:
                    serialized = serialize_for_json(chunk)
                    yield f"event: data\ndata: {json.dumps(serialized)}\n\n"
            yield "event: end\ndata: {}\n\n"
        except asyncio.CancelledError:
            logger.info("stream_client_disconnected", user_id=user_id, model=model)
            raise
        except Exception as e:
            stream_failed = True
            logger.exception("stream_error", error=str(e), model=model)
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
        finally:
            try:
                if agent:
                    await agent.__aexit__(None, None, None)
            finally:
                heartbeat.cancel()
                with suppress(asyncio.CancelledError):
                    await heartbeat
                try:
                    await lease.release()
                except Exception:
                    logger.exception("stream_admission_release_failed", user_id=user_id)
                record_stream_finished(
                    time.perf_counter() - stream_started,
                    model=model,
                    error=stream_failed,
                )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/threads/{thread_id}", response_model=ThreadHistoryResponse)
@limiter.limit("60/minute")
async def get_thread_history(
    request: Request,
    thread_id: str,
    user: UserProfile = Depends(get_current_user),
):
    user_id = user.user_id
    if not await check_thread_access(thread_id, user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    agent: Agent = request.app.state.agent
    messages = await agent.get_thread_history(thread_id)
    return ThreadHistoryResponse(thread_id=thread_id, messages=messages)


@router.delete("/threads/{thread_id}")
@limiter.limit("30/minute")
async def delete_thread(
    request: Request,
    thread_id: str,
    user: UserProfile = Depends(get_current_user),
):
    user_id = user.user_id
    if not await check_thread_access(thread_id, user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    agent: Agent = request.app.state.agent
    success = await agent.delete_thread(thread_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete thread")
    return {"status": "deleted", "thread_id": thread_id}


@router.post("/tokenize", response_model=TokenizeResponse)
@limiter.limit("60/minute")
async def tokenize_text(request: Request, body: TokenizeRequest):
    tokens = len(body.text) // 4
    return TokenizeResponse(tokens=tokens, model=settings.llm_model)


@router.get("/storage/stats", response_model=StorageStatsResponse)
@limiter.limit("30/minute")
async def get_storage_stats(request: Request):
    try:
        stats = get_knowledge_index().stats()

        chroma_stats = ChromaStats(
            collections=[
                CollectionStats(name=stats.index_name, count=stats.document_count)
            ],
            total_documents=stats.document_count,
            sources=stats.sources,
        )

        mem0_available = False
        users_count = 0
        try:
            memory = AgentMemory()
            mem0_available = memory.memory is not None
        except Exception as e:
            logger.warning("mem0_unavailable", error=str(e))

        mem0_stats = Mem0Stats(
            available=mem0_available, users_with_memories=users_count
        )

        return StorageStatsResponse(
            chroma=chroma_stats, knowledge=chroma_stats, mem0=mem0_stats
        )
    except Exception as e:
        logger.exception("storage_stats_error", error=str(e))
        raise HTTPException(
            status_code=500, detail=f"Failed to get storage stats: {str(e)}"
        )
