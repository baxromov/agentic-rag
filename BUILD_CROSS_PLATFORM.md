# Cross-Platform Docker Build Guide

## Problem
Docker builds work on Apple Silicon (ARM64) but fail on Intel/AMD (x86_64) machines or vice versa.

## Solution Options

### Option 1: Build for Specific Platform (Quick Fix)

On the **other computer**, build with platform flag:

```bash
# For x86_64/AMD64 (Intel/AMD)
docker compose build --build-arg BUILDPLATFORM=linux/amd64

# OR force platform in docker-compose.yml
```

### Option 2: Multi-Platform Build (Best Practice)

Build images that work on both architectures:

```bash
# Enable buildx (if not already enabled)
docker buildx create --use

# Build for multiple platforms
docker buildx build --platform linux/amd64,linux/arm64 \
  -t myagenticragframework-model-server:latest \
  --push \
  ./model_server
```

### Option 3: Update docker-compose.yml with Platform

Add platform specification to docker-compose.yml:

```yaml
services:
  model-server:
    platform: linux/amd64  # or linux/arm64
    build:
      context: ./model_server
      dockerfile: Dockerfile
```

### Option 4: Use Pre-built Wheels (Fastest)

Add to Dockerfile before pip install:

```dockerfile
# Use pre-built wheels for faster installation
RUN pip install --prefer-binary -r requirements.txt
```

## Fixes Applied

1. ✅ Added build dependencies (gcc, g++, build-essential)
2. ✅ Increased pip timeout to 1000s
3. ✅ Added retry logic (5 retries)
4. ✅ Used --no-cache-dir to avoid corruption
5. ✅ Added .dockerignore to reduce context

## Testing on Another Computer

```bash
# Clean build
docker compose down -v
docker compose build --no-cache
docker compose up

# If still fails, try:
docker compose build --build-arg BUILDPLATFORM=linux/amd64
docker compose up
```

## Common Issues

### 1. Network/Timeout
```bash
# Increase Docker daemon timeout
# In Docker Desktop: Settings > Docker Engine
{
  "max-concurrent-downloads": 3,
  "max-download-attempts": 5
}
```

### 2. Disk Space
```bash
# Clean up Docker
docker system prune -a --volumes
```

### 3. Python Package Compatibility
Some packages (like onnxruntime, fastembed) have platform-specific wheels:
- ARM64: Often builds from source (slower)
- x86_64: Usually has pre-built wheels (faster)

## Architecture Detection

```bash
# Check your architecture
uname -m

# arm64 or aarch64 = Apple Silicon / ARM
# x86_64 or amd64 = Intel/AMD
```

## Recommended: Platform-Specific Builds

For production, build separate images for each platform:

```bash
# On ARM64 machine
docker build --platform linux/arm64 -t registry.com/app:arm64 .

# On x86_64 machine
docker build --platform linux/amd64 -t registry.com/app:amd64 .

# Create manifest
docker manifest create registry.com/app:latest \
  registry.com/app:arm64 \
  registry.com/app:amd64
```
