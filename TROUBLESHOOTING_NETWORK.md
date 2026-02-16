# Troubleshooting HTTPSConnectionPool Errors

## Common Error Messages

```
HTTPSConnectionPool(host='pypi.org', port=443): Max retries exceeded
HTTPSConnectionPool(host='files.pythonhosted.org', port=443): Read timed out
urllib3.exceptions.MaxRetryError: HTTPSConnectionPool
requests.exceptions.ConnectionError: HTTPSConnectionPool
```

## Root Causes

1. **Network timeout** - PyPI servers slow or unreachable
2. **Firewall/Proxy** - Corporate network blocking requests
3. **DNS issues** - Can't resolve pypi.org
4. **SSL/TLS problems** - Certificate verification failures
5. **Rate limiting** - Too many requests to PyPI
6. **ISP throttling** - Internet provider limiting connections

---

## Quick Fixes (Try in Order)

### 1. **Increase Timeout & Retries** ✅ (Already Applied)

Our Dockerfile already has:
```dockerfile
RUN pip config set global.timeout 1000 && \
    pip config set global.retries 5
```

### 2. **Use PyPI Mirror/CDN**

If PyPI is blocked/slow, use a mirror:

**Option A: Add to Dockerfile**
```dockerfile
# Before pip install, add:
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
# OR
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/
```

**Option B: Pass at Build Time**
```bash
docker compose build --build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
```

### 3. **Configure Docker DNS**

Add to `docker-compose.yml`:
```yaml
services:
  model-server:
    dns:
      - 8.8.8.8
      - 8.8.4.4
    build:
      context: ./model_server
```

### 4. **Use HTTP Instead of HTTPS** (Less Secure)

```bash
# Temporary workaround
docker compose build --build-arg PIP_TRUSTED_HOST=pypi.org \
                     --build-arg PIP_TRUSTED_HOST=files.pythonhosted.org
```

### 5. **Check System Proxy Settings**

If behind corporate proxy:

**Add to Dockerfile:**
```dockerfile
# Before pip install
ENV HTTP_PROXY=http://proxy.company.com:8080
ENV HTTPS_PROXY=http://proxy.company.com:8080
ENV NO_PROXY=localhost,127.0.0.1
```

**OR use docker-compose.yml:**
```yaml
services:
  model-server:
    build:
      context: ./model_server
      args:
        HTTP_PROXY: http://proxy.company.com:8080
        HTTPS_PROXY: http://proxy.company.com:8080
```

### 6. **Disable IPv6** (Sometimes helps)

```bash
# In Docker Desktop: Settings > Docker Engine, add:
{
  "ipv6": false
}
```

### 7. **Use --network=host for Build**

```bash
docker build --network=host -t model-server ./model_server
```

---

## Persistent Solutions

### Solution 1: Pre-download Packages Locally

**Step 1:** Download wheels on working computer:
```bash
pip download -r requirements.txt -d ./wheels
```

**Step 2:** Modify Dockerfile:
```dockerfile
COPY requirements.txt .
COPY wheels/ /tmp/wheels/

RUN pip install --no-index --find-links=/tmp/wheels -r requirements.txt
```

**Step 3:** Add to .dockerignore:
```
!wheels/
```

### Solution 2: Use Nexus/Artifactory

Set up internal PyPI mirror:
```dockerfile
RUN pip config set global.index-url http://nexus.company.com/pypi/simple
RUN pip config set global.trusted-host nexus.company.com
```

### Solution 3: Build with Buildkit Cache

```bash
# Enable BuildKit
export DOCKER_BUILDKIT=1

# Build with cache mount (already in Dockerfile)
docker compose build
```

---

## Diagnosis Commands

### Check Network from Inside Container
```bash
# Start a test container
docker run --rm -it python:3.12-slim bash

# Inside container, test:
apt-get update
apt-get install -y curl
curl -v https://pypi.org/simple/
ping pypi.org
nslookup pypi.org
```

### Check DNS Resolution
```bash
# On host
nslookup pypi.org

# Should return IP addresses like:
# 151.101.XXX.XXX
```

### Check Proxy Settings
```bash
echo $HTTP_PROXY
echo $HTTPS_PROXY
docker info | grep -i proxy
```

### Check Docker Network
```bash
docker network ls
docker network inspect bridge
```

---

## Platform-Specific Fixes

### Windows
```powershell
# Flush DNS
ipconfig /flushdns

# Reset Docker network
docker network prune -f
```

### macOS
```bash
# Flush DNS
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder

# Reset Docker
docker system prune -a --volumes -f
```

### Linux
```bash
# Restart Docker
sudo systemctl restart docker

# Flush DNS
sudo systemd-resolve --flush-caches

# Check firewall
sudo iptables -L
sudo ufw status
```

---

## Updated Dockerfile with All Fixes

Here's a bulletproof version:

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Configure pip for reliability
RUN pip config set global.timeout 1000 && \
    pip config set global.retries 10 && \
    pip config set global.no-cache-dir true

# Optional: Use mirror (uncomment if needed)
# RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple

# Upgrade pip with retry
RUN for i in 1 2 3 4 5; do \
      pip install --no-cache-dir --upgrade pip setuptools wheel && break || sleep 10; \
    done

# Install dependencies with retry logic
COPY requirements.txt .
RUN for i in 1 2 3 4 5; do \
      pip install -r requirements.txt && break || sleep 15; \
    done

# Pre-download models with retry
RUN for i in 1 2 3; do \
      python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='sentence-transformers/all-MiniLM-L6-v2')" && break || sleep 20; \
    done

COPY . .

EXPOSE 8080

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
```

---

## Emergency Workaround

If nothing works, build without network:

1. **On working computer:**
```bash
# Create offline bundle
pip download -r requirements.txt -d ./offline_packages
tar -czf packages.tar.gz offline_packages/
```

2. **Transfer `packages.tar.gz` to other computer**

3. **On other computer:**
```bash
tar -xzf packages.tar.gz
docker build --network=none -t model-server .
```

---

## Recommended: Production Setup

For reliable builds in production:

1. **Use private PyPI mirror** (Nexus, Artifactory, or AWS CodeArtifact)
2. **Pre-build base images** with common dependencies
3. **Use multi-stage builds** to cache layers
4. **Implement retry logic** in CI/CD
5. **Monitor PyPI status**: https://status.python.org/

---

## Still Having Issues?

1. Check PyPI status: https://status.python.org/
2. Try different network (mobile hotspot)
3. Disable VPN/antivirus temporarily
4. Use Docker BuildKit: `export DOCKER_BUILDKIT=1`
5. Clear Docker cache: `docker builder prune -af`
