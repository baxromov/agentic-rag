# Техническая документация: Agentic RAG Platform

**Версия документа:** 1.0
**Дата:** 03.03.2026
**Подготовлено для:** Департамент IT-безопасности, АО «Ипотека-банк»
**Тип развертывания:** Локальная сеть (on-premise)

---

## Содержание

1. [Общее описание системы](#1-общее-описание-системы)
2. [Архитектурная диаграмма](#2-архитектурная-диаграмма)
3. [Перечень сервисов](#3-перечень-сервисов)
4. [Требования к GPU и оборудованию](#4-требования-к-gpu-и-оборудованию)
5. [Требования к ресурсам по сервисам](#5-требования-к-ресурсам-по-сервисам)
6. [Сетевая конфигурация](#6-сетевая-конфигурация)
7. [Диаграмма потоков данных](#7-диаграмма-потоков-данных)
8. [Безопасность](#8-безопасность)
9. [Хранение данных](#9-хранение-данных)
10. [Внешние подключения](#10-внешние-подключения)
11. [Рекомендации по безопасности для production](#11-рекомендации-по-безопасности-для-production)

---

## 1. Общее описание системы

**Agentic RAG** — платформа для интеллектуального поиска и ответов на вопросы по внутренним документам банка с использованием технологий Retrieval-Augmented Generation (RAG).

### Назначение

- Загрузка и индексация внутренних документов (PDF, DOCX, XLSX)
- Гибридный поиск по документам (векторный + полнотекстовый)
- Генерация ответов на вопросы сотрудников на основе найденных документов
- Поддержка трёх языков: узбекский, русский, английский

### Основные технологии

| Компонент | Технология |
|-----------|-----------|
| Backend API | Python 3.12, FastAPI |
| Агент (AI-оркестрация) | LangGraph (граф состояний с циклами) |
| Векторная БД | Qdrant (гибридный поиск: dense + full-text, RRF-фьюжн) |
| Объектное хранилище | MinIO (S3-совместимое) |
| Embedding-модель | Ollama — nomic-embed-text (768 измерений) |
| Reranker | jinaai/jina-reranker-v2-base-multilingual (FastEmbed) |
| LLM (языковая модель) | Настраиваемо: Ollama (local) / Claude API / OpenAI API |
| БД аутентификации и состояние агента | MongoDB 7 (пользователи, сессии, feedback, LangGraph checkpoints — AsyncMongoDBSaver) |
| Кэш и pub/sub | Redis 7 |
| Observability | Langfuse v3 (опционально) |
| Контейнеризация | Docker Compose |

---

## 2. Архитектурная диаграмма

```
                              ┌─────────────────────────────────────────────────────────────┐
                              │                    Docker Network: rag-network               │
                              │                    (bridge, MTU 1500)                        │
                              │                                                             │
  Пользователь               │        ┌──────────────┐                                   │
  (браузер)                   │        │   FastAPI    │                                   │
  ───────────────────────────►│        │   Backend    │                                   │
       :8000                  │        │   :8000      │                                   │
                              │        └──────┬───────┘                                   │
                              │                             │                               │
                              │          ┌──────────────────┼──────────────────┐             │
                              │          │                  │                  │             │
                              │          ▼                               ▼             │
                              │  ┌──────────────────────────┐  ┌──────────────┐       │
                              │  │         MongoDB           │  │    Redis     │       │
                              │  │         :27017            │  │    :6379     │       │
                              │  │ (users, feedback,         │  │ (pub/sub,    │       │
                              │  │  sessions, checkpoints    │  │  кэш,        │       │
                              │  │  AsyncMongoDBSaver)       │  │  langfuse)   │       │
                              │  └──────────────────────────┘  └──────────────┘       │
                              │                             │                               │
                              │          ┌──────────────────┼──────────────────┐             │
                              │          ▼                  ▼                  ▼             │
                              │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
                              │  │   Qdrant     │  │    MinIO     │  │ Model Server │       │
                              │  │  :6333/:6334 │  │  :9000/:9001 │  │    :8080     │       │
                              │  │ (векторы,    │  │ (документы,  │  │ (reranker    │       │
                              │  │  full-text)  │  │  langfuse)   │  │  FastEmbed)  │       │
                              │  └──────────────┘  └──────────────┘  └──────────────┘       │
                              │                                                             │
                              │  ┌──────────────┐  ┌──────────────────────────────────┐     │
                              │  │  LangGraph   │  │         Langfuse v3              │     │
                              │  │  Server      │  │  ┌────────┐ ┌────────┐ ┌──────┐  │     │
                              │  │  :8123       │  │  │ Web UI │ │ Worker │ │Click-│  │     │
                              │  │ (альтерн.   │  │  │ :3000  │ │        │ │House │  │     │
                              │  │  API агента) │  │  └────────┘ └────────┘ └──────┘  │     │
                              │  └──────────────┘  │  Langfuse PostgreSQL :5433       │     │
                              │                    └──────────────────────────────────┘     │
                              │                                                             │
                              └─────────────────────────────────────────────────────────────┘
                                             │
                                             ▼
                              ┌──────────────────────────────┐
                              │   Host Machine (вне Docker)  │
                              │                              │
                              │   Ollama :11434              │
                              │   (LLM + Embedding models)   │
                              │   Доступ: host.docker.       │
                              │           internal:11434     │
                              └──────────────────────────────┘
```

---

## 3. Перечень сервисов

### 3.1. FastAPI Backend

| Параметр | Значение |
|----------|---------|
| Образ | Собственная сборка (`Dockerfile`) |
| Базовый образ | `python:3.12-slim` |
| Порт | 8000 |
| Назначение | Основной API-сервер: маршрутизация запросов, загрузка документов, чат (SSE-стриминг), аутентификация, сессии, feedback |
| Зависимости | MinIO, Qdrant, Redis, MongoDB, Model Server, Ollama (на хосте) |

Дополнительные системные пакеты в контейнере: `libmagic1`, `poppler-utils`, `tesseract-ocr`, `libreoffice-core`, `pandoc`, `libgl1`, `libglib2.0-0` — для парсинга PDF/DOCX/XLSX.

### 3.2. LangGraph Server

| Параметр | Значение |
|----------|---------|
| Образ | Собственная сборка (`Dockerfile.langgraph`) |
| Базовый образ | `python:3.12-slim` |
| Порт | 8123 (внутренний 8000) |
| Назначение | Альтернативный API для LangGraph-агента (управление потоками, сессиями) |
| Зависимости | MinIO, Qdrant, Redis, MongoDB, Model Server, Ollama (на хосте) |

### 3.3. Model Server (Reranker)

| Параметр | Значение |
|----------|---------|
| Образ | Собственная сборка (`model_server/Dockerfile`) |
| Базовый образ | `python:3.12-slim` |
| Порт | 8080 |
| Назначение | HTTP-сервер для reranker-модели (jinaai/jina-reranker-v2-base-multilingual) на базе FastEmbed |
| Модель | Скачивается автоматически с HuggingFace при первом запуске (~560 MB) |
| Volumes | `model_cache:/root/.cache` — кэш модели между перезапусками |

### 3.4. Qdrant (Векторная БД)

| Параметр | Значение |
|----------|---------|
| Образ | `qdrant/qdrant:latest` |
| Порты | 6333 (HTTP API), 6334 (gRPC) |
| Назначение | Хранение и поиск векторных представлений документов |
| Коллекция | `documents` — содержит dense-векторы (768-dim) и полнотекстовый индекс |
| Метод поиска | Гибридный: dense + full-text с RRF-фьюжн (k=40) |
| Volumes | `qdrant_data:/qdrant/storage` |

### 3.5. MongoDB

| Параметр | Значение |
|----------|---------|
| Образ | `mongo:7` |
| Порт | 27017 |
| Назначение | Хранение пользователей, сессий чатов, обратной связи, а также состояния LangGraph-агента (AsyncMongoDBSaver) |
| Аутентификация | Без аутентификации (по умолчанию) |

**Коллекции/БД:**

| База / Коллекция | Назначение |
|-----------------|-----------|
| `rag` / `users` | Учётные записи пользователей (username, password_hash, role) |
| `rag` / `chat_sessions` | Метаданные сессий чата (title, user_id, message_count) |
| `rag` / `message_feedback` | Обратная связь по сообщениям (thumbs up/down, индекс по thread_id + message_index) |
| `langgraph` / checkpoints | Checkpoints и состояние LangGraph-графа (AsyncMongoDBSaver) |

### 3.6. Redis

| Параметр | Значение |
|----------|---------|
| Образ | `redis:7-alpine` |
| Порт | 6379 |
| Назначение | Pub/sub для LangGraph, кэширование, очередь сообщений |
| Аутентификация | Без аутентификации |

**Используется:**

| Компонент | Использование |
|-----------|-------------|
| FastAPI Backend | Pub/sub для LangGraph |
| LangGraph Server | Координация агентов |
| Langfuse Worker | Очередь обработки событий |

### 3.7. MinIO (S3-совместимое хранилище)

| Параметр | Значение |
|----------|---------|
| Образ | `minio/minio:latest` |
| Порты | 9000 (API), 9001 (Web-консоль) |
| Назначение | Хранение загруженных документов и данных Langfuse |
| Аутентификация | `minioadmin` / `minioadmin` (по умолчанию) |

**Бакеты:**

| Бакет | Назначение | Создаётся |
|-------|-----------|-----------|
| `documents` | Загруженные документы (PDF, DOCX, XLSX) | `minio-init` контейнер |
| `langfuse` | Данные Langfuse (events, media) | `minio-init` контейнер |

### 3.8. Langfuse v3 (Observability) — опциональный

Langfuse состоит из 4 контейнеров:

| Контейнер | Образ | Порт | Назначение |
|-----------|-------|------|-----------|
| `langfuse` | `langfuse/langfuse:3` | 3000 | Web UI для мониторинга LLM-запросов |
| `langfuse-worker` | `langfuse/langfuse-worker:3` | — | Фоновая обработка событий |
| `langfuse-postgres` | `postgres:16-alpine` | 5433 | Отдельная БД Langfuse (пользователь: `langfuse`, БД: `langfuse`) |
| `langfuse-clickhouse` | `clickhouse/clickhouse-server` | — | Аналитическое хранилище (OLAP) |

Langfuse включается/отключается переменной `LANGFUSE_ENABLED` (по умолчанию: `false`).

### 3.9. Ollama (на хост-машине, вне Docker)

| Параметр | Значение |
|----------|---------|
| Порт | 11434 |
| Назначение | Inference LLM-моделей и embedding-моделей |
| Доступ из Docker | `host.docker.internal:11434` |
| Модели | LLM (`gpt-oss-120b` / `gpt-oss-20b`) + Embedding (`nomic-embed-text:latest`) |

Ollama запускается непосредственно на хост-машине (не в Docker). Docker-контейнеры обращаются к нему через специальный адрес `host.docker.internal`.

---

## 4. Требования к GPU и оборудованию

### 4.1. LLM-модель (Ollama)

Основная LLM-модель определяется переменной `LLM_PROVIDER` в `.env`. Возможные варианты:

#### Вариант А: Локальная модель через Ollama (рекомендуется для автономности)

Для модели **gpt-oss-120b** (120 млрд параметров):

| Квантизация | Требуемая VRAM | Пример конфигурации GPU |
|-------------|---------------|------------------------|
| FP16 (полная точность) | ~240 GB | 3× NVIDIA A100 80GB или 8× NVIDIA A40 48GB |
| Q8 (8-bit) | ~120 GB | 2× NVIDIA A100 80GB или 3× NVIDIA A40 48GB |
| Q4 (4-bit) | ~60–70 GB | 1× NVIDIA A100 80GB или 2× NVIDIA A40 48GB |

Для модели **gpt-oss-20b** (20 млрд параметров):

| Квантизация | Требуемая VRAM | Пример конфигурации GPU |
|-------------|---------------|------------------------|
| Q4 (по умолчанию в Ollama) | ~12–14 GB | 1× NVIDIA RTX 4090 24GB |
| Q8 | ~22–24 GB | 1× NVIDIA A40 48GB |

#### Вариант Б: Облачный API (Claude / OpenAI)

GPU не требуется для LLM. Требуется исходящее подключение к:
- `api.anthropic.com` (Claude)
- `api.openai.com` (OpenAI)

### 4.2. Embedding-модель (nomic-embed-text)

| Параметр | Значение |
|----------|---------|
| Модель | `nomic-embed-text:latest` |
| Размерность | 768 |
| Запускается через | Ollama |
| GPU | Не обязательно — работает на CPU, но GPU ускоряет батч-обработку при загрузке документов |
| Потребление VRAM | ~500 MB (при использовании GPU) |

### 4.3. Reranker-модель

| Параметр | Значение |
|----------|---------|
| Модель | `jinaai/jina-reranker-v2-base-multilingual` |
| Запускается через | Model Server (FastEmbed, CPU) |
| GPU | **Не требуется** — работает только на CPU |
| Размер модели | ~560 MB |
| RAM | ~2 GB |

### 4.4. Рекомендуемая серверная конфигурация

#### Минимальная (с gpt-oss-20b Q4, без Langfuse)

| Ресурс | Значение |
|--------|---------|
| CPU | 16 ядер |
| RAM | 32 GB |
| GPU | 1× NVIDIA с 24+ GB VRAM (RTX 4090 и выше) |
| Диск | 200 GB SSD |

#### Рекомендуемая (с gpt-oss-120b Q4, с Langfuse)

| Ресурс | Значение |
|--------|---------|
| CPU | 32+ ядер |
| RAM | 128 GB |
| GPU | 1× NVIDIA A100 80GB или 2× NVIDIA A40 48GB |
| Диск | 500 GB NVMe SSD |

#### Максимальная (с gpt-oss-120b FP16)

| Ресурс | Значение |
|--------|---------|
| CPU | 64+ ядер |
| RAM | 256 GB |
| GPU | 3× NVIDIA A100 80GB |
| Диск | 1 TB NVMe SSD |

---

## 5. Требования к ресурсам по сервисам

| Сервис | CPU | RAM (мин.) | RAM (рек.) | Диск | Примечания |
|--------|-----|-----------|-----------|------|-----------|
| FastAPI Backend | 2–4 ядра | 2 GB | 4 GB | 5 GB | Включает OCR-библиотеки (Tesseract, LibreOffice) |
| LangGraph Server | 2 ядра | 1 GB | 2 GB | 3 GB | Аналогичный Python-стек |
| Model Server | 2–4 ядра | 2 GB | 4 GB | 1 GB | CPU-inference reranker |
| Qdrant | 2–4 ядра | 2 GB | 8 GB | Зависит от объёма данных | RAM пропорционален количеству векторов |
| MongoDB | 1–2 ядра | 512 MB | 1 GB | 5 GB | Пользователи, сессии, checkpoints агента |
| Redis | 1 ядро | 256 MB | 512 MB | 1 GB | In-memory pub/sub |
| MinIO | 1–2 ядра | 512 MB | 1 GB | Зависит от объёма документов | Хранение файлов |
| Langfuse (Web) | 1–2 ядра | 512 MB | 1 GB | 1 GB | Node.js Web UI |
| Langfuse Worker | 1 ядро | 512 MB | 1 GB | 500 MB | Фоновая обработка |
| Langfuse PostgreSQL | 1 ядро | 256 MB | 512 MB | 5 GB | Метаданные Langfuse |
| Langfuse ClickHouse | 2 ядра | 1 GB | 2 GB | 10 GB | OLAP-аналитика |
| Ollama (на хосте) | 4–8 ядер | 8–16 GB | 32 GB+ | 20–100 GB | Зависит от размера модели |
| **Итого (без Ollama)** | **15–25 ядер** | **~10 GB** | **~25 GB** | **~31.5+ GB** | |

---

## 6. Сетевая конфигурация

### 6.1. Сеть Docker

| Параметр | Значение |
|----------|---------|
| Название | `rag-network` |
| Драйвер | `bridge` |
| MTU | 1500 |
| Bridge Name | `br-rag` |
| IP Masquerade | Включён |

### 6.2. Открытые порты (Host → Container)

| Порт хоста | Порт контейнера | Сервис | Протокол | Назначение |
|-----------|----------------|--------|----------|-----------|
| 8000 | 8000 | FastAPI | HTTP | REST API + SSE стриминг |
| 8080 | 8080 | Model Server | HTTP | Reranker API |
| 8123 | 8000 | LangGraph Server | HTTP | LangGraph API |
| 9000 | 9000 | MinIO | HTTP | S3 API |
| 9001 | 9001 | MinIO | HTTP | Web-консоль администратора |
| 6333 | 6333 | Qdrant | HTTP | REST API |
| 6334 | 6334 | Qdrant | gRPC | gRPC API |
| 6379 | 6379 | Redis | TCP (RESP) | Redis протокол |
| 27017 | 27017 | MongoDB | TCP | MongoDB Wire Protocol |
| 5433 | 5432 | Langfuse PostgreSQL | TCP | PostgreSQL (Langfuse — опционально) |
| 3000 | 3000 | Langfuse | HTTP | Langfuse Web UI |

### 6.3. Внутренние соединения (Container → Container)

Все контейнеры общаются через внутреннюю Docker-сеть `rag-network` по именам сервисов.

| Источник | Назначение | Порт | Протокол | Назначение |
|----------|-----------|------|----------|-----------|
| FastAPI | Qdrant | 6333 | HTTP | Поиск и запись векторов |
| FastAPI | MinIO | 9000 | HTTP (S3) | Загрузка/скачивание документов |
| FastAPI | Redis | 6379 | RESP | Pub/sub LangGraph |
| FastAPI | MongoDB | 27017 | MongoDB | Пользователи, сессии, feedback, checkpoints |
| FastAPI | Model Server | 8080 | HTTP | Reranker-запросы |
| FastAPI | Ollama (хост) | 11434 | HTTP | LLM inference, embeddings |
| FastAPI | LangGraph Server | 8000 (внутр.) | HTTP | Управление сессиями |
| FastAPI | Langfuse | 3000 | HTTP | Отправка трейсов (если включён) |
| LangGraph Server | Qdrant | 6333 | HTTP | Поиск векторов |
| LangGraph Server | MinIO | 9000 | HTTP (S3) | Доступ к документам |
| LangGraph Server | Redis | 6379 | RESP | Pub/sub |
| LangGraph Server | MongoDB | 27017 | MongoDB | Checkpoints |
| LangGraph Server | Model Server | 8080 | HTTP | Reranker |
| LangGraph Server | Ollama (хост) | 11434 | HTTP | LLM, embeddings |
| Langfuse Web | Langfuse PG | 5432 | PostgreSQL | Метаданные |
| Langfuse Web | ClickHouse | 8123 | HTTP | Аналитика |
| Langfuse Web | Redis | 6379 | RESP | Очередь |
| Langfuse Web | MinIO | 9000 | HTTP (S3) | Blob-хранилище |
| Langfuse Worker | Langfuse PG | 5432 | PostgreSQL | Метаданные |
| Langfuse Worker | ClickHouse | 8123/9000 | HTTP/TCP | Запись аналитики |
| Langfuse Worker | Redis | 6379 | RESP | Очередь задач |
| Langfuse Worker | MinIO | 9000 | HTTP (S3) | Blob-хранилище |

### 6.4. Подключение Host ↔ Docker

| Направление | Механизм | Назначение |
|-------------|---------|-----------|
| Container → Host | `host.docker.internal:11434` | Доступ к Ollama на хост-машине |
| Host → Container | `localhost:<port>` | Доступ к сервисам через опубликованные порты |

Для работы `host.docker.internal` необходим Docker Desktop или явная конфигурация `extra_hosts` (уже настроена в `docker-compose.yml`).

---

## 7. Диаграмма потоков данных

### 7.1. Загрузка документов

```
Пользователь ──► POST /documents/upload (multipart)
                         │
                         ▼
                ┌─────────────────┐
                │   FastAPI        │
                               │                  │
                               │ 1. Сохранить     │──────► MinIO (бакет: documents)
                               │    файл в MinIO  │
                               │                  │
                               │ 2. Парсинг       │  (unstructured + Tesseract OCR)
                               │    (PDF/DOCX/    │
                               │     XLSX)        │
                               │                  │
                               │ 3. Чанкинг       │  (RecursiveCharacterTextSplitter
                               │    (разбиение)   │   chunk=500, overlap=100)
                               │                  │
                               │ 4. Определение   │──────► Ollama (LLM-based detection)
                               │    языка         │        uz / ru / en
                               │                  │
                               │ 5. Векторизация  │──────► Ollama (nomic-embed-text)
                               │    (embedding)   │        768-dim vectors
                               │                  │
                               │ 6. Сохранение    │──────► Qdrant (коллекция: documents)
                               │    в Qdrant      │        метаданные: document_id,
                               └─────────────────┘        file_hash (SHA256), page_number,
                                                          language, chunk_index
```

### 7.2. Чат (вопрос-ответ)

```
Пользователь ──► POST /chat/stream (SSE)
                         │
                         ▼
                               ┌─────────────────────────────────────────────────┐
                               │              LangGraph Agent                    │
                               │                                                 │
                               │  input_safety ──► Проверка безопасности (LLM)   │
                               │       │                                         │
                               │       ▼                                         │
                               │  intent_router ──► Классификация намерения      │
                               │       │                                         │
                               │  ┌────┼────────────┐                            │
                               │  │    │            │                            │
                               │  ▼    ▼            ▼                            │
                               │ greeting  general  query_prepare                │
                               │ (шаблон)  (LLM)    │                            │
                               │                    ▼                            │
                               │              retrieve ────► Qdrant (hybrid)     │
                               │                    │                            │
                               │                    ▼                            │
                               │              rerank ──────► Model Server        │
                               │                    │                            │
                               │                    ▼                            │
                               │           grade_documents                       │
                               │              │         │                        │
                               │         [хорошо]   [плохо, retry < 3]          │
                               │              │         │                        │
                               │              │    rewrite_query → retrieve      │
                               │              │         │                        │
                               │              │    [плохо, retry ≥ 1,            │
                               │              │     score < 0.25]                │
                               │              │         ▼                        │
                               │              │    human_feedback                │
                               │              │    (interrupt — HITL)            │
                               │              │                                  │
                               │              ▼                                  │
                               │        expand_context (parent/neighbor chunks)  │
                               │              │                                  │
                               │              ▼                                  │
                               │          generate ────► Ollama/Claude/OpenAI    │
                               │              │                                  │
                               │              ▼                                  │
                               │        output_safety ──► Проверка ответа (LLM) │
                               │              │                                  │
                               │              ▼                                  │
                               │          SSE Response ──► Клиент                │
                               └─────────────────────────────────────────────────┘

SSE-события:
  • session_created — ID новой сессии
  • session_title — заголовок сессии (авто-генерация LLM)
  • node_end — завершение каждого узла графа
  • clarification_needed — запрос уточнения (HITL)
  • generation — финальный ответ + источники
```

### 7.3. Обратная связь

```
Пользователь ──► POST /feedback
                         │
                         ▼
                               FastAPI ──► MongoDB (коллекция: message_feedback)
                                          Индекс: thread_id + message_index
                                          Данные: thumbs_up/down, примечание
```

---

## 8. Безопасность

### 8.1. Аутентификация

| Механизм | Описание |
|----------|---------|
| Метод | JWT (JSON Web Token) |
| Алгоритм | HS256 |
| Access Token | Срок действия: 30 минут |
| Refresh Token | Срок действия: 7 дней |
| Хеширование паролей | bcrypt |
| Хранение пользователей | MongoDB (коллекция `users`) |
| Администратор | Создаётся автоматически при запуске (`ADMIN_USERNAME` / `ADMIN_PASSWORD`) |

**Поток аутентификации:**

1. `POST /auth/login` → возвращает access_token + refresh_token
2. Все защищённые эндпоинты требуют `Authorization: Bearer <access_token>`
3. При истечении access_token → `POST /auth/refresh` с refresh_token
4. Клиент автоматически обновляет токен при получении HTTP 401

### 8.2. CORS

Настраивается в FastAPI. В текущей конфигурации разрешены все origins для разработки. **Требуется ограничение для production.**

### 8.3. Guardrails (защита от злоупотреблений)

Система включает два уровня LLM-guardrails:

**Input Safety (входящие запросы):**
- Обнаружение identity probing (попытки узнать, кто стоит за системой)
- Обнаружение jailbreak-атак
- Обнаружение prompt injection
- Обнаружение манипулятивных запросов
- Блокировка с многоязычными ответами (uz/ru/en)

**Output Safety (исходящие ответы):**
- Проверка на утечку идентификации (провайдер LLM, системный промпт)
- Проверка на упоминание провайдеров
- Проверка на off-character ответы

### 8.4. Авторизация

| Роль | Доступ |
|------|--------|
| `user` | Чат, загрузка документов, просмотр своих сессий, обратная связь |
| `admin` | Всё вышеперечисленное + управление пользователями, настройки системы, панель администратора |

Эндпоинты сессий проверяют `thread.metadata.user_id == current_user_id` для изоляции данных между пользователями.

---

## 9. Хранение данных

### 9.1. Сводная таблица

| Данные | Хранилище | Расположение | Шифрование |
|--------|----------|-------------|-----------|
| Загруженные документы (файлы) | MinIO | Docker volume: `minio_data` | Нет (at-rest не настроено) |
| Векторные представления (embeddings) | Qdrant | Docker volume: `qdrant_data` | Нет |
| Состояние агента (checkpoints) | MongoDB (AsyncMongoDBSaver) | Docker volume: `mongodb_data` | Нет |
| Пользователи и пароли | MongoDB | Docker volume: `mongodb_data` | Пароли: bcrypt hash. БД: не зашифрована |
| Сессии чатов (метаданные) | MongoDB | Docker volume: `mongodb_data` | Нет |
| Обратная связь (feedback) | MongoDB | Docker volume: `mongodb_data` | Нет |
| Кэш моделей (reranker) | Model Server | Docker volume: `model_cache` | Нет |
| Кэш Redis | Redis | Docker volume: `redis_data` | Нет |
| Данные Langfuse | Langfuse PG + ClickHouse | Docker volumes: `langfuse_postgres_data`, `langfuse_clickhouse_data` | Нет |
| Логи Langfuse ClickHouse | ClickHouse | Docker volume: `langfuse_clickhouse_logs` | Нет |

### 9.2. Docker Volumes

```
minio_data                  — файлы документов и данные Langfuse
qdrant_data                 — векторная база данных
redis_data                  — данные Redis
mongodb_data                — MongoDB (пользователи, сессии, feedback, checkpoints LangGraph)
langfuse_postgres_data      — PostgreSQL (Langfuse — опционально)
langfuse_clickhouse_data    — ClickHouse (Langfuse аналитика)
langfuse_clickhouse_logs    — логи ClickHouse
model_cache                 — кэш reranker-модели
```

---

## 10. Внешние подключения

### 10.1. Подключения при сборке (build-time)

Эти подключения необходимы **однократно** при первой сборке Docker-образов и могут быть выполнены на машине с интернет-доступом.

| # | Назначение | URL / Хост | Протокол | Порт | Описание |
|---|-----------|-----------|----------|------|---------|
| 1 | Docker-образы | `registry-1.docker.io`, `ghcr.io`, `production.cloudflare.docker.com` | HTTPS | 443 | Загрузка базовых образов: `python:3.12-slim`, `postgres:16-alpine`, `mongo:7`, `redis:7-alpine`, `minio/minio:latest`, `minio/mc:latest`, `qdrant/qdrant:latest`, `clickhouse/clickhouse-server`, `langfuse/langfuse:3`, `langfuse/langfuse-worker:3` |
| 2 | Python-пакеты | `pypi.org`, `files.pythonhosted.org` | HTTPS | 443 | pip install зависимостей (~30 пакетов, включая FastAPI, LangChain, LangGraph и др.) |
| 3 | PyTorch (CPU) | `download.pytorch.org` | HTTPS | 443 | Установка CPU-версии PyTorch (для FastEmbed / unstructured) |
| 4 | NLTK Data | `raw.githubusercontent.com` | HTTPS | 443 | Загрузка токенизаторов: `averaged_perceptron_tagger_eng`, `punkt_tab` |

### 10.2. Подключения при первом запуске (runtime, однократно)

| # | Назначение | URL / Хост | Протокол | Порт | Описание |
|---|-----------|-----------|----------|------|---------|
| 6 | HuggingFace модель | `huggingface.co`, `cdn-lfs.huggingface.co` | HTTPS | 443 | Скачивание reranker-модели `jinaai/jina-reranker-v2-base-multilingual` (~560 MB). Кэшируется в volume `model_cache` |
| 7 | Ollama модели | `ollama.com`, `registry.ollama.ai` | HTTPS | 443 | Команда `ollama pull` для загрузки моделей: `nomic-embed-text:latest` (~274 MB), `gpt-oss-120b` / `gpt-oss-20b` |

### 10.3. Подключения при работе (runtime, постоянные)

| # | Назначение | URL / Хост | Протокол | Порт | Условие | Описание |
|---|-----------|-----------|----------|------|---------|---------|
| 8 | Claude API | `api.anthropic.com` | HTTPS | 443 | Только если `LLM_PROVIDER=claude` | API-вызовы к Claude LLM |
| 9 | OpenAI API | `api.openai.com` | HTTPS | 443 | Только если `LLM_PROVIDER=openai` | API-вызовы к OpenAI LLM |

**При `LLM_PROVIDER=ollama` (по умолчанию) постоянных внешних подключений НЕТ.**

### 10.4. Подключения, заблокированные в конфигурации

| Хост | Причина блокировки |
|------|-------------------|
| `api.smith.langchain.com` | LangSmith telemetry — отключён через env vars (`LANGCHAIN_TRACING_V2=false`, `LANGSMITH_TRACING=false`) |

### 10.5. Планируемые интеграции

#### MS Teams Bot (в разработке)

При реализации интеграции с MS Teams потребуются следующие дополнительные подключения:

| # | Назначение | URL / Хост | Протокол | Порт | Описание |
|---|-----------|-----------|----------|------|---------|
| 1 | Microsoft Bot Framework | `login.microsoftonline.com` | HTTPS | 443 | Аутентификация бота (OAuth 2.0) |
| 2 | Bot Connector | `smba.trafficmanager.net` | HTTPS | 443 | Отправка/получение сообщений |
| 3 | Microsoft Graph API | `graph.microsoft.com` | HTTPS | 443 | Получение информации о пользователях/каналах |
| 4 | Azure Bot Service | `directline.botframework.com` | HTTPS | 443 | Direct Line API (альтернативный канал) |
| 5 | Teams Webhook | Настраиваемый URL | HTTPS | 443 | Incoming/Outgoing webhook интеграция |

Также потребуется **входящий** HTTPS-эндпоинт (webhook) для получения сообщений от Teams, что может потребовать настройки reverse proxy или VPN-туннеля в локальной сети.

---

## 11. Рекомендации по безопасности для production

### 11.1. Критические (обязательно перед вводом в эксплуатацию)

| # | Рекомендация | Текущее состояние | Действие |
|---|-------------|------------------|---------|
| 1 | **JWT Secret Key** | Значение по умолчанию: `super-secret-jwt-key-change-in-production` | Заменить на криптографически стойкий ключ (минимум 256 бит) |
| 2 | **Пароль администратора** | `admin` / `admin123` | Заменить на стойкий пароль |
| 3 | **MinIO credentials** | `minioadmin` / `minioadmin` | Заменить на уникальные учётные данные |
| 4 | **MongoDB аутентификация** | Отключена | Включить аутентификацию MongoDB |
| 5 | **Redis аутентификация** | Отключена | Включить `requirepass` в Redis |
| 6 | **CORS** | Разрешены все origins | Ограничить до конкретных доменов/IP |
| 7 | **Langfuse secrets** | Значения по умолчанию (`SALT`, `ENCRYPTION_KEY`, `NEXTAUTH_SECRET`) | Заменить на уникальные значения (только если Langfuse включён) |

### 11.2. Высокий приоритет

| # | Рекомендация | Описание |
|---|-------------|---------|
| 8 | **Закрыть неиспользуемые порты** | Оставить открытым для внешнего доступа только порт 8000 (API). Все остальные порты (Qdrant, Redis, MongoDB, MinIO, Model Server) убрать из `ports:` в docker-compose и оставить только внутренний доступ через Docker-сеть |
| 9 | **HTTPS/TLS** | Настроить reverse proxy (nginx/traefik) с TLS-сертификатами для порта 8000 |
| 10 | **Сетевая сегментация** | Выделить отдельные Docker-сети для: backend, data (БД), monitoring (Langfuse) |
| 11 | **Rate limiting** | Добавить ограничение частоты запросов на API-эндпоинты (особенно `/auth/login`, `/chat/stream`) |
| 12 | **Логирование аудита** | Настроить централизованное логирование всех действий пользователей |

### 11.3. Средний приоритет

| # | Рекомендация | Описание |
|---|-------------|---------|
| 13 | **Шифрование данных at-rest** | Включить шифрование Docker volumes или использовать зашифрованные файловые системы |
| 14 | **Backup** | Настроить регулярное резервное копирование volumes: `minio_data`, `qdrant_data`, `mongodb_data` |
| 15 | **Resource limits** | Добавить `deploy.resources.limits` в docker-compose для всех контейнеров (CPU, memory) |
| 16 | **Read-only rootfs** | Добавить `read_only: true` и явные `tmpfs` mounts для контейнеров, не требующих записи |
| 17 | **Мониторинг и алерты** | Настроить мониторинг доступности и ресурсов (Prometheus + Grafana или аналог) |
| 18 | **SSL verification** | После настройки внутренних CA-сертификатов убрать `PYTHONHTTPSVERIFY=0` и `NODE_TLS_REJECT_UNAUTHORIZED=0`, заменив на доверенные корневые сертификаты |

---

*Документ подготовлен: 03.03.2026*
*Версия: 1.0*
