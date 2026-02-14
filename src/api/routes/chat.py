import json
import time

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from langgraph_sdk import get_client
from pydantic import BaseModel

from src.agent.guardrails import GuardrailViolation, validate_input
from src.config.settings import get_settings
from src.models.schemas import ChatEvent
from src.utils.telemetry import logger

router = APIRouter(tags=["chat"])


class StreamChatRequest(BaseModel):
    query: str
    thread_id: str | None = None
    filters: dict | None = None
    context: dict | None = None


@router.post("/chat/stream")
async def stream_chat(request: StreamChatRequest):
    """Streaming chat endpoint using SSE (Server-Sent Events)."""
    settings = get_settings()
    client = get_client(url=settings.langgraph_api_url)

    async def event_generator():
        try:
            request_start = time.time()
            query = request.query
            filters = request.filters
            runtime_context = request.context

            # Log incoming request
            logger.info(
                "stream_request_received",
                query_length=len(query),
                has_filters=bool(filters),
                has_context=bool(runtime_context),
            )

            if not query:
                yield f"data: {json.dumps({'event': 'error', 'data': {'message': 'Empty query'}})}\n\n"
                return

            # Apply input guardrails
            try:
                input_validation = validate_input(query)
                processed_query = input_validation["masked_query"]
                guardrail_warnings = input_validation.get("warnings", [])

                # Send warning if PII was masked
                if guardrail_warnings:
                    yield f"data: {json.dumps({'event': 'warning', 'data': {'message': 'Input processed by security guardrails', 'warnings': guardrail_warnings}})}\n\n"
            except GuardrailViolation as e:
                yield f"data: {json.dumps({'event': 'error', 'data': {'message': f'Security check failed: {str(e)}'}})}\n\n"
                return

            # Create or reuse thread
            thread_id = request.thread_id
            if not thread_id:
                thread = await client.threads.create()
                thread_id = thread["thread_id"]
                yield f"data: {json.dumps({'event': 'thread_created', 'data': {'thread_id': thread_id}})}\n\n"

            # Load previous messages
            previous_messages = []
            try:
                state = await client.threads.get_state(thread_id)
                previous_messages = state.get("values", {}).get("messages", [])
            except Exception:
                previous_messages = []

            # Append new message
            new_message = HumanMessage(content=processed_query)

            # Stream the graph execution
            async for chunk in client.runs.stream(
                thread_id=thread_id,
                assistant_id="rag_agent",
                input={
                    "messages": previous_messages + [new_message],
                    "query": processed_query,
                    "documents": [],
                    "generation": "",
                    "retries": 0,
                    "filters": filters,
                    "context_metadata": None,
                    "runtime_context": runtime_context,
                },
                stream_mode="updates",
            ):
                if chunk.event == "updates":
                    for node_name, node_output in chunk.data.items():
                        yield f"data: {json.dumps({'event': 'node_end', 'node': node_name, 'data': _serialize_output(node_output)})}\n\n"

            # Get final state
            state = await client.threads.get_state(thread_id)
            values = state.get("values", {})
            context_meta = values.get("context_metadata", {})

            final_data = {
                "event": "generation",
                "data": {
                    "answer": values.get("generation", ""),
                    "query": values.get("query", query),
                    "retries": values.get("retries", 0),
                    "sources_count": len(values.get("documents", [])),
                    "thread_id": thread_id,
                    "context_metadata": context_meta,
                },
            }
            yield f"data: {json.dumps(final_data)}\n\n"

            # Log completion
            request_duration = int((time.time() - request_start) * 1000)
            logger.info(
                "stream_request_completed",
                thread_id=thread_id,
                query_length=len(query),
                total_duration_ms=request_duration,
            )

        except Exception as e:
            logger.error(
                "stream_request_failed",
                error_type=type(e).__name__,
                error_message=str(e),
            )
            yield f"data: {json.dumps({'event': 'error', 'data': {'message': str(e)}})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    settings = get_settings()
    client = get_client(url=settings.langgraph_api_url)

    try:
        while True:
            request_start = time.time()
            data = await websocket.receive_text()
            message = json.loads(data)
            query = message.get("query", "")
            filters = message.get("filters")
            runtime_context = message.get("context")  # User-specific runtime config

            # Log incoming request
            logger.info(
                "websocket_request_received",
                query_length=len(query) if query else 0,
                has_filters=bool(filters),
                has_context=bool(runtime_context),
            )

            if not query:
                await websocket.send_text(
                    ChatEvent(event="error", data={"message": "Empty query"}).model_dump_json()
                )
                continue

            # Apply input guardrails
            try:
                input_validation = validate_input(query)
                # Use masked query if PII was detected
                processed_query = input_validation["masked_query"]
                guardrail_warnings = input_validation.get("warnings", [])

                # Send warning if PII was masked
                if guardrail_warnings:
                    await websocket.send_text(
                        ChatEvent(
                            event="warning",
                            data={
                                "message": "Input processed by security guardrails",
                                "warnings": guardrail_warnings,
                            },
                        ).model_dump_json()
                    )
            except GuardrailViolation as e:
                await websocket.send_text(
                    ChatEvent(
                        event="error", data={"message": f"Security check failed: {str(e)}"}
                    ).model_dump_json()
                )
                continue

            try:
                # Create a thread (or reuse thread_id from message)
                thread_id = message.get("thread_id")
                if not thread_id:
                    thread = await client.threads.create()
                    thread_id = thread["thread_id"]

                # Load previous messages from thread state for multi-turn conversation
                previous_messages = []
                try:
                    state = await client.threads.get_state(thread_id)
                    previous_messages = state.get("values", {}).get("messages", [])
                except Exception:
                    # If thread doesn't exist yet or error loading, start with empty history
                    previous_messages = []

                # Append new user query to conversation history (use processed query after guardrails)
                new_message = HumanMessage(content=processed_query)

                # Stream the graph execution (use processed_query after guardrails)
                async for chunk in client.runs.stream(
                    thread_id=thread_id,
                    assistant_id="rag_agent",
                    input={
                        "messages": previous_messages + [new_message],
                        "query": processed_query,
                        "documents": [],
                        "generation": "",
                        "retries": 0,
                        "filters": filters,
                        "context_metadata": None,
                        "runtime_context": runtime_context,  # User-specific configuration
                    },
                    stream_mode="updates",
                ):
                    if chunk.event == "updates":
                        for node_name, node_output in chunk.data.items():
                            await websocket.send_text(
                                ChatEvent(
                                    event="node_end",
                                    node=node_name,
                                    data=_serialize_output(node_output),
                                ).model_dump_json()
                            )

                # Get final state from thread
                state = await client.threads.get_state(thread_id)
                values = state.get("values", {})
                context_meta = values.get("context_metadata", {})
                await websocket.send_text(
                    ChatEvent(
                        event="generation",
                        data={
                            "answer": values.get("generation", ""),
                            "query": values.get("query", query),
                            "retries": values.get("retries", 0),
                            "sources_count": len(values.get("documents", [])),
                            "thread_id": thread_id,
                            "context_metadata": context_meta,  # Include token usage info
                        },
                    ).model_dump_json()
                )

                # Log request completion
                request_duration = int((time.time() - request_start) * 1000)
                logger.info(
                    "websocket_request_completed",
                    thread_id=thread_id,
                    query_length=len(query),
                    retries=values.get("retries", 0),
                    sources_count=len(values.get("documents", [])),
                    total_duration_ms=request_duration,
                    context_metadata=context_meta,
                )
            except Exception as e:
                # Log error
                logger.error(
                    "websocket_request_failed",
                    error_type=type(e).__name__,
                    error_message=str(e),
                    query_length=len(query) if query else 0,
                )
                await websocket.send_text(
                    ChatEvent(event="error", data={"message": str(e)}).model_dump_json()
                )

    except WebSocketDisconnect:
        pass


def _serialize_output(output: dict) -> dict:
    serialized = {}
    for key, value in output.items():
        if key == "documents":
            serialized["documents_count"] = len(value) if isinstance(value, list) else 0
        elif key == "generation":
            serialized["generation"] = value
        elif key == "query":
            serialized["query"] = value
        elif key == "retries":
            serialized["retries"] = value
    return serialized
