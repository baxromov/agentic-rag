import os
import ssl
from contextlib import asynccontextmanager

# Disable SSL verification for corporate network proxy before any imports that use httpx
if os.environ.get("SSL_VERIFY_DISABLE", "").lower() in ("1", "true"):
    ssl._create_default_https_context = ssl._create_unverified_context
    try:
        import httpx

        _original_client_init = httpx.Client.__init__

        def _patched_client_init(self, *args, **kwargs):
            kwargs["verify"] = False
            kwargs["timeout"] = httpx.Timeout(600.0, connect=60.0)
            _original_client_init(self, *args, **kwargs)

        httpx.Client.__init__ = _patched_client_init
    except ImportError:
        pass

from fastapi import FastAPI
from fastembed import TextEmbedding
from fastembed.rerank.cross_encoder import TextCrossEncoder
from pydantic import BaseModel

# Using lighter models to reduce memory footprint (3.8GB total available)
# all-MiniLM-L6-v2: ~80MB vs paraphrase-multilingual-mpnet: ~420MB
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
# Using smaller reranker: jina-reranker-v1 instead of v2-base
RERANKER_MODEL = "jinaai/jina-reranker-v1-tiny-en"

embedding: TextEmbedding | None = None
reranker: TextCrossEncoder | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global embedding, reranker
    embedding = TextEmbedding(model_name=EMBEDDING_MODEL)
    reranker = TextCrossEncoder(model_name=RERANKER_MODEL)
    yield


app = FastAPI(title="Model Server", lifespan=lifespan)


def get_embedding_model() -> TextEmbedding:
    if embedding is None:
        raise RuntimeError("Embedding model not loaded")
    return embedding


def get_reranker_model() -> TextCrossEncoder:
    if reranker is None:
        raise RuntimeError("Reranker model not loaded")
    return reranker


# -- Request / Response schemas --


class EmbedDocumentsRequest(BaseModel):
    texts: list[str]


class EmbedDocumentsResponse(BaseModel):
    embeddings: list[list[float]]


class EmbedQueryRequest(BaseModel):
    text: str


class EmbedQueryResponse(BaseModel):
    embedding: list[float]


class RerankRequest(BaseModel):
    query: str
    texts: list[str]
    top_k: int | None = None


class RerankEntry(BaseModel):
    index: int
    score: float


class RerankResponse(BaseModel):
    results: list[RerankEntry]


# -- Endpoints --


@app.post("/embed/documents", response_model=EmbedDocumentsResponse)
def embed_documents(req: EmbedDocumentsRequest):
    model = get_embedding_model()
    vectors = [vec.tolist() for vec in model.embed(req.texts)]
    return EmbedDocumentsResponse(embeddings=vectors)


@app.post("/embed/query", response_model=EmbedQueryResponse)
def embed_query(req: EmbedQueryRequest):
    model = get_embedding_model()
    vector = next(model.embed([req.text])).tolist()
    return EmbedQueryResponse(embedding=vector)


@app.post("/rerank", response_model=RerankResponse)
def rerank(req: RerankRequest):
    model = get_reranker_model()
    scores = list(model.rerank(req.query, req.texts))
    # reranker.rerank returns a list of float scores, not dicts
    # we need to manually pair them with indices
    results = [RerankEntry(index=i, score=float(score)) for i, score in enumerate(scores)]
    if req.top_k:
        results.sort(key=lambda r: r.score, reverse=True)
        results = results[: req.top_k]
    return RerankResponse(results=results)


@app.get("/health")
def health():
    return {"status": "ok", "models": {"embedding": EMBEDDING_MODEL, "reranker": RERANKER_MODEL}}
