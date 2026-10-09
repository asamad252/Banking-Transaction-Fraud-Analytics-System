"""Feature engineering for transaction anomaly detection.

Every feature answers "how unusual is this transaction *for this account*?",
because a $4,000 transfer is routine for a business account and alarming for a
student checking account. Features only look backwards in time, so scoring one
new transaction against its account history gives the same numbers as scoring
it inside a full batch.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

FEATURES = [
    "amount_dev",     # robust z-score of log(amount) against the account's earlier same-direction transactions
    "amount_ratio",   # log(amount / the account's earlier same-direction median)
    "over_max",       # how far the amount exceeds the largest earlier same-direction amount (0 if it doesn't)
    "log_amount",     # absolute size
    "is_night",       # 00:00-05:59 UTC
    "log_gap",        # log seconds since the account's previous transaction
    "velocity_1h",    # transactions on the account in the previous hour
    "velocity_24h",   # ... and in the previous 24 hours
    "is_away",        # city differs from the customer's home city
    "is_foreign",     # country differs from the customer's home country
    "new_device",     # online/mobile device not seen before on this account
    "is_outflow",     # money leaving the account
]

REQUIRED_COLUMNS = [
    "id", "account_id", "type", "amount", "channel", "city", "country",
    "device_id", "created_at", "home_city", "home_country",
]

_OUTFLOW = {"withdrawal", "payment", "transfer_out"}
_MIN_HISTORY = 5  # earlier transactions needed before per-account statistics are trusted


def _prior_stats(log_amounts: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Median, MAD and maximum of all *earlier* values, for each position in the series."""
    n = len(log_amounts)
    med = np.full(n, np.nan)
    mad = np.full(n, np.nan)
    top = np.full(n, np.nan)
    for i in range(_MIN_HISTORY, n):
        prior = log_amounts[:i]
        m = np.median(prior)
        med[i] = m
        mad[i] = np.median(np.abs(prior - m))
        top[i] = prior.max()
    return med, mad, top


def _velocity(seconds: np.ndarray, window: int) -> np.ndarray:
    """How many earlier transactions fall inside `window` seconds before each one."""
    left = np.searchsorted(seconds, seconds - window, side="left")
    return np.arange(len(seconds)) - left


def build_features(rows: list[dict] | pd.DataFrame) -> pd.DataFrame:
    """Return one feature row per transaction, indexed by transaction id.

    `rows` needs the columns in REQUIRED_COLUMNS. Rows may arrive in any order.
    """
    df = pd.DataFrame(rows).copy()
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"missing columns: {', '.join(missing)}")
    if df.empty:
        return pd.DataFrame(columns=FEATURES)

    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").astype(float)
    if df["amount"].isna().any() or (df["amount"] <= 0).any():
        raise ValueError("amount must be a positive number on every row")
    df["created_at"] = pd.to_datetime(df["created_at"], utc=True, format="ISO8601")
    df = df.sort_values(["account_id", "created_at", "id"], kind="stable").reset_index(drop=True)

    df["log_amount"] = np.log1p(df["amount"])
    df["is_night"] = (df["created_at"].dt.hour < 6).astype(float)
    df["is_away"] = (df["city"].fillna("") != df["home_city"].fillna("")).astype(float)
    df["is_foreign"] = (df["country"].fillna("") != df["home_country"].fillna("")).astype(float)
    df["is_outflow"] = df["type"].isin(_OUTFLOW).astype(float)

    epoch = pd.Timestamp("1970-01-01", tz="UTC")
    seconds = (df["created_at"] - epoch).dt.total_seconds()
    log_amount = df["log_amount"].to_numpy()
    outflow = df["is_outflow"].to_numpy() == 1.0

    amount_dev = np.zeros(len(df))
    amount_ratio = np.zeros(len(df))
    over_max = np.zeros(len(df))
    log_gap = np.zeros(len(df))
    v1h = np.zeros(len(df))
    v24h = np.zeros(len(df))
    new_device = np.zeros(len(df))

    for _, idx in df.groupby("account_id", sort=False).indices.items():
        secs = seconds.to_numpy()[idx]

        # Money in and money out are judged separately: a payroll deposit should
        # not make a same-sized outgoing wire look normal.
        for direction in (True, False):
            sub = idx[outflow[idx] == direction]
            if len(sub) == 0:
                continue
            la = log_amount[sub]
            med, mad, top = _prior_stats(la)
            # Until an account has history, compare against the whole batch.
            pool = log_amount[outflow == direction]
            pool_median = float(np.median(pool))
            pool_mad = float(np.median(np.abs(pool - pool_median))) or 1.0
            med = np.where(np.isnan(med), pool_median, med)
            mad = np.where(np.isnan(mad), pool_mad, mad)
            scale = np.maximum(mad * 1.4826, 0.25)
            amount_dev[sub] = np.clip((la - med) / scale, -8, 12)
            amount_ratio[sub] = la - med  # difference of logs is roughly log(amount / median)
            over_max[sub] = np.where(np.isnan(top), 0.0, np.clip(la - top, 0, None))

        gap = np.diff(secs, prepend=secs[0])
        gap[0] = 86_400  # first transaction: assume a quiet day before it
        log_gap[idx] = np.log1p(np.maximum(gap, 0))
        v1h[idx] = _velocity(secs, 3_600)
        v24h[idx] = _velocity(secs, 86_400)

        # A device counts as new the first time it appears, once the account
        # already has an established device.
        seen: set[str] = set()
        devices = df["device_id"].to_numpy()[idx]
        flags = np.zeros(len(idx))
        for j, dev in enumerate(devices):
            if isinstance(dev, str) and dev:
                if seen and dev not in seen:
                    flags[j] = 1.0
                seen.add(dev)
        new_device[idx] = flags

    df["amount_dev"] = amount_dev
    df["amount_ratio"] = amount_ratio
    df["over_max"] = over_max
    df["log_gap"] = log_gap
    df["velocity_1h"] = v1h
    df["velocity_24h"] = v24h
    df["new_device"] = new_device

    out = df.set_index("id")[FEATURES].astype(float)
    # Columns the explainer needs, kept alongside the features.
    out.attrs["context"] = df.set_index("id")[["amount", "type", "city", "country", "created_at"]]
    return out


def explain(features: pd.Series, context: pd.Series) -> list[str]:
    """Plain-language reasons a transaction stands out, strongest first."""
    reasons: list[tuple[float, str]] = []

    ratio = float(np.exp(features["amount_ratio"]))
    direction = "outgoing" if features["is_outflow"] else "incoming"
    if features["amount_dev"] >= 3 and ratio >= 3:
        reasons.append((features["amount_dev"] + 2, f"Amount is about {ratio:.0f}x this account's usual {direction} transaction"))
    elif features["over_max"] > 0.2:
        reasons.append((4.5, f"Largest {direction} amount seen on this account"))
    if features["is_foreign"]:
        reasons.append((6.0, f"Made in {context['country']}, outside the customer's home country"))
    elif features["is_away"]:
        reasons.append((2.5, f"Made in {context['city']}, away from the customer's home city"))
    if features["new_device"]:
        reasons.append((4.0, "First time this device has been used on the account"))
    if features["velocity_1h"] >= 3:
        n = int(features["velocity_1h"]) + 1
        reasons.append((3.0 + features["velocity_1h"], f"{n} transactions on this account within an hour"))
    if features["is_night"]:
        reasons.append((2.0, f"Made at {context['created_at']:%H:%M} UTC, outside normal hours"))

    if not reasons:
        return ["Unusual combination of amount, timing and location for this account"]
    return [text for _, text in sorted(reasons, key=lambda r: -r[0])]
