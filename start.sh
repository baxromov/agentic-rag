#!/bin/bash

# MyAgenticRAGFramework Startup Script
# This script makes it easy to start the entire stack

set -e

echo "🚀 MyAgenticRAGFramework Startup Script"
echo "========================================"
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found!"
    echo ""
    echo "Creating .env from .env.example..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ .env created! Please edit it with your API keys."
        echo ""
        read -p "Press Enter to continue or Ctrl+C to exit and edit .env first..."
    else
        echo "❌ .env.example not found. Please create .env manually."
        exit 1
    fi
fi

echo "📦 Starting all services..."
echo ""
echo "This will start:"
echo "  • MinIO (object storage)"
echo "  • Qdrant (vector database)"
echo "  • Redis (pub/sub)"
echo "  • PostgreSQL (state persistence)"
echo "  • Model Server (embeddings + reranker)"
echo "  • FastAPI Backend (API + WebSocket)"
echo "  • LangGraph Server (graph execution)"
echo "  • Frontend Dev Server (Vite with hot reload)"
echo ""
echo "Access points:"
echo "  • Frontend:     http://localhost:5173"
echo "  • Backend API:  http://localhost:8000"
echo "  • API Docs:     http://localhost:8000/docs"
echo ""

# Start docker-compose
docker-compose up

echo ""
echo "✅ All services started!"
echo ""
echo "Next steps:"
echo "  1. Open http://localhost:5173 in your browser"
echo "  2. Click the gear icon to configure settings"
echo "  3. Upload documents via the API (optional)"
echo "  4. Start chatting!"
echo ""
echo "To stop: Press Ctrl+C or run 'docker-compose down'"
