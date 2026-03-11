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
from fastembed.rerank.cross_encoder import TextCrossEncoder
from fastembed.sparse.bm25 import Bm25
from pydantic import BaseModel

# Using smaller reranker: jina-reranker-v1 instead of v2-base
RERANKER_MODEL = "jinaai/jina-reranker-v1-tiny-en"
SPARSE_MODEL = os.environ.get("SPARSE_EMBEDDING_MODEL", "Qdrant/bm25")

reranker: TextCrossEncoder | None = None
sparse_model: Bm25 | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global reranker, sparse_model
    reranker = TextCrossEncoder(model_name=RERANKER_MODEL)
    sparse_model = Bm25(model_name=SPARSE_MODEL)
    yield


app = FastAPI(title="Model Server (Reranker + Sparse Embedding)", lifespan=lifespan)


def get_reranker_model() -> TextCrossEncoder:
    if reranker is None:
        raise RuntimeError("Reranker model not loaded")
    return reranker


def get_sparse_model() -> Bm25:
    if sparse_model is None:
        raise RuntimeError("Sparse embedding model not loaded")
    return sparse_model


# -- Request / Response schemas --


class RerankRequest(BaseModel):
    query: str
    texts: list[str]
    top_k: int | None = None


class RerankEntry(BaseModel):
    index: int
    score: float


class RerankResponse(BaseModel):
    results: list[RerankEntry]


class SparseEmbedRequest(BaseModel):
    texts: list[str]


class SparseVector(BaseModel):
    indices: list[int]
    values: list[float]


class SparseEmbedResponse(BaseModel):
    embeddings: list[SparseVector]


# -- Endpoints --


@app.post("/rerank", response_model=RerankResponse)
def rerank_endpoint(req: RerankRequest):
    model = get_reranker_model()
    scores = list(model.rerank(req.query, req.texts))
    results = [RerankEntry(index=i, score=float(score)) for i, score in enumerate(scores)]
    if req.top_k:
        results.sort(key=lambda r: r.score, reverse=True)
        results = results[: req.top_k]
    return RerankResponse(results=results)


@app.post("/sparse-embed", response_model=SparseEmbedResponse)
def sparse_embed_endpoint(req: SparseEmbedRequest):
    model = get_sparse_model()
    results = list(model.embed(req.texts))
    embeddings = [
        SparseVector(indices=r.indices.tolist(), values=r.values.tolist())
        for r in results
    ]
    return SparseEmbedResponse(embeddings=embeddings)


@app.get("/health")
def health():
    return {"status": "ok", "models": {"reranker": RERANKER_MODEL, "sparse": SPARSE_MODEL}}
