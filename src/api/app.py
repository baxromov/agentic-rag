import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.api.routes import admin, auth, chat, documents, feedback, health, query, sessions


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Seed admin user on startup
    from datetime import datetime, timezone

    from src.config.settings import get_settings
    from src.services.auth import hash_password
    from src.services.graph_runner import close_graph_runner, init_graph_runner
    from src.services.mongodb import get_mongodb
    from src.services.session_store import ensure_indexes

    settings = get_settings()
    try:
        db = await get_mongodb()
        existing = await db.users.find_one({"role": "admin"})
        if not existing:
            await db.users.insert_one({
                "username": settings.admin_username,
                "password_hash": hash_password(settings.admin_password),
                "role": "admin",
                "full_name": "System Administrator",
                "is_active": True,
                "created_at": datetime.now(timezone.utc),
                "last_login": None,
            })
            print(f"Admin user '{settings.admin_username}' created")
        else:
            print(f"Admin user already exists: '{existing['username']}'")
    except Exception as e:
        print(f"Warning: Could not seed admin user: {e}")

    # Seed default departments
    try:
        existing_depts = await db.departments.count_documents({})
        if existing_depts == 0:
            default_departments = ["Staff", "Recruiting", "L&D", "C&B"]
            await db.departments.insert_many([{"name": d} for d in default_departments])
            print(f"Default departments created: {default_departments}")
    except Exception as e:
        print(f"Warning: Could not seed departments: {e}")

    # Initialize graph runner with PostgreSQL persistence
    try:
        await init_graph_runner()
        print("Graph runner initialized with PostgreSQL persistence")
    except Exception as e:
        print(f"Warning: Could not initialize graph runner: {e}")

    # Ensure MongoDB indexes for session store
    try:
        await ensure_indexes()
    except Exception as e:
        print(f"Warning: Could not create session indexes: {e}")

    yield

    # Cleanup
    await close_graph_runner()


def create_app() -> FastAPI:
    app = FastAPI(
        title="MyAgenticRAGFramework",
        description="Agentic RAG with hybrid search, multilingual support, and multi-provider LLM",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS middleware — allows localhost + any LAN IP so the app works on local network
    cors_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # API routes
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(admin.router)
    app.include_router(documents.router)
    app.include_router(query.router)
    app.include_router(chat.router)
    app.include_router(sessions.router)
    app.include_router(feedback.router)

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
