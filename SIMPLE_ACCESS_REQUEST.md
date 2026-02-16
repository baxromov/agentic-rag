# Simple Network Access Request - Docker AI Development

## 🎯 Quick Summary
Need HTTPS (port 443) access to these domains for Docker-based AI development:

---

## ✅ Essential Domains (Must Have)

### Python Packages
```
pypi.org
files.pythonhosted.org
```

### Docker Images  
```
registry-1.docker.io
auth.docker.io
production.cloudflare.docker.com
```

### AI Models
```
huggingface.co
cdn-lfs.huggingface.co
```

### Frontend Packages
```
registry.npmjs.org
```

### DNS
```
8.8.8.8 (UDP port 53)
1.1.1.1 (UDP port 53)
```

---

## 🔧 Alternative: Proxy Configuration

If direct access not allowed, provide:
```bash
HTTP_PROXY=http://proxy.company.com:8080
HTTPS_PROXY=http://proxy.company.com:8080
```

---

## 📋 Copy-Paste for IT Ticket

```
Request Type: Firewall Exception / Proxy Whitelist
Purpose: Docker-based AI Development Environment
Protocol: HTTPS (port 443), DNS (UDP port 53)

Domains Needed:
- pypi.org (Python packages)
- files.pythonhosted.org (Python packages CDN)
- registry-1.docker.io (Docker images)
- auth.docker.io (Docker authentication)
- production.cloudflare.docker.com (Docker CDN)
- huggingface.co (AI model downloads)
- cdn-lfs.huggingface.co (AI model CDN)
- registry.npmjs.org (JavaScript packages)
- 8.8.8.8 (Google DNS)
- 1.1.1.1 (Cloudflare DNS)

All traffic is HTTPS encrypted, from official repositories only.
No incoming connections, only outbound HTTPS.
Required for: pip install, docker pull, npm install

Business Impact: Enables AI/ML development, improves productivity
Security: All traffic encrypted, checksum-verified packages
Alternative: Provide corporate proxy settings if direct access denied
```

---

## 🚀 Quick Test After Access Granted

```bash
# Test all endpoints
curl -I https://pypi.org
curl -I https://registry-1.docker.io  
curl -I https://huggingface.co
curl -I https://registry.npmjs.org
nslookup pypi.org 8.8.8.8

# If all return 200 OK, run:
docker compose build
docker compose up
```

---

## ⚠️ If Access Denied

Use PyPI mirrors (China/Russia servers):
```bash
docker compose build \
  --build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
```

Or build on mobile hotspot/home network, transfer images to corporate machine.

---

See **CORPORATE_NETWORK_ACCESS_REQUEST.md** for complete details and email template.
