"""Pre-download models at build time with SSL bypass for corporate networks."""

import ssl
import sys

# Disable SSL verification globally for corporate proxy
ssl._create_default_https_context = ssl._create_unverified_context

# Monkey-patch httpx to always disable SSL verification
import httpx

_original_client_init = httpx.Client.__init__


def _patched_client_init(self, *args, **kwargs):
    kwargs["verify"] = False
    _original_client_init(self, *args, **kwargs)


httpx.Client.__init__ = _patched_client_init

model_type = sys.argv[1] if len(sys.argv) > 1 else "embedding"

if model_type == "embedding":
    from fastembed import TextEmbedding

    TextEmbedding(model_name="sentence-transformers/all-MiniLM-L6-v2")
    print("Embedding model downloaded successfully")
elif model_type == "reranker":
    from fastembed.rerank.cross_encoder import TextCrossEncoder

    TextCrossEncoder(model_name="jinaai/jina-reranker-v1-tiny-en")
    print("Reranker model downloaded successfully")
