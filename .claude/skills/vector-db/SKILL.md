---
name: vector-db
description: Configure and optimize vector databases for RAG. Supports Qdrant, ChromaDB, Pinecone, Weaviate, Milvus, and pgvector. Creates collection schemas, search configurations, hybrid search, and client code.
disable-model-invocation: true
---

# Vector Database Setup & Optimization

## Requirements
$ARGUMENTS

## Supported Vector Databases

### Qdrant (Recommended for production)
```python
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance, VectorParams, HnswConfigDiff,
    OptimizersConfigDiff, PayloadSchemaType,
    models
)

client = AsyncQdrantClient(url="http://localhost:6333")

# Create collection with hybrid search
await client.create_collection(
    collection_name="documents",
    vectors_config={
        "dense": VectorParams(
            size=768,  # nomic-embed-text
            distance=Distance.COSINE,
            hnsw_config=HnswConfigDiff(m=16, ef_construct=100),
            on_disk=True  # for large collections
        )
    },
    sparse_vectors_config={
        "sparse": models.SparseVectorParams(
            modifier=models.Modifier.IDF  # BM25-like
        )
    },
    optimizers_config=OptimizersConfigDiff(
        indexing_threshold=20000,
        memmap_threshold=50000
    )
)

# Create payload indexes for filtering
await client.create_payload_index(
    collection_name="documents",
    field_name="source",
    field_schema=PayloadSchemaType.KEYWORD
)
await client.create_payload_index(
    collection_name="documents",
    field_name="content",
    field_schema=models.TextIndexParams(
        type=models.TextIndexType.TEXT,
        tokenizer=models.TokenizerType.MULTILINGUAL,
        min_token_len=2,
        max_token_len=20
    )
)
```

#### Qdrant Hybrid Search
```python
from qdrant_client.models import (
    SearchRequest, NamedVector, NamedSparseVector,
    SparseVector, Fusion, Prefetch, Query
)

# Hybrid search with RRF
results = await client.query_points(
    collection_name="documents",
    prefetch=[
        Prefetch(
            query=dense_vector,
            using="dense",
            limit=20
        ),
        Prefetch(
            query=SparseVector(indices=sparse_indices, values=sparse_values),
            using="sparse",
            limit=20
        )
    ],
    query=models.FusionQuery(fusion=Fusion.RRF),
    limit=10,
    with_payload=True
)
```

### ChromaDB (Good for development/prototyping)
```python
import chromadb

client = chromadb.PersistentClient(path="./chroma_data")

collection = client.get_or_create_collection(
    name="documents",
    metadata={"hnsw:space": "cosine"},
    embedding_function=embedding_fn
)

# Add documents
collection.add(
    ids=["doc1", "doc2"],
    documents=["text1", "text2"],
    metadatas=[{"source": "file1.pdf"}, {"source": "file2.pdf"}]
)

# Query
results = collection.query(
    query_texts=["search query"],
    n_results=10,
    where={"source": "file1.pdf"}  # metadata filter
)
```

### pgvector (PostgreSQL extension)
```python
# Using SQLAlchemy + pgvector
from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase

class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True)
    content = Column(Text)
    source = Column(String)
    embedding = Column(Vector(768))

# Create index
# CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)

# Search
from sqlalchemy import select, text
stmt = select(Document).order_by(
    Document.embedding.cosine_distance(query_embedding)
).limit(10)
```

## Embedding Model Configurations

| Model | Dimensions | Multilingual | Speed | Quality |
|-------|-----------|-------------|-------|---------|
| text-embedding-3-small | 1536 | Yes | Fast | Good |
| text-embedding-3-large | 3072 | Yes | Medium | Best (API) |
| nomic-embed-text | 768 | Partial | Fast | Good (local) |
| multilingual-e5-large | 1024 | Yes (100+) | Medium | Best (local) |
| bge-m3 | 1024 | Yes | Medium | Great |
| all-MiniLM-L6-v2 | 384 | English | Very fast | OK |

## Chunking Strategies

```python
# 1. Recursive (general purpose)
from langchain.text_splitter import RecursiveCharacterTextSplitter
splitter = RecursiveCharacterTextSplitter(
    chunk_size=500, chunk_overlap=100,
    separators=["\n\n", "\n", ". ", " ", ""]
)

# 2. Semantic (quality-focused)
from langchain_experimental.text_splitter import SemanticChunker
splitter = SemanticChunker(
    embeddings, breakpoint_threshold_type="percentile"
)

# 3. Markdown-aware
from langchain.text_splitter import MarkdownHeaderTextSplitter
splitter = MarkdownHeaderTextSplitter(
    headers_to_split_on=[("#", "h1"), ("##", "h2"), ("###", "h3")]
)

# 4. Parent-child (for context expansion)
from langchain.text_splitter import RecursiveCharacterTextSplitter
parent_splitter = RecursiveCharacterTextSplitter(chunk_size=2000)
child_splitter = RecursiveCharacterTextSplitter(chunk_size=400)
# Store parent chunks, index child chunks, retrieve parent on match
```

## Performance Tuning
- **HNSW ef_construct**: Higher = better recall, slower indexing (100-200)
- **HNSW m**: Higher = better recall, more memory (16-64)
- **HNSW ef** (search): Higher = better recall, slower search (64-256)
- **Quantization**: Scalar/binary for memory reduction (10-40x)
- **On-disk**: For collections > available RAM
- **Batch upsert**: 100-500 points per batch
- **Payload indexes**: Always index fields used in filters
