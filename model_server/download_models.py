"""Pre-download reranker model at build time with SSL bypass for corporate networks."""

import ssl

# Disable SSL verification globally for corporate proxy
ssl._create_default_https_context = ssl._create_unverified_context

# Monkey-patch httpx to always disable SSL verification
import httpx

_original_client_init = httpx.Client.__init__


def _patched_client_init(self, *args, **kwargs):
    kwargs["verify"] = False
    _original_client_init(self, *args, **kwargs)


httpx.Client.__init__ = _patched_client_init

from fastembed.rerank.cross_encoder import TextCrossEncoder

TextCrossEncoder(model_name="jinaai/jina-reranker-v1-tiny-en")
print("Reranker model downloaded successfully")
