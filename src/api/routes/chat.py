import json
import time

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from langgraph.types import Command
from pydantic import BaseModel

from src.agent.guardrails import GuardrailViolation, validate_input
from src.api.auth_dependencies import get_current_user
from src.config.settings import get_settings
from src.models.schemas import ChatEvent
from src.services.graph_runner import get_graph
from src.services.session_store import (
    create_session,
    get_session,
    update_session,
)
from src.utils.langfuse_integration import create_langfuse_handler, flush_langfuse
from src.utils.telemetry import logger

router = APIRouter(tags=["chat"])


class StreamChatRequest(BaseModel):
    query: str
    session_id: str | None = None
    thread_id: str | None = None  # Legacy compat
    filters: dict | None = None
    context: dict | None = None


class ResumeRequest(BaseModel):
    session_id: str
    response: str


async def _generate_title(query: str, settings, session_id: str | None = None) -> str:
    """Generate a short title for the conversation from the first message."""
    try:
        from langchain_core.messages import HumanMessage as HM, SystemMessage as SM
        from src.services.llm import create_llm

        llm = create_llm(settings)
        messages = [
            SM(content="Generate a concise chat title (3-6 words, no quotes) for a conversation that starts with the following message. Reply with ONLY the title, nothing else."),
            HM(content=query),
        ]
        handler, metadata = create_langfuse_handler(
            trace_name="title-generation", session_id=session_id
        )
        config = {}
        if handler:
            config["callbacks"] = [handler]
            config["metadata"] = metadata
        response = await llm.ainvoke(messages, config=config)
        flush_langfuse()
        title = response.content.strip().strip('"').strip("'")
        # Limit length
        if len(title) > 60:
            title = title[:57] + "..."
        return title
    except Exception as e:
        logger.error("title_generation_failed", error=str(e))
        return query[:40] + ("..." if len(query) > 40 else "")


def _make_config(session_id: str) -> dict:
    """Create LangGraph config with thread_id for checkpointer."""
    return {"configurable": {"thread_id": session_id}}


@router.post("/chat/stream")
async def stream_chat(request: StreamChatRequest, user: dict = Depends(get_current_user)):
    """Streaming chat endpoint using SSE (Server-Sent Events)."""
    settings = get_settings()
    graph = get_graph()
    uid = str(user["_id"])

    async def event_generator():
        try:
            request_start = time.time()
            query = request.query
            filters = request.filters
            runtime_context = request.context or {}

            # Inject guardrail settings from MongoDB into runtime_context
            try:
                from src.services.mongodb import get_mongodb
                db = await get_mongodb()
                app_cfg = await db.app_settings.find_one({"_id": "app_config"}) or {}
                runtime_context.setdefault(
                    "input_safety_enabled", app_cfg.get("input_safety_enabled", True)
                )
                runtime_context.setdefault(
                    "output_safety_enabled", app_cfg.get("output_safety_enabled", True)
                )
                runtime_context.setdefault(
                    "intent_classification_enabled", app_cfg.get("intent_classification_enabled", True)
                )
            except Exception:
                pass

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

                if guardrail_warnings:
                    yield f"data: {json.dumps({'event': 'warning', 'data': {'message': 'Input processed by security guardrails', 'warnings': guardrail_warnings}})}\n\n"
            except GuardrailViolation as e:
                yield f"data: {json.dumps({'event': 'error', 'data': {'message': f'Security check failed: {str(e)}'}})}\n\n"
                return

            # Resolve session
            session_id = request.session_id or request.thread_id
            is_new_session = False

            if session_id:
                # Verify ownership
                session = await get_session(session_id)
                if not session:
                    yield f"data: {json.dumps({'event': 'error', 'data': {'message': 'Session not found'}})}\n\n"
                    return
                if session.get("user_id") != uid:
                    yield f"data: {json.dumps({'event': 'error', 'data': {'message': 'Access denied'}})}\n\n"
                    return
            else:
                # Create new session in MongoDB
                session = await create_session(user_id=uid)
                session_id = session["thread_id"]
                is_new_session = True
                yield f"data: {json.dumps({'event': 'session_created', 'data': {'session_id': session_id, 'thread_id': session_id}})}\n\n"

            config = _make_config(session_id)

            # Attach Langfuse handler for unified tracing
            lf_handler, lf_metadata = create_langfuse_handler(
                trace_name="rag-agent", session_id=session_id, user_id=uid
            )
            if lf_handler:
                config.setdefault("callbacks", []).append(lf_handler)
                config.setdefault("metadata", {}).update(lf_metadata)

            # Load previous messages from checkpointer
            previous_messages = []
            try:
                state = await graph.aget_state(config)
                if state and state.values:
                    previous_messages = state.values.get("messages", [])
            except Exception:
                previous_messages = []

            # Append new message
            new_message = HumanMessage(content=processed_query)

            # Stream the graph execution
            async for event in graph.astream(
                {
                    "messages": previous_messages + [new_message],
                    "query": processed_query,
                    "documents": [],
                    "generation": "",
                    "retries": 0,
                    "filters": filters,
                    "context_metadata": None,
                    "runtime_context": runtime_context,
                    "needs_clarification": False,
                    "clarification_question": None,
                    "human_response": None,
                    "guardrail_blocked": False,
                },
                config=config,
                stream_mode="updates",
            ):
                for node_name, node_output in event.items():
                    if node_output is None:
                        continue
                    yield f"data: {json.dumps({'event': 'node_end', 'node': node_name, 'data': _serialize_output(node_output)})}\n\n"

            # Flush Langfuse traces
            flush_langfuse()

            # Get final state — check for interrupt (HITL)
            state = await graph.aget_state(config)
            values = state.values if state else {}

            # Check for HITL interrupt (state.next is non-empty when interrupted)
            if state and state.next:
                # Graph is paused at an interrupt
                clarification_q = values.get("clarification_question", "Could you clarify?")
                yield f"data: {json.dumps({'event': 'clarification_needed', 'data': {'question': clarification_q, 'session_id': session_id}})}\n\n"
            else:
                # Normal generation response
                context_meta = values.get("context_metadata", {})
                raw_docs = values.get("documents", [])
                final_data = {
                    "event": "generation",
                    "data": {
                        "answer": values.get("generation", ""),
                        "query": values.get("query", query),
                        "retries": values.get("retries", 0),
                        "sources_count": len(raw_docs),
                        "sources": _serialize_sources(raw_docs),
                        "thread_id": session_id,
                        "session_id": session_id,
                        "context_metadata": context_meta,
                    },
                }
                yield f"data: {json.dumps(final_data)}\n\n"

            # Update session metadata
            try:
                session_data = await get_session(session_id)
                msg_count = (session_data.get("message_count", 0) if session_data else 0) + 2

                update_kwargs = {"message_count": msg_count}

                # Auto-generate title on first exchange
                if is_new_session or (session_data and session_data.get("title") == "New Chat"):
                    title = await _generate_title(query, settings, session_id=session_id)
                    update_kwargs["title"] = title
                    yield f"data: {json.dumps({'event': 'session_title', 'data': {'session_id': session_id, 'title': title}})}\n\n"

                await update_session(session_id, **update_kwargs)
            except Exception as e:
                logger.error("metadata_update_failed", error=str(e))

            # Log completion
            request_duration = int((time.time() - request_start) * 1000)
            logger.info(
                "stream_request_completed",
                thread_id=session_id,
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


@router.post("/chat/resume")
async def resume_chat(request: ResumeRequest, user: dict = Depends(get_current_user)):
    """Resume a chat after human-in-the-loop clarification."""
    graph = get_graph()
    uid = str(user["_id"])
    session_id = request.session_id

    # Verify ownership
    session = await get_session(session_id)
    if not session or session.get("user_id") != uid:
        return StreamingResponse(
            iter([f"data: {json.dumps({'event': 'error', 'data': {'message': 'Access denied'}})}\n\n"]),
            media_type="text/event-stream",
        )

    config = _make_config(session_id)

    async def event_generator():
        try:
            # Attach Langfuse handler for unified tracing
            lf_handler, lf_metadata = create_langfuse_handler(
                trace_name="rag-agent-resume", session_id=session_id, user_id=uid
            )
            if lf_handler:
                config.setdefault("callbacks", []).append(lf_handler)
                config.setdefault("metadata", {}).update(lf_metadata)

            # Resume the interrupted graph with user's response
            async for event in graph.astream(
                Command(resume=request.response),
                config=config,
                stream_mode="updates",
            ):
                for node_name, node_output in event.items():
                    if node_output is None:
                        continue
                    yield f"data: {json.dumps({'event': 'node_end', 'node': node_name, 'data': _serialize_output(node_output)})}\n\n"

            # Flush Langfuse traces
            flush_langfuse()

            # Get final state
            state = await graph.aget_state(config)
            values = state.values if state else {}
            context_meta = values.get("context_metadata", {})
            raw_docs = values.get("documents", [])

            final_data = {
                "event": "generation",
                "data": {
                    "answer": values.get("generation", ""),
                    "query": values.get("query", ""),
                    "retries": values.get("retries", 0),
                    "sources_count": len(raw_docs),
                    "sources": _serialize_sources(raw_docs),
                    "thread_id": session_id,
                    "session_id": session_id,
                    "context_metadata": context_meta,
                },
            }
            yield f"data: {json.dumps(final_data)}\n\n"

        except Exception as e:
            logger.error("resume_failed", error=str(e))
            yield f"data: {json.dumps({'event': 'error', 'data': {'message': str(e)}})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    # Validate token from query params
    token = websocket.query_params.get("token")
    if token:
        from src.services.auth import decode_token
        from src.services.mongodb import get_mongodb

        payload = decode_token(token)
        if payload is None or payload.get("type") != "access":
            await websocket.close(code=4001, reason="Invalid token")
            return
        db = await get_mongodb()
        user = await db.users.find_one({"username": payload.get("sub")})
        if not user or not user.get("is_active", True):
            await websocket.close(code=4001, reason="User not found")
            return
    else:
        await websocket.close(code=4001, reason="Token required")
        return

    await websocket.accept()
    graph = get_graph()

    try:
        while True:
            request_start = time.time()
            data = await websocket.receive_text()
            message = json.loads(data)
            query = message.get("query", "")
            filters = message.get("filters")
            runtime_context = message.get("context")

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
                processed_query = input_validation["masked_query"]
                guardrail_warnings = input_validation.get("warnings", [])

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
                thread_id = message.get("thread_id")
                if not thread_id:
                    uid = str(user["_id"])
                    session = await create_session(user_id=uid)
                    thread_id = session["thread_id"]

                config = _make_config(thread_id)

                previous_messages = []
                try:
                    state = await graph.aget_state(config)
                    if state and state.values:
                        previous_messages = state.values.get("messages", [])
                except Exception:
                    previous_messages = []

                new_message = HumanMessage(content=processed_query)

                async for event in graph.astream(
                    {
                        "messages": previous_messages + [new_message],
                        "query": processed_query,
                        "documents": [],
                        "generation": "",
                        "retries": 0,
                        "filters": filters,
                        "context_metadata": None,
                        "runtime_context": runtime_context,
                        "needs_clarification": False,
                        "clarification_question": None,
                        "human_response": None,
                        "guardrail_blocked": False,
                    },
                    config=config,
                    stream_mode="updates",
                ):
                    for node_name, node_output in event.items():
                        if node_output is None:
                            continue
                        await websocket.send_text(
                            ChatEvent(
                                event="node_end",
                                node=node_name,
                                data=_serialize_output(node_output),
                            ).model_dump_json()
                        )

                state = await graph.aget_state(config)
                values = state.values if state else {}
                context_meta = values.get("context_metadata", {})
                raw_docs = values.get("documents", [])
                await websocket.send_text(
                    ChatEvent(
                        event="generation",
                        data={
                            "answer": values.get("generation", ""),
                            "query": values.get("query", query),
                            "retries": values.get("retries", 0),
                            "sources_count": len(raw_docs),
                            "sources": _serialize_sources(raw_docs),
                            "thread_id": thread_id,
                            "context_metadata": context_meta,
                        },
                    ).model_dump_json()
                )

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


def _serialize_sources(documents: list) -> list[dict]:
    """Convert raw document dicts to SourceDocument-compatible dicts."""
    sources = []
    for doc in documents:
        if isinstance(doc, dict):
            metadata = doc.get("metadata", {})
            sources.append({
                "text": doc.get("page_content", ""),
                "score": metadata.get("score"),
                "page_number": metadata.get("page_number"),
                "source": metadata.get("source"),
                "language": metadata.get("language"),
                "document_id": metadata.get("document_id"),
            })
        elif hasattr(doc, "page_content"):
            metadata = doc.metadata if hasattr(doc, "metadata") else {}
            sources.append({
                "text": doc.page_content,
                "score": metadata.get("score"),
                "page_number": metadata.get("page_number"),
                "source": metadata.get("source"),
                "language": metadata.get("language"),
                "document_id": metadata.get("document_id"),
            })
    return sources


def _serialize_output(output: dict | None) -> dict:
    if not output:
        return {}
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
        elif key == "guardrail_blocked":
            serialized["guardrail_blocked"] = value
    return serialized
