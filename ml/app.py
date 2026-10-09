"""Fraud scoring service.

Stateless by design: the Express API owns the database, sends transactions
here as JSON and stores what comes back. This service holds no credentials.

  GET  /health   liveness + whether a model is loaded
  GET  /model    description of the trained model
  POST /train    {transactions: [...], params?: {...}} -> model summary + a score per row
  POST /score    {transaction: {...}, history: [...]}  -> score for one new transaction
"""
from __future__ import annotations

import os

from flask import Flask, jsonify, request

import model as fraud_model

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024 * 1024


@app.errorhandler(ValueError)
def bad_request(err):
    return jsonify(error=str(err)), 400


@app.errorhandler(fraud_model.ModelNotTrained)
def not_trained(err):
    return jsonify(error=str(err)), 409


@app.get("/health")
def health():
    return jsonify(status="ok", model_ready=fraud_model.ARTIFACT.exists())


@app.get("/model")
def model_info():
    return jsonify(fraud_model.describe(fraud_model.load()))


@app.post("/train")
def train():
    body = request.get_json(force=True, silent=True) or {}
    rows = body.get("transactions")
    if not isinstance(rows, list):
        raise ValueError("body must include a 'transactions' array")
    return jsonify(fraud_model.train(rows, body.get("params")))


@app.post("/score")
def score():
    body = request.get_json(force=True, silent=True) or {}
    txn = body.get("transaction")
    if not isinstance(txn, dict):
        raise ValueError("body must include a 'transaction' object")
    return jsonify(fraud_model.score_one(txn, body.get("history") or []))


if __name__ == "__main__":
    app.run(host=os.environ.get("ML_HOST", "127.0.0.1"), port=int(os.environ.get("ML_PORT", 5001)))
