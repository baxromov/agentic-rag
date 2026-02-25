# ===========================
# Stage 1: Build Frontend
# ===========================
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install dependencies (strict-ssl=false for corporate network)
RUN npm config set strict-ssl false && \
    npm ci --only=production=false

# Copy frontend source
COPY frontend/ ./

# Build frontend for production
RUN npm run build

# ===========================
# Stage 2: Python Backend + Frontend
# ===========================
FROM python:3.12-slim

# System dependencies for unstructured (PDF, DOCX, etc.) and OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 \
    poppler-utils \
    tesseract-ocr \
    libreoffice-core \
    pandoc \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install pip with faster mirror and configure for corporate network SSL bypass
RUN pip config set global.trusted-host "pypi.org pypi.python.org files.pythonhosted.org download.pytorch.org" && \
    pip config set global.timeout 1000 && \
    pip install --upgrade pip setuptools wheel

# Copy only dependency files first for better layer caching
COPY pyproject.toml README.md ./

# Install CPU-only PyTorch first to avoid downloading 3GB+ CUDA packages
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install torch --index-url https://download.pytorch.org/whl/cpu

# Install dependencies separately to leverage Docker cache
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -e . --no-deps || true && \
    pip install -e .

# Ensure nltk is installed (transitive dep of unstructured, but install explicitly in case it partially failed)
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install nltk

# Download NLTK data at build time (bypass SSL for corporate proxy)
RUN python -c "\
import ssl; ssl._create_default_https_context = ssl._create_unverified_context; \
import nltk; \
nltk.download('averaged_perceptron_tagger_eng', download_dir='/usr/local/nltk_data'); \
nltk.download('punkt_tab', download_dir='/usr/local/nltk_data')"
ENV NLTK_DATA=/usr/local/nltk_data

# Copy backend source
COPY src/ src/

# Copy built frontend from stage 1
COPY --from=frontend-builder /frontend/dist /app/frontend/dist

EXPOSE 8000

ENV PYTHONHTTPSVERIFY=0
CMD ["python", "-c", "import ssl; ssl._create_default_https_context = ssl._create_unverified_context; import uvicorn; uvicorn.run('src.api.app:app', host='0.0.0.0', port=8000)"]
