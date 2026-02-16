# Corporate Network Access Request for Docker & AI Development

## Executive Summary
Request firewall/proxy exceptions to enable Docker-based AI development with Python packages, ML models, and container registries.

---

## 📋 Required Access List

### 1. **Python Package Repositories (Critical)**

#### PyPI - Official Python Package Index
- **Primary:** `pypi.org` (HTTPS, port 443)
- **CDN:** `files.pythonhosted.org` (HTTPS, port 443)
- **API:** `pypi.python.org` (HTTPS, port 443)

#### Alternative Mirrors (If PyPI blocked)
- `pypi.tuna.tsinghua.edu.cn` (China mirror)
- `mirrors.aliyun.com` (Aliyun mirror)
- `pypi.doubanio.com` (Douban mirror)

**Why needed:** Install Python dependencies (FastAPI, LangChain, Pydantic, etc.)

---

### 2. **Docker Registries (Critical)**

#### Docker Hub
- **Registry:** `registry-1.docker.io` (HTTPS, port 443)
- **Auth:** `auth.docker.io` (HTTPS, port 443)
- **Production:** `production.cloudflare.docker.com` (HTTPS, port 443)
- **Index:** `index.docker.io` (HTTPS, port 443)

#### GitHub Container Registry (if using)
- `ghcr.io` (HTTPS, port 443)

#### Google Container Registry (if using)
- `gcr.io` (HTTPS, port 443)

**Why needed:** Pull base Docker images (python:3.12-slim, node:20-alpine, postgres, redis, etc.)

---

### 3. **AI Model Repositories (Critical for ML)**

#### HuggingFace
- **Main:** `huggingface.co` (HTTPS, port 443)
- **CDN:** `cdn-lfs.huggingface.co` (HTTPS, port 443)
- **Models:** `cdn-lfs-us-1.huggingface.co` (HTTPS, port 443)

#### Ollama (if using local LLMs)
- `ollama.ai` (HTTPS, port 443)
- `registry.ollama.ai` (HTTPS, port 443)

**Why needed:** Download embedding models (all-MiniLM-L6-v2), reranking models (jina-reranker)

---

### 4. **LLM API Providers (If Using Cloud LLMs)**

#### OpenAI
- `api.openai.com` (HTTPS, port 443)

#### Anthropic (Claude)
- `api.anthropic.com` (HTTPS, port 443)

#### Azure OpenAI
- `*.openai.azure.com` (HTTPS, port 443)

**Why needed:** AI model inference for RAG system

---

### 5. **NPM Package Registry (Frontend)**

#### NPM Official
- `registry.npmjs.org` (HTTPS, port 443)
- `registry.npmjs.com` (HTTPS, port 443)

#### Alternative
- `registry.npmmirror.com` (China mirror)

**Why needed:** Install React, TypeScript, Vite frontend dependencies

---

### 6. **Git Repositories**

#### GitHub
- `github.com` (HTTPS, port 443)
- `api.github.com` (HTTPS, port 443)
- `raw.githubusercontent.com` (HTTPS, port 443)

#### GitLab (if using)
- `gitlab.com` (HTTPS, port 443)

**Why needed:** Clone repositories, version control, CI/CD

---

### 7. **Object Storage (If Using Cloud)**

#### AWS S3 (if using)
- `*.s3.amazonaws.com` (HTTPS, port 443)
- `s3.amazonaws.com` (HTTPS, port 443)

#### MinIO (Self-hosted - Internal only)
- Internal network access only
- Ports: 9000, 9001

**Why needed:** Document storage in RAG system

---

### 8. **Database & Infrastructure**

#### PostgreSQL APT Repository
- `apt.postgresql.org` (HTTPS, port 443)

#### Redis APT Repository  
- `packages.redis.io` (HTTPS, port 443)

**Why needed:** Database dependencies in Docker builds

---

### 9. **DNS & NTP Services**

#### DNS Servers
- `8.8.8.8` (Google DNS, UDP port 53)
- `8.8.4.4` (Google DNS backup, UDP port 53)
- `1.1.1.1` (Cloudflare DNS, UDP port 53)

#### NTP (Time Sync)
- `time.nist.gov` (UDP port 123)
- `pool.ntp.org` (UDP port 123)

**Why needed:** Resolve domain names, SSL certificate validation

---

### 10. **Development Tools**

#### VS Code Extensions
- `marketplace.visualstudio.com` (HTTPS, port 443)
- `*.vo.msecnd.net` (HTTPS, port 443)

#### LangGraph Cloud (if using)
- `*.langgraph.com` (HTTPS, port 443)

**Why needed:** IDE extensions, debugging tools

---

## 🚀 Alternative: Use Corporate Proxy

If direct internet access is restricted, request proxy configuration:

### Proxy Settings Needed
```bash
HTTP_PROXY=http://proxy.company.com:8080
HTTPS_PROXY=http://proxy.company.com:8080
NO_PROXY=localhost,127.0.0.1,*.company.com
```

### Docker Daemon Configuration
```json
{
  "proxies": {
    "default": {
      "httpProxy": "http://proxy.company.com:8080",
      "httpsProxy": "http://proxy.company.com:8080",
      "noProxy": "localhost,127.0.0.1,*.company.com"
    }
  }
}
```

---

## 📝 Email Template for IT/Security Team

```
Subject: Network Access Request for AI/ML Docker Development Environment

Dear IT Security Team,

I am working on an AI-powered RAG (Retrieval-Augmented Generation) system using Docker 
and require network access to essential development resources.

PROJECT OVERVIEW:
- Technology Stack: Python, Docker, FastAPI, LangChain, React
- Use Case: Internal knowledge base search with AI assistance
- Deployment: Docker Compose with containerized services

REQUIRED ACCESS:
Please whitelist the following domains for HTTPS (port 443) access:

1. Python Packages:
   - pypi.org, files.pythonhosted.org (Python dependencies)

2. Docker Images:
   - registry-1.docker.io, auth.docker.io (Base container images)

3. AI Models:
   - huggingface.co, cdn-lfs.huggingface.co (ML model downloads)

4. Frontend Dependencies:
   - registry.npmjs.org (JavaScript packages)

5. DNS:
   - 8.8.8.8, 1.1.1.1 (For reliable domain resolution)

SECURITY CONSIDERATIONS:
- All traffic is over HTTPS (encrypted)
- No executable code is downloaded from untrusted sources
- All packages verified with checksums
- Container images from official repositories only
- Local development environment (not production internet-facing)

ALTERNATIVE SOLUTION:
If direct access is not possible, please provide:
1. Corporate proxy configuration (HTTP/HTTPS proxy settings)
2. Internal PyPI mirror (if available)
3. Internal Docker registry (if available)

BUSINESS JUSTIFICATION:
This development environment enables:
- Faster AI feature development
- Improved knowledge management
- Automated document processing
- Enhanced team productivity

See attached: CORPORATE_NETWORK_ACCESS_REQUEST.md for complete technical details.

Please let me know if you need additional information or security compliance documentation.

Best regards,
[Your Name]
[Department]
[Contact Info]
```

---

## 🔒 Security Compliance Points

### Data Privacy
- ✅ All data processed locally in Docker containers
- ✅ No data sent to external services (except LLM API if configured)
- ✅ MinIO for local object storage (not cloud S3)
- ✅ PostgreSQL for local database (not cloud DB)

### Network Security
- ✅ All traffic over HTTPS (TLS encryption)
- ✅ Package integrity verification (pip checksums, Docker content trust)
- ✅ No incoming connections (only outbound HTTPS)
- ✅ Firewall rules can limit to specific IPs if needed

### Compliance
- ✅ Reproducible builds (requirements.txt, Dockerfile)
- ✅ Version-pinned dependencies (security updates controlled)
- ✅ Audit trail (Git history, container logs)
- ✅ Can run fully offline after initial setup

---

## 🛠️ Temporary Workaround (Until Access Granted)

### 1. Build on Personal Network
```bash
# At home or cafe (free network)
docker compose build
docker save -o images.tar \
  myagenticragframework-fastapi \
  myagenticragframework-langgraph-server \
  myagenticragframework-model-server

# Transfer images.tar to work computer via USB/network share
docker load -i images.tar
docker compose up
```

### 2. Use Mobile Hotspot
```bash
# Connect laptop to phone hotspot
# Build images
docker compose build

# Disconnect from hotspot
# Use corporate network for running only
docker compose up
```

### 3. Pre-download Packages
```bash
# On unrestricted network
pip download -r requirements.txt -d wheels/
npm ci --cache npm-cache/

# Transfer wheels/ and npm-cache/ to corporate machine
# Build offline
```

---

## 📊 Minimal Access (If Full Access Denied)

If security team can't grant full access, request **minimum required**:

### Priority 1 (Must Have)
- `pypi.org` - Python packages
- `registry-1.docker.io` - Docker images
- `8.8.8.8` - DNS resolution

### Priority 2 (Important)
- `huggingface.co` - AI models
- `registry.npmjs.org` - Frontend packages

### Priority 3 (Nice to Have)
- `api.openai.com` or `api.anthropic.com` - Cloud LLMs
- `github.com` - Git operations

---

## 🎯 Success Criteria

After access granted, verify with:

```bash
# Test PyPI
curl -I https://pypi.org

# Test Docker Hub
curl -I https://registry-1.docker.io

# Test HuggingFace
curl -I https://huggingface.co

# Test DNS
nslookup pypi.org 8.8.8.8

# Build project
docker compose build
docker compose up
```

All should return `200 OK` or successful responses.

---

## 📞 Support

If access request is denied or you need help:
1. Check TROUBLESHOOTING_NETWORK.md for proxy configuration
2. See QUICK_FIX_HTTPS_ERROR.md for mirror alternatives
3. Contact DevOps team for internal mirrors/proxies
4. Escalate to manager with business justification

---

## 📎 Attachments to Include

1. This document (CORPORATE_NETWORK_ACCESS_REQUEST.md)
2. Project README.md
3. Architecture diagram (if available)
4. Security compliance checklist
5. List of all Python dependencies (requirements.txt)
