"""Unicode keyword ranking and reciprocal rank fusion for local retrieval."""

from collections import defaultdict
from hashlib import sha256
import re

from langchain_core.documents import Document
from rank_bm25 import BM25L


def tokens(text: str) -> list[str]:
    return re.findall(r'\w+', text.casefold())


def keyword_rank(documents: list[Document], query: str, k: int) -> list[Document]:
    terms = tokens(query)[:32]
    corpus = [tokens(document.page_content) for document in documents]
    if not terms or not any(corpus):
        return []
    scores = BM25L(corpus).get_scores(terms)
    matches = [index for index, words in enumerate(corpus) if set(terms).intersection(words)]
    matches.sort(key=lambda index: scores[index], reverse=True)
    return [documents[index] for index in matches[:k]]


def fuse_rankings(rankings: list[list[Document]], k: int) -> list[Document]:
    scores = defaultdict(float)
    documents = {}
    for ranking in rankings:
        seen = set()
        for rank, document in enumerate(ranking, start=1):
            metadata = document.metadata
            key = (metadata.get('owner_id'), metadata.get('document_id'), metadata.get('id') or document.id or sha256(document.page_content.encode()).hexdigest())
            if key in seen:
                continue
            seen.add(key)
            documents.setdefault(key, document)
            scores[key] += 1 / (60 + rank)
    return [documents[key] for key in sorted(scores, key=scores.get, reverse=True)[:k]]


__all__ = ['fuse_rankings', 'keyword_rank']
