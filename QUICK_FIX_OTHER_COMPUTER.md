# Quick Fix for Other Computer

## The Problem
Your Mac is **ARM64** (Apple Silicon), the other computer is likely **x86_64** (Intel/AMD).

## Immediate Solution

On the **other computer**, run these commands:

### Option A: Simple Platform Fix (Easiest)
```bash
# Stop everything
docker compose down -v

# Build with platform specification
export DOCKER_DEFAULT_PLATFORM=linux/amd64

# Rebuild and start
docker compose build --no-cache
docker compose up
```

### Option B: Modify docker-compose.yml (Recommended)
Add this line to each service that's failing:

```yaml
services:
  model-server:
    platform: linux/amd64  # Add this line
    build:
      context: ./model_server
```

### Option C: Clean Everything First
```bash
# Complete clean slate
docker compose down -v
docker system prune -a --volumes -f
docker compose build --no-cache --pull
docker compose up
```

## Why This Happens

| Your Computer | Other Computer | Issue |
|--------------|----------------|-------|
| ARM64 (M1/M2/M3) | x86_64 (Intel/AMD) | Package binaries don't match |
| macOS | Linux/Windows | Different default platforms |
| Fast build | Slow/failing build | Missing pre-compiled wheels |

## What The Fix Does

The updated Dockerfile now:
1. ✅ Installs gcc/g++ for compiling packages
2. ✅ Sets longer timeout (1000s vs default 15s)
3. ✅ Retries failed downloads (5 attempts)
4. ✅ Uses --no-cache-dir to avoid corrupted cache

## Test It

After applying the fix, commit and push:

```bash
git add .
git commit -m "fix: Add cross-platform Docker build support"
git push
```

Then on the **other computer**:

```bash
git pull
docker compose build --no-cache
docker compose up
```

Should work now! 🚀
