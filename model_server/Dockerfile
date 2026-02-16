FROM python:3.12-slim

WORKDIR /app

# Install build dependencies for cross-platform compatibility
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip first with longer timeout and verbose output
RUN pip config set global.timeout 1000 && \
    pip config set global.retries 5 && \
    pip install --no-cache-dir --upgrade pip setuptools wheel

# Install dependencies with cache mount for faster rebuilds
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

# Pre-download lighter models at build time (with cache for model downloads)
RUN --mount=type=cache,target=/root/.cache/fastembed \
    python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='sentence-transformers/all-MiniLM-L6-v2')"
RUN --mount=type=cache,target=/root/.cache/fastembed \
    python -c "from fastembed.rerank.cross_encoder import TextCrossEncoder; TextCrossEncoder(model_name='jinaai/jina-reranker-v1-tiny-en')"

COPY . .

EXPOSE 8080

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
