FROM python:3.12-slim

WORKDIR /app

# Install build dependencies for cross-platform compatibility
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip first with longer timeout, retries, and corporate network SSL bypass
RUN pip config set global.timeout 1000 && \
    pip config set global.retries 10 && \
    pip config set global.trusted-host "pypi.org pypi.python.org files.pythonhosted.org" && \
    pip install --no-cache-dir --upgrade pip setuptools wheel

# Install dependencies with cache mount and retry logic for network failures
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    for i in 1 2 3 4 5; do \
    pip install -r requirements.txt && break || \
    (echo "Retry $i/5 after network error..." && sleep 15); \
    done

# Models will be downloaded at container startup (fastembed auto-downloads)
# Skip build-time download to avoid corporate proxy SSL issues

COPY . .

EXPOSE 8080

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
