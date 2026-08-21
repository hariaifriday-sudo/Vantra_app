"""Lightweight retrieval-augmented generation over the policy library.

Uses TF-IDF + cosine similarity (scikit-learn) rather than dense embeddings —
no external embedding API is available on this Groq account, and the corpus
is small enough that lexical similarity retrieval is a reasonable, fully
local substitute. Swap this for a real vector store if the corpus grows.
"""
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy.orm import Session

from . import models


def retrieve_policies(db: Session, query: str, k: int = 3, min_score: float = 0.05) -> list[tuple[models.Policy, float]]:
    policies = db.query(models.Policy).all()
    if not policies or not query.strip():
        return []

    corpus = [f"{p.title}\n{p.category}\n{p.body}" for p in policies]
    vectorizer = TfidfVectorizer(stop_words="english")
    try:
        tfidf = vectorizer.fit_transform([*corpus, query])
    except ValueError:
        return []  # empty vocabulary (e.g. query is all stopwords)

    scores = cosine_similarity(tfidf[-1], tfidf[:-1])[0]
    ranked = sorted(zip(policies, scores), key=lambda pair: -pair[1])
    return [(policy, float(score)) for policy, score in ranked[:k] if score >= min_score]


def format_context(matches: list[tuple[models.Policy, float]]) -> str:
    if not matches:
        return "No matching policy documents were found for this question."
    blocks = []
    for policy, score in matches:
        excerpt = policy.body[:800]
        blocks.append(f"[{policy.category}] {policy.title} (relevance {score:.2f}):\n{excerpt}")
    return "\n\n".join(blocks)
