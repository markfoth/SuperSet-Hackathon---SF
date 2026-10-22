"""Shared paths, study area, logging and manifest helpers for the data pipeline.

Every builder writes its own manifest entry through `update_manifest()` so
`data/sf/manifest.yaml` is always the record of what exists and where it came
from. Nothing in `public/data/` should exist without a manifest entry.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import date
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data" / "sf"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
PUBLIC_DATA_DIR = REPO_ROOT / "public" / "data"
MANIFEST_PATH = DATA_DIR / "manifest.yaml"
DOWNLOAD_LOG = RAW_DIR / "_downloads.json"

# Study area: San Francisco plus the northern Peninsula to SFO's southern edge.
# (west, south, east, north) in EPSG:4326.
STUDY_BBOX = (-122.53, 37.60, -122.35, 37.835)
# San Francisco city/county only (used for plausibility checks on DataSF data).
SF_BBOX = (-122.53, 37.70, -122.35, 37.835)

# Projected CRS for metric operations (NAD83 / California zone 3, metres).
METRIC_CRS = "EPSG:26943"

DEFAULT_WORKPLACES = {
    "sfo": {"name": "San Francisco International Airport", "lat": 37.6213, "lon": -122.3790},
    "fidi": {"name": "Financial District", "lat": 37.7946, "lon": -122.3999},
}

# The day timetables must cover (the hackathon demo). Override with CG_SERVICE_DATE=YYYY-MM-DD.
TARGET_SERVICE_DATE = os.environ.get("CG_SERVICE_DATE", "2026-10-22")

USER_AGENT = "CommonGround-hackathon-data-pipeline/0.1 (open data research)"


def get_logger(name: str) -> logging.Logger:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s",
                        datefmt="%H:%M:%S")
    return logging.getLogger(name)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def read_download_log() -> dict[str, Any]:
    if DOWNLOAD_LOG.exists():
        return json.loads(DOWNLOAD_LOG.read_text(encoding="utf-8"))
    return {}


def write_download_log(log: dict[str, Any]) -> None:
    DOWNLOAD_LOG.parent.mkdir(parents=True, exist_ok=True)
    DOWNLOAD_LOG.write_text(json.dumps(log, indent=2, sort_keys=True), encoding="utf-8")


def load_manifest() -> dict[str, Any]:
    if not MANIFEST_PATH.exists():
        return {}
    return yaml.safe_load(MANIFEST_PATH.read_text(encoding="utf-8")) or {}


MANIFEST_HEADER = """\
# Common Ground data manifest — San Francisco + northern Peninsula.
#
# One entry per dataset. Builders update their own entry via
# scripts/_common.py:update_manifest(); tests/test_data.py checks that every
# processed file referenced here exists and that its feature_count matches.
#
# Fields: source, source_url, licence, downloaded_at, measurement_period,
# resolution, feature_count, raw_path, processed_path (list), script,
# refresh, limitations, status (processed | downloaded | blocked | deferred).
"""

REQUIRED_FIELDS = (
    "source", "source_url", "licence", "downloaded_at", "measurement_period", "resolution",
    "feature_count", "raw_path", "processed_path", "script", "refresh", "limitations", "status",
)


def update_manifest(dataset_id: str, entry: dict[str, Any]) -> None:
    manifest = load_manifest()
    current = manifest.get(dataset_id, {})
    current.update(entry)
    manifest[dataset_id] = {k: current.get(k) for k in REQUIRED_FIELDS} | {
        k: v for k, v in current.items() if k not in REQUIRED_FIELDS
    }
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    body = yaml.safe_dump(dict(sorted(manifest.items())), sort_keys=False, allow_unicode=True, width=100)
    MANIFEST_PATH.write_text(MANIFEST_HEADER + "\n" + body, encoding="utf-8")


def downloaded_at(key: str) -> str | None:
    return read_download_log().get(key, {}).get("downloaded_at")


def rel(path: Path) -> str:
    return path.resolve().relative_to(REPO_ROOT).as_posix()


def write_json(path: Path, obj: Any, *, precision_note: str | None = None) -> int:
    """Write compact JSON; returns bytes written."""
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def today() -> str:
    return date.today().isoformat()


def env(name: str) -> str | None:
    """Read a setting from the environment, falling back to the repo's .env file."""
    if os.environ.get(name):
        return os.environ[name]
    env_file = REPO_ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith(f"{name}="):
                value = line.split("=", 1)[1].strip().strip('"').strip("'")
                return value or None
    return None
