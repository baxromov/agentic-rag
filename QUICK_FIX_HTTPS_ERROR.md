# Quick Fix: HTTPSConnectionPool Error

## Error Message
```
HTTPSConnectionPool(host='pypi.org', port=443): Max retries exceeded
```

## Immediate Solutions (Try in Order)

### 1. Use PyPI Mirror (Fastest Fix)
```bash
# Stop containers
docker compose down

# Build with Chinese mirror (usually fastest)
docker compose build --build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

# Or use Aliyun mirror
docker compose build --build-arg PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/

# Start
docker compose up
```

### 2. Use Different DNS
Add to `docker-compose.yml`:
```yaml
services:
  model-server:
    dns:
      - 8.8.8.8  # Google DNS
      - 1.1.1.1  # Cloudflare DNS
```

### 3. Enable BuildKit & Retry
```bash
export DOCKER_BUILDKIT=1
docker compose build --no-cache
docker compose up
```

### 4. Try Mobile Hotspot
Sometimes corporate/home network blocks PyPI:
- Connect computer to phone hotspot
- Rebuild: `docker compose build`

### 5. Check System Time
Wrong system time causes SSL errors:
```bash
# Linux/Mac
date

# If wrong, sync:
sudo ntpdate -s time.nist.gov
```

## Already Applied in Dockerfile ✅

Our updated Dockerfile already has:
- ✅ 1000s timeout (was 15s)
- ✅ 10 retries (was 5)
- ✅ Auto-retry with sleep on failure
- ✅ Retry for model downloads too

## Still Failing?

See full guide: `TROUBLESHOOTING_NETWORK.md`

Or use offline build:
```bash
# On working computer
pip download -r model_server/requirements.txt -d wheels/
tar -czf wheels.tar.gz wheels/

# Transfer wheels.tar.gz to other computer
# Then build offline
```
