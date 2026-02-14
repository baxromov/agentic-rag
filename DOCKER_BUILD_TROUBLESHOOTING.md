# Docker Build Troubleshooting Guide

## Current Issue: Pip Timeout During Build

The error indicates that pip is timing out while downloading large packages (like `onnx` at 17.4 MB).

## Solution Applied

The Dockerfile has been updated with:
- Increased pip timeout: 1000 seconds (from default 15s)
- Increased retries: 5 attempts (from default 5)
- Global pip configuration for all install commands

## Build Steps

### 1. Clean Rebuild (Recommended First Try)

```bash
# Clean everything
docker-compose down -v
docker system prune -af --volumes

# Rebuild with no cache
docker-compose build --no-cache

# Start services
docker-compose up -d
```

### 2. Alternative: Build with Progress

If you want to see detailed progress:

```bash
# Build with verbose output
docker-compose build --progress=plain --no-cache
```

### 3. If Build Still Fails

#### Option A: Increase Docker Desktop Resources

If you're on Docker Desktop:
1. Open Docker Desktop settings
2. Resources → Advanced
3. Increase:
   - **CPUs**: 4+ cores
   - **Memory**: 8GB+ RAM
   - **Swap**: 2GB+
4. Apply & Restart
5. Try building again

#### Option B: Use a Faster PyPI Mirror

Add to Dockerfile after the `FROM` line:

```dockerfile
# Use a faster PyPI mirror (uncomment one)
# RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple  # China
# RUN pip config set global.index-url https://pypi.org/simple  # Default
```

#### Option C: Pre-download Dependencies Locally

```bash
# Create a local pip cache
mkdir -p .pip-cache

# Download dependencies locally first
pip download -d .pip-cache onnx langchain-anthropic langchain-openai

# Update docker-compose.yml to mount cache
# Add to langgraph-server service:
volumes:
  - ./.pip-cache:/pip-cache
```

Then update Dockerfile:
```dockerfile
RUN --mount=type=cache,target=/root/.cache/pip \
    --mount=type=bind,source=.pip-cache,target=/pip-cache \
    PYTHONDONTWRITEBYTECODE=1 pip install \
    --find-links=/pip-cache \
    -c /api/constraints.txt -e /deps/rag
```

#### Option D: Build in Stages (Split Heavy Dependencies)

Create `heavy-requirements.txt`:
```txt
onnx>=1.16.0
torch>=2.0.0  # if used
transformers>=4.30.0  # if used
```

Update Dockerfile:
```dockerfile
# Install heavy deps separately with longer timeout
COPY heavy-requirements.txt /tmp/
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r /tmp/heavy-requirements.txt || true

# Then install the rest
ADD pyproject.toml README.md /deps/rag/
RUN --mount=type=cache,target=/root/.cache/pip \
    PYTHONDONTWRITEBYTECODE=1 pip install -c /api/constraints.txt -e /deps/rag
```

### 4. Network Issues

#### Check Your Network

```bash
# Test PyPI connectivity
curl -I https://files.pythonhosted.org

# Test DNS resolution
nslookup files.pythonhosted.org

# If behind corporate proxy, configure Docker to use it
```

#### Corporate Proxy Setup

If behind a corporate firewall, update `~/.docker/config.json`:

```json
{
  "proxies": {
    "default": {
      "httpProxy": "http://proxy.example.com:8080",
      "httpsProxy": "http://proxy.example.com:8080",
      "noProxy": "localhost,127.0.0.1"
    }
  }
}
```

### 5. Alternative: Build on Host, Copy to Container

If Docker builds keep failing:

```bash
# Build dependencies on host
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -e .

# Create a wheel
pip wheel -w dist -e .

# Update Dockerfile to install from wheel
COPY dist/*.whl /tmp/
RUN pip install /tmp/*.whl
```

## Common Error Messages

### "Read timed out"
**Cause**: Network too slow or unstable
**Solution**: Increase timeout, use mirror, or pre-download

### "HTTPSConnectionPool: Max retries exceeded"
**Cause**: PyPI is unreachable or blocked
**Solution**: Check firewall, use proxy, or mirror

### "No matching distribution found"
**Cause**: Package incompatible with platform
**Solution**: Check Python version, OS architecture (ARM vs x86)

### "ERROR: Could not install packages due to an OSError"
**Cause**: Permission or disk space issues
**Solution**: Run with sudo or free up disk space

## Verification After Build

```bash
# Check if services are running
docker-compose ps

# Check logs for errors
docker-compose logs langgraph-server

# Test the API
curl http://localhost:8000/health

# Enter container to debug
docker-compose exec langgraph-server bash
python -c "import qdrant_client; print('Qdrant OK')"
python -c "import langchain; print('LangChain OK')"
```

## Performance Tips

### Speed Up Future Builds

1. **Layer Caching**: Don't change `pyproject.toml` frequently
2. **.dockerignore**: Exclude unnecessary files (already configured)
3. **Multi-stage Builds**: Separate build and runtime dependencies
4. **BuildKit**: Use Docker BuildKit for parallel builds

```bash
# Enable BuildKit for faster builds
export DOCKER_BUILDKIT=1
docker-compose build
```

### Reduce Image Size

After successful build:

```bash
# Check image sizes
docker images | grep myagenticragframework

# Clean up dangling images
docker image prune -f
```

## Still Having Issues?

If none of these work:

1. **Check Docker version**: `docker --version` (should be 20.10+)
2. **Check disk space**: `df -h` (need 10GB+ free)
3. **Restart Docker**: Sometimes helps with network issues
4. **Try different network**: Cellular hotspot, VPN, different WiFi
5. **Build on different machine**: Cloud VM with better internet

## Quick Recovery Commands

```bash
# Complete reset
docker-compose down -v
docker system prune -af --volumes
docker-compose build --no-cache
docker-compose up -d

# Check everything
docker-compose ps
docker-compose logs -f
```

## Contact Information

If you're still stuck:
1. Check Docker logs: `docker-compose logs langgraph-server > logs.txt`
2. Check system info: `docker info > system-info.txt`
3. Share error details with your team or Docker support
