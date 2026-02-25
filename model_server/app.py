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
from pydantic import BaseModel

# Using smaller reranker: jina-reranker-v1 instead of v2-base
RERANKER_MODEL = "jinaai/jina-reranker-v1-tiny-en"

reranker: TextCrossEncoder | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global reranker
    reranker = TextCrossEncoder(model_name=RERANKER_MODEL)
    yield


app = FastAPI(title="Model Server (Reranker)", lifespan=lifespan)


def get_reranker_model() -> TextCrossEncoder:
    if reranker is None:
        raise RuntimeError("Reranker model not loaded")
    return reranker


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


@app.get("/health")
def health():
    return {"status": "ok", "models": {"reranker": RERANKER_MODEL}}
