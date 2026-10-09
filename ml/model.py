"""Isolation Forest wrapper: train, persist, score, explain.

An Isolation Forest isolates each point with random axis-aligned splits.
Ordinary transactions sit in dense regions and need many splits; unusual ones
are cut off after a few. The average number of splits is the anomaly score.
The model is unsupervised - it never sees fraud labels.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from features import FEATURES, build_features, explain

ARTIFACT = Path(os.environ.get("MODEL_PATH", Path(__file__).parent / "artifacts" / "model.joblib"))

DEFAULT_PARAMS = {
    "n_estimators": 300,
    "max_samples": 512,
    "contamination": 0.02,  # share of transactions expected to be anomalous
    "random_state": 42,
}


class ModelNotTrained(RuntimeError):
    pass


def _normalise(raw: np.ndarray, bundle: dict) -> np.ndarray:
    """Map raw scores to 0-1, where the decision threshold always lands on 0.5."""
    lo, thr, hi = bundle["raw_min"], bundle["raw_threshold"], bundle["raw_max"]
    below = 0.5 * (raw - lo) / max(thr - lo, 1e-9)
    above = 0.5 + 0.5 * (raw - thr) / max(hi - thr, 1e-9)
    return np.clip(np.where(raw < thr, below, above), 0.0, 1.0)


def _severity(score: float) -> str:
    if score >= 0.85:
        return "critical"
    if score >= 0.70:
        return "high"
    return "medium"


def _results(feats: pd.DataFrame, bundle: dict) -> list[dict]:
    raw = -bundle["model"].score_samples(feats[FEATURES].to_numpy())
    scores = _normalise(raw, bundle)
    context = feats.attrs["context"]
    out = []
    for i, (txn_id, row) in enumerate(feats.iterrows()):
        flagged = bool(raw[i] >= bundle["raw_threshold"])
        out.append({
            "id": int(txn_id),
            "anomaly_score": round(float(scores[i]), 4),
            "is_anomaly": flagged,
            "severity": _severity(scores[i]) if flagged else None,
            "reasons": explain(row, context.loc[txn_id]) if flagged else [],
        })
    return out


def _evaluate(results: list[dict], labels: dict[int, bool]) -> dict:
    """Precision/recall against the seed's planted anomalies, when labels exist."""
    if not any(labels.values()):
        return {}
    tp = sum(1 for r in results if r["is_anomaly"] and labels.get(r["id"]))
    fp = sum(1 for r in results if r["is_anomaly"] and not labels.get(r["id"]))
    fn = sum(1 for r in results if not r["is_anomaly"] and labels.get(r["id"]))
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "labelled_anomalies": tp + fn,
        "true_positives": tp, "false_positives": fp, "false_negatives": fn,
        "precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4),
    }


def train(rows: list[dict], params: dict | None = None) -> dict:
    """Fit on every row, save the model, and return scores for every row."""
    params = {**DEFAULT_PARAMS, **(params or {})}
    if len(rows) < 200:
        raise ValueError("need at least 200 transactions to train")
    if not 0 < float(params["contamination"]) <= 0.2:
        raise ValueError("contamination must be between 0 and 0.2")

    feats = build_features(rows)
    X = feats[FEATURES].to_numpy()
    model = IsolationForest(
        n_estimators=int(params["n_estimators"]),
        max_samples=min(int(params["max_samples"]), len(X)),
        contamination=float(params["contamination"]),
        random_state=int(params["random_state"]),
        n_jobs=-1,
    ).fit(X)

    raw = -model.score_samples(X)
    bundle = {
        "model": model,
        "features": FEATURES,
        "params": params,
        "raw_min": float(raw.min()),
        "raw_max": float(raw.max()),
        "raw_threshold": float(-model.offset_),  # sklearn's own contamination cut-off
        "trained_rows": int(len(X)),
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }
    ARTIFACT.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, ARTIFACT)

    results = _results(feats, bundle)
    labels = {int(r["id"]): bool(r.get("synthetic_label")) for r in rows}
    return {
        "model": describe(bundle) | {
            "flagged_rows": sum(r["is_anomaly"] for r in results),
            "metrics": _evaluate(results, labels),
        },
        "scores": results,
    }


def load() -> dict:
    if not ARTIFACT.exists():
        raise ModelNotTrained("no trained model yet - run a training job first")
    return joblib.load(ARTIFACT)


def describe(bundle: dict) -> dict:
    return {
        "algorithm": "isolation_forest",
        "params": bundle["params"],
        "features": bundle["features"],
        "trained_rows": bundle["trained_rows"],
        "trained_at": bundle["trained_at"],
        "threshold": 0.5,
    }


def score_one(transaction: dict, history: list[dict]) -> dict:
    """Score a single new transaction against its account's earlier transactions."""
    bundle = load()
    earlier = [h for h in history if h["id"] != transaction["id"]]
    feats = build_features(earlier + [transaction])
    ctx = feats.attrs["context"]
    one = feats.loc[[transaction["id"]]]
    one.attrs["context"] = ctx
    return _results(one, bundle)[0]
