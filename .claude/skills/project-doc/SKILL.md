---
name: project-doc
description: Generate comprehensive project documentation for RAG applications. Creates README, architecture docs, API docs, deployment guides, and security documentation.
disable-model-invocation: true
context: fork
agent: doc-writer
---

# Project Documentation Generator

## What to document
$ARGUMENTS

## Available Document Types
1. **README.md** — Quick start, architecture overview, tech stack
2. **Architecture doc** — Detailed system design with diagrams
3. **API reference** — All endpoints with examples
4. **Deployment guide** — Docker, Kubernetes, environment setup
5. **Security doc** — Auth, encryption, guardrails, compliance
6. **Development guide** — Local setup, coding standards, testing

## Steps
1. Read existing codebase to understand the project
2. Identify what documentation exists and what's missing
3. Generate requested documentation type
4. Include code examples and diagrams where applicable
5. Follow the project's existing conventions
