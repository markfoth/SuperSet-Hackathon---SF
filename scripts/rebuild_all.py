#!/usr/bin/env python
"""Run the whole data pipeline in dependency order, stopping at the first failure.

    download_datasets -> process_datasets -> build_commute_fixtures -> build_content -> validate_datasets

Usage:
    .venv/Scripts/python.exe scripts/rebuild_all.py --dry-run
    .venv/Scripts/python.exe scripts/rebuild_all.py                 # full run (downloads only what is missing)
    .venv/Scripts/python.exe scripts/rebuild_all.py --offline       # skip downloading; rebuild from data/sf/raw
    .venv/Scripts/python.exe scripts/rebuild_all.py --refresh       # re-download every source first
    .venv/Scripts/python.exe scripts/rebuild_all.py --from build_content
    .venv/Scripts/python.exe scripts/rebuild_all.py --dataset crime transit   # rebuild individual datasets

--dataset passes the names to process_datasets.py --only (see `process_datasets.py --list`),
then runs the fixtures/validation steps that depend on them.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
STEPS = ["download_datasets", "process_datasets", "build_commute_fixtures", "build_content", "validate_datasets"]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--offline", action="store_true", help="skip download_datasets")
    ap.add_argument("--refresh", action="store_true", help="re-download every source")
    ap.add_argument("--from", dest="from_step", choices=STEPS)
    ap.add_argument("--dataset", nargs="+", help="process only these datasets (process_datasets --only)")
    args = ap.parse_args(argv)

    steps = STEPS[STEPS.index(args.from_step):] if args.from_step else list(STEPS)
    if args.offline and "download_datasets" in steps:
        steps.remove("download_datasets")
    if args.dataset:
        steps = [s for s in steps if s != "download_datasets"]
        if not any(d in ("transit", "neighbourhoods") for d in args.dataset):
            steps = [s for s in steps if s != "build_commute_fixtures"]
        if "neighbourhoods" not in args.dataset:
            steps = [s for s in steps if s != "build_content"]

    plan = []
    for s in steps:
        cmd = [sys.executable, "-X", "utf8", str(REPO_ROOT / "scripts" / f"{s}.py")]
        if s == "download_datasets" and args.refresh:
            cmd.append("--refresh")
        if s == "process_datasets" and args.dataset:
            cmd += ["--only", *args.dataset]
        plan.append((s, cmd))
    print("Rebuild plan:")
    for i, (s, cmd) in enumerate(plan, 1):
        print(f"  {i}. {s} {' '.join(cmd[4:])}")
    if args.dry_run:
        return 0

    started = time.monotonic()
    for s, cmd in plan:
        print(f"\n=== {s} ===", flush=True)
        t0 = time.monotonic()
        rc = subprocess.run(cmd, cwd=REPO_ROOT).returncode
        if rc != 0:
            print(f"\nFAILED: {s} exited {rc} after {time.monotonic() - t0:.0f}s. Stopping.")
            return rc
        print(f"=== done: {s} ({time.monotonic() - t0:.0f}s) ===")
    print(f"\nAll steps completed in {time.monotonic() - started:.0f}s.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
