---
name: arch-review
description: Review architecture design for any RAG/AI application. Analyzes tech stack choices, infrastructure sizing, data flow, security, and production readiness.
context: fork
agent: rag-architect
---

# Architecture Review

Review the architecture of this RAG application.

## Focus
$ARGUMENTS

## Steps
1. Read all architecture-related files (diagrams, docker-compose, README, CLAUDE.md)
2. Analyze component selection and trade-offs
3. Review data flow (ingestion → storage → retrieval → generation)
4. Check infrastructure sizing (CPU, RAM, GPU, storage)
5. Evaluate security architecture
6. Assess production readiness and scalability
7. Provide structured findings with recommendations
