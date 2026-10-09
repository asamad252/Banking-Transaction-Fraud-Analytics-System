"""Train and inspect the model from a CSV, without the API running.

Export the training set once:

  psql "$DATABASE_URL" -c "\\copy (SELECT id, account_id, type, amount, channel, city, country, device_id, created_at, home_city, home_country, synthetic_label FROM v_transactions_enriched) TO 'transactions.csv' CSV HEADER"

then:

  python cli.py transactions.csv --contamination 0.02 --out scores.csv
"""
from __future__ import annotations

import argparse
import json

import pandas as pd

import model as fraud_model


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("csv", help="transactions exported from v_transactions_enriched")
    parser.add_argument("--contamination", type=float, default=fraud_model.DEFAULT_PARAMS["contamination"])
    parser.add_argument("--n-estimators", type=int, default=fraud_model.DEFAULT_PARAMS["n_estimators"])
    parser.add_argument("--out", help="write per-transaction scores to this CSV")
    args = parser.parse_args()

    df = pd.read_csv(args.csv)
    if "synthetic_label" in df.columns:
        df["synthetic_label"] = df["synthetic_label"].astype(str).str.lower().isin(["t", "true", "1"])
    df["device_id"] = df["device_id"].where(df["device_id"].notna(), None)
    rows = df.to_dict("records")

    result = fraud_model.train(rows, {"contamination": args.contamination, "n_estimators": args.n_estimators})
    print(json.dumps(result["model"], indent=2))

    if args.out:
        scores = pd.DataFrame(result["scores"])
        scores["reasons"] = scores["reasons"].apply(json.dumps)
        scores.to_csv(args.out, index=False)
        print(f"wrote {len(scores)} scores to {args.out}")


if __name__ == "__main__":
    main()
