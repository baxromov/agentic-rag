---
name: security-audit
description: Run a security audit on any RAG/AI application. Covers OWASP Top 10 for LLMs, API security, container security, auth flows, and AI guardrails.
context: fork
agent: security-auditor
---

# Security Audit

Run a comprehensive security audit on this RAG application.

## Focus Area
$ARGUMENTS

## Steps
1. Scan the codebase for security issues:
   - Hardcoded secrets, API keys, passwords
   - SQL/NoSQL injection vectors
   - Missing input validation
   - Insecure JWT implementation
   - Missing CORS restrictions

2. Review infrastructure:
   - Docker security (non-root, resource limits, image tags)
   - Network exposure (unnecessary ports)
   - TLS/SSL configuration
   - Database authentication

3. Check AI-specific security:
   - Prompt injection defenses
   - Output safety guardrails
   - PII leakage prevention
   - Model access control

4. Generate audit report with severity ratings and remediation steps
