# ===========================
# Stage 1: Build Frontend
# ===========================
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci --only=production=false

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

# Install pip with faster mirror (optional: use PyPI mirrors)
RUN pip install --upgrade pip setuptools wheel

# Copy only dependency files first for better layer caching
COPY pyproject.toml README.md ./

# Install dependencies separately to leverage Docker cache
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -e . --no-deps || true && \
    pip install -e .

# Copy backend source
COPY src/ src/

# Copy built frontend from stage 1
COPY --from=frontend-builder /frontend/dist /app/frontend/dist

EXPOSE 8000

CMD ["uvicorn", "src.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
