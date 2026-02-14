# Docker Compose Frontend Integration

## ✅ What Was Added

Added a frontend dev server service to `docker-compose.yml` so you can run everything with a single command!

### New Service

```yaml
# -- Frontend Dev Server (Vite) --
frontend:
  image: node:20-alpine
  working_dir: /app
  command: sh -c "npm install && npm run dev -- --host"
  ports:
    - "5173:5173"
  volumes:
    - ./frontend:/app
    - /app/node_modules  # Prevent overwriting node_modules
  environment:
    VITE_WS_URL: ws://localhost:8000/ws/chat
  depends_on:
    - fastapi
  networks:
    - rag-network
```

## 🎯 How It Works

### Single Command Start

```bash
docker-compose up
```

This now starts:
1. ✅ MinIO (object storage)
2. ✅ Qdrant (vector database)
3. ✅ Redis (pub/sub)
4. ✅ PostgreSQL (state persistence)
5. ✅ Model Server (embeddings + reranker)
6. ✅ FastAPI Backend (API + WebSocket)
7. ✅ LangGraph Server (graph execution)
8. ✅ **Frontend Dev Server (Vite with HMR)** ← NEW!

### Access Points

| Service | URL | Description |
|---------|-----|-------------|
| Frontend (Dev) | http://localhost:5173 | React app with hot reload |
| Backend API | http://localhost:8000 | FastAPI with WebSocket |
| API Docs | http://localhost:8000/docs | Swagger UI |
| LangGraph API | http://localhost:8123 | LangGraph platform |
| MinIO Console | http://localhost:9001 | Object storage UI |
| Qdrant Dashboard | http://localhost:6333/dashboard | Vector DB UI |

## 🔥 Features

### Hot Module Replacement (HMR)

- Edit any file in `frontend/src/`
- Changes appear instantly in browser
- No manual refresh needed
- Full React Fast Refresh support

### Volume Mounting

```yaml
volumes:
  - ./frontend:/app              # Source code (editable)
  - /app/node_modules            # Dependencies (isolated)
```

**Benefits:**
- Edit files on your host machine
- Changes sync to container instantly
- `node_modules` stays in container (faster)

### Automatic Dependency Installation

```yaml
command: sh -c "npm install && npm run dev -- --host"
```

- Runs `npm install` on container start
- Ensures dependencies are up-to-date
- Then starts Vite dev server
- `--host` flag allows external connections

## 📝 Usage Examples

### Start Everything

```bash
docker-compose up
```

### Start in Background

```bash
docker-compose up -d
```

### View Logs

```bash
# All services
docker-compose logs -f

# Just frontend
docker-compose logs -f frontend

# Multiple services
docker-compose logs -f frontend fastapi
```

### Restart Frontend Only

```bash
docker-compose restart frontend
```

### Stop Everything

```bash
docker-compose down
```

### Run Specific Services

```bash
# Backend only (no frontend)
docker-compose up qdrant minio redis postgres model-server fastapi

# Frontend only (assumes backend is running)
docker-compose up frontend
```

## 🔧 Development Workflow

### Typical Day-to-Day

1. **Morning**: Start everything
   ```bash
   docker-compose up -d
   ```

2. **Code**: Edit files in `frontend/src/`
   - Changes appear instantly at http://localhost:5173

3. **Debug**: Check logs
   ```bash
   docker-compose logs -f frontend
   ```

4. **Evening**: Stop everything
   ```bash
   docker-compose down
   ```

### Backend Changes

If you modify backend code in `src/`:

```bash
docker-compose restart fastapi
```

### Complete Reset

```bash
# Stop and remove everything
docker-compose down -v

# Fresh start
docker-compose up
```

## 🎨 Customization

### Change Ports

Edit `docker-compose.yml`:

```yaml
frontend:
  ports:
    - "3000:5173"  # Use port 3000 instead
```

### Different WebSocket URL

Edit `docker-compose.yml`:

```yaml
frontend:
  environment:
    VITE_WS_URL: ws://your-host:8000/ws/chat
```

### Use Local Node.js (Skip Container)

If you prefer running frontend locally:

```bash
# In docker-compose.yml, comment out frontend service
# Then run manually:
cd frontend
npm install
npm run dev
```

## 🐛 Troubleshooting

### Port 5173 Already in Use

```bash
# Find what's using it
lsof -i :5173

# Kill the process or change port in docker-compose.yml
```

### Frontend Won't Start

```bash
# Check logs
docker-compose logs frontend

# Common fix: Rebuild
docker-compose down
docker-compose up --build frontend
```

### Changes Not Appearing

```bash
# Hard refresh browser
Ctrl+Shift+R (or Cmd+Shift+R on Mac)

# Or restart frontend
docker-compose restart frontend
```

### Node Modules Issues

```bash
# Remove the anonymous volume and recreate
docker-compose down
docker volume prune
docker-compose up frontend
```

### WebSocket Connection Failed

```bash
# Check backend is running
curl http://localhost:8000/health

# Verify CORS configuration
docker-compose logs fastapi | grep CORS
```

## 📊 Resource Usage

The frontend container is lightweight:

- **Image**: `node:20-alpine` (~180MB)
- **Memory**: ~150-300MB during dev
- **CPU**: Minimal (only on file changes)

## 🎯 Production Deployment

For production, the frontend is built and served from FastAPI:

```bash
# Build production image (frontend included)
docker-compose build fastapi

# Run without separate frontend service
docker-compose up qdrant minio redis postgres model-server fastapi

# Access at http://localhost:8000
```

The multi-stage Dockerfile:
1. Stage 1: Builds frontend with Node.js
2. Stage 2: Copies built files to Python image
3. FastAPI serves static files

## ✨ Benefits

### Before
```bash
# Terminal 1
docker-compose up

# Terminal 2
cd frontend
npm install
npm run dev
```

### After
```bash
# Single terminal
docker-compose up
```

**Advantages:**
- ✅ Single command to run everything
- ✅ Consistent environment across team
- ✅ No need to install Node.js locally
- ✅ Automatic dependency management
- ✅ Hot reload works out of the box
- ✅ Easy to add to CI/CD pipelines

## 🎉 Summary

The frontend is now fully integrated into Docker Compose!

- **Start**: `docker-compose up`
- **Access**: http://localhost:5173
- **Edit**: Files in `frontend/src/`
- **Enjoy**: Instant hot reload! 🔥

No more juggling multiple terminals or manual npm commands. Everything just works! 🚀
