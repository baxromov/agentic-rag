# Quick Start Guide

## 🚀 Run Everything with One Command

The entire stack (backend + frontend + services) now runs together with Docker Compose!

### Prerequisites

- Docker & Docker Compose installed
- `.env` file configured (copy from `.env.example`)

### Start Everything

```bash
docker-compose up
```

That's it! Docker Compose will:
1. Start all backend services (MinIO, Qdrant, Redis, PostgreSQL, Model Server)
2. Start the FastAPI backend on port 8000
3. Start the LangGraph server on port 8123
4. Start the Vite dev server on port 5173 (with hot reload!)

### Access the Application

- **Frontend (Dev Mode)**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **MinIO Console**: http://localhost:9001
- **Qdrant Dashboard**: http://localhost:6333/dashboard

### What's Running

```
┌─────────────────────────────────────────────┐
│  Frontend Dev Server (Vite)                 │
│  http://localhost:5173                      │
│  • Hot reload enabled                       │
│  • Changes reflect instantly                │
└─────────────────────────────────────────────┘
              ↓ WebSocket
┌─────────────────────────────────────────────┐
│  FastAPI Backend                            │
│  http://localhost:8000                      │
│  • /ws/chat - WebSocket endpoint            │
│  • /query - HTTP endpoint                   │
│  • /docs - Swagger UI                       │
└─────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│  Supporting Services                        │
│  • Qdrant (vector DB)                       │
│  • MinIO (object storage)                   │
│  • Redis (pub/sub)                          │
│  • PostgreSQL (state persistence)           │
│  • Model Server (embeddings + reranker)     │
└─────────────────────────────────────────────┘
```

### Development Workflow

#### Make Frontend Changes

1. Edit files in `frontend/src/`
2. Vite automatically reloads the browser
3. See changes instantly at http://localhost:5173

#### Make Backend Changes

1. Edit files in `src/`
2. Restart the fastapi service:
   ```bash
   docker-compose restart fastapi
   ```

#### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f frontend
docker-compose logs -f fastapi
docker-compose logs -f qdrant
```

#### Stop Everything

```bash
# Stop (keeps containers)
docker-compose stop

# Stop and remove containers
docker-compose down

# Stop and remove everything including volumes
docker-compose down -v
```

### Run Specific Services

```bash
# Only backend services (no frontend)
docker-compose up qdrant minio redis postgres model-server fastapi

# Only frontend (backend must be running)
docker-compose up frontend
```

### Production Build

For production deployment with the built frontend served from FastAPI:

```bash
# Build the production Docker image
docker-compose build fastapi

# Run production stack (no separate frontend service)
docker-compose up qdrant minio redis postgres model-server fastapi

# Access at http://localhost:8000
```

The production build:
- Builds frontend during Docker image creation
- Serves static files from FastAPI
- Single port (8000) for both frontend and backend

### Troubleshooting

#### Frontend won't start

```bash
# Check logs
docker-compose logs frontend

# Rebuild node_modules
docker-compose down
docker-compose up --build frontend
```

#### Port already in use

```bash
# Check what's using the port
lsof -i :5173  # Frontend
lsof -i :8000  # Backend

# Change ports in docker-compose.yml if needed
```

#### WebSocket won't connect

```bash
# Verify backend is running
curl http://localhost:8000/health

# Check CORS is configured
docker-compose logs fastapi | grep CORS
```

#### Changes not reflecting

```bash
# For frontend: Vite should auto-reload
# If not, try:
docker-compose restart frontend

# For backend: Restart required
docker-compose restart fastapi
```

### Environment Variables

The frontend uses `.env.development` by default with Docker Compose:

```env
VITE_WS_URL=ws://localhost:8000/ws/chat
```

If your backend is on a different host:

```env
VITE_WS_URL=ws://YOUR_HOST:8000/ws/chat
```

### First Time Setup

1. **Clone and navigate**:
   ```bash
   cd MyAgenticRAGFramework
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Start everything**:
   ```bash
   docker-compose up
   ```

4. **Upload documents** (in another terminal):
   ```bash
   curl -X POST http://localhost:8000/documents/upload \
     -F "file=@your_document.pdf"
   ```

5. **Open frontend**:
   ```
   http://localhost:5173
   ```

6. **Ask a question!**

### Tips

- **Hot Reload**: Frontend changes appear instantly (Vite HMR)
- **Node Modules**: Mounted as anonymous volume to prevent conflicts
- **Logs**: Use `docker-compose logs -f <service>` to debug
- **Clean Start**: Use `docker-compose down -v` to reset everything
- **Build Cache**: Frontend `node_modules` persists between restarts

### Next Steps

1. Upload some documents via the API
2. Open http://localhost:5173
3. Configure settings (gear icon)
4. Start chatting!

**Enjoy your AI-powered RAG system! 🚀**
