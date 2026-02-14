import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.api.routes import chat, documents, health, query


def create_app() -> FastAPI:
    app = FastAPI(
        title="MyAgenticRAGFramework",
        description="Agentic RAG with hybrid search, multilingual support, and multi-provider LLM",
        version="0.1.0",
    )

    # CORS middleware for development (allows frontend dev server)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",  # Vite dev server
            "http://127.0.0.1:5173",
            "http://localhost:8000",  # Production same-origin
            "http://127.0.0.1:8000",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # API routes
    app.include_router(health.router)
    app.include_router(documents.router)
    app.include_router(query.router)
    app.include_router(chat.router)

    # Static file serving for production frontend
    frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"
    if frontend_dist.exists():
        # Mount static assets
        app.mount(
            "/assets",
            StaticFiles(directory=str(frontend_dist / "assets")),
            name="static",
        )

        # SPA fallback - serve index.html for all other routes
        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            # Don't serve index.html for API routes
            if full_path.startswith(("api/", "ws/", "health", "docs", "openapi.json")):
                return {"error": "Not found"}

            index_file = frontend_dist / "index.html"
            if index_file.exists():
                return FileResponse(index_file)
            return {"error": "Frontend not built"}

    return app


app = create_app()
