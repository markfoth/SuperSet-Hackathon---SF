#!/usr/bin/env python
"""Process raw downloads (data/sf/raw/) into browser-ready files (data/sf/processed/).

Hybrid model: fine geography for map layers (street segments, park polygons,
stops, H3 cells) plus one neighbourhood-level summary file
(neighbourhood_metrics.json) for cards, filtering and ranking.

Each step is independent, reads only raw files plus processed/neighbourhoods.geojson,
and records its own manifest entry. A step whose raw input is missing is marked
in the manifest and skipped; it never stops the others.

Usage:
    .venv/Scripts/python.exe scripts/process_datasets.py               # all steps
    .venv/Scripts/python.exe scripts/process_datasets.py --only crime cycling
    .venv/Scripts/python.exe scripts/process_datasets.py --list
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import traceback
import zipfile
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Callable

import geopandas as gpd
import h3
import numpy as np
import pandas as pd
import shapely
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, shape
from shapely.ops import polygonize, unary_union

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import (  # noqa: E402
    METRIC_CRS, PROCESSED_DIR, RAW_DIR, SF_BBOX, STUDY_BBOX, TARGET_SERVICE_DATE, get_logger, read_download_log, rel,
    today, update_manifest, write_json,
)

log = get_logger("process")
SCRIPT = "scripts/process_datasets.py"
SAMPLE_RES = 9   # ~0.105 km² cells (≈174 m edge): neighbourhood sampling, hills layer
GRID_RES = 8     # ~0.74 km² cells (≈461 m edge): crime/collision map layers (deliberately coarse)
COORD_DP = 5     # ~1 m; finer than any source here is false precision


class MissingInput(Exception):
    pass


# --- generic helpers ---------------------------------------------------------------

def raw(name: str) -> Path:
    p = RAW_DIR / name
    if not p.exists():
        raise MissingInput(f"{rel(p)} not found — run scripts/download_datasets.py")
    return p


def dl(key: str) -> dict:
    return read_download_log().get(key, {})


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def round_geom(geom):
    out = shapely.transform(geom, lambda c: np.round(c, COORD_DP))
    # Rounding can collapse tiny slivers (piers) into invalid rings; repair polygons.
    if out.geom_type in ("Polygon", "MultiPolygon") and not out.is_valid:
        out = out.buffer(0)
    return out


def write_geojson(gdf: gpd.GeoDataFrame, name: str, meta: dict | None = None) -> tuple[Path, int]:
    gdf = gdf.to_crs(4326).copy()
    gdf["geometry"] = gdf.geometry.apply(round_geom)
    gdf = gdf[~gdf.geometry.is_empty & gdf.geometry.notna()]
    fc = json.loads(gdf.to_json(drop_id=True))
    fc.pop("bbox", None)
    if meta:
        fc["meta"] = meta
    path = PROCESSED_DIR / name
    size = write_json(path, fc)
    log.info("wrote %s (%d features, %.0f KB)", rel(path), len(fc["features"]), size / 1024)
    return path, len(fc["features"])


def write_summary(name: str, obj: dict) -> Path:
    path = PROCESSED_DIR / name
    size = write_json(path, obj)
    log.info("wrote %s (%.0f KB)", rel(path), size / 1024)
    return path


def load_nhoods() -> gpd.GeoDataFrame:
    p = PROCESSED_DIR / "neighbourhoods.geojson"
    if not p.exists():
        raise MissingInput("processed/neighbourhoods.geojson missing — run the 'neighbourhoods' step first")
    return gpd.read_file(p)


def sample_points() -> gpd.GeoDataFrame:
    """H3 res-9 cell centres inside each neighbourhood, in metric CRS.

    The unit of every "share of the neighbourhood within X m of Y" metric.
    A neighbourhood smaller than one cell gets its representative point instead,
    so no neighbourhood is ever silently dropped."""
    nh = load_nhoods()
    rows = []
    for _, r in nh.iterrows():
        cells = set()
        geom = r.geometry
        for poly in getattr(geom, "geoms", [geom]):
            cells |= set(h3.geo_to_cells(poly.__geo_interface__, SAMPLE_RES))
        if not cells:
            pt = geom.representative_point()
            cells = {h3.latlng_to_cell(pt.y, pt.x, SAMPLE_RES)}
        for c in sorted(cells):  # deterministic output across runs
            lat, lon = h3.cell_to_latlng(c)
            rows.append({"nhood_id": r["id"], "h3": c, "geometry": Point(lon, lat)})
    return gpd.GeoDataFrame(rows, crs=4326).to_crs(METRIC_CRS)


def share_by_nhood(points: gpd.GeoDataFrame, mask: pd.Series) -> dict[str, float]:
    s = mask.groupby(points["nhood_id"]).mean()
    return {k: round(float(v), 3) for k, v in s.items()}


def hex_polygon(cell: str) -> Polygon:
    return Polygon([(lng, lat) for lat, lng in h3.cell_to_boundary(cell)])


def percentile_ranks(values: dict[str, float | None]) -> dict[str, float | None]:
    """0 = lowest value among neighbourhoods with data, 1 = highest. None stays None."""
    present = {k: v for k, v in values.items() if v is not None}
    s = pd.Series(present).rank(pct=True, method="average")
    n = len(s)
    out: dict[str, float | None] = {k: None for k in values}
    for k, v in s.items():
        out[k] = round(float((v * n - 1) / (n - 1)) if n > 1 else 0.5, 3)
    return out


# --- P0-A neighbourhoods -------------------------------------------------------------

def step_neighbourhoods() -> dict:
    src = gpd.read_file(raw("neighbourhoods.geojson"))
    if len(src) != 41:
        raise ValueError(f"expected 41 analysis neighbourhoods, got {len(src)}")
    src["name"] = src["nhood"].str.strip()
    src["id"] = src["name"].map(slug)
    if src["id"].duplicated().any():
        raise ValueError("neighbourhood slugs are not unique")
    m = src.to_crs(METRIC_CRS)
    src["area_km2"] = (m.area / 1e6).round(3)
    rp = m.representative_point().to_crs(4326)
    src["label_lat"], src["label_lon"] = rp.y.round(5), rp.x.round(5)
    # Simplify in metres (5 m tolerance) — invisible at city zoom, ~5x smaller file.
    m["geometry"] = m.geometry.simplify(5, preserve_topology=True)
    out = gpd.GeoDataFrame(src[["id", "name", "area_km2", "label_lat", "label_lon"]],
                           geometry=m.geometry, crs=METRIC_CRS).sort_values("id")
    path, n = write_geojson(out, "neighbourhoods.geojson")
    # Sample points for client-side commute eligibility ("62% of this area is within your commute").
    pts = sample_points().to_crs(4326)
    samples = {nid: [[round(p.y, 5), round(p.x, 5)] for p in g.geometry] for nid, g in pts.groupby("nhood_id")}
    p_samples = write_summary("neighbourhood_samples.json", {
        "meta": {"h3_resolution": SAMPLE_RES, "format": "[lat, lon] centres of H3 cells inside each neighbourhood"},
        "neighbourhoods": samples})
    d = dl("neighbourhoods")
    update_manifest("neighbourhoods", {
        "source": "DataSF — Analysis Neighborhoods (SF Planning)",
        "source_url": "https://data.sf.gov/d/j2bu-swwd (map view: https://data.sf.gov/d/p5b7-5n3h)",
        "licence": "ODC Public Domain Dedication and License (PDDL)",
        "downloaded_at": d.get("downloaded_at"),
        "measurement_period": "Boundaries as published (last updated 2023-10)",
        "resolution": "41 neighbourhood polygons",
        "feature_count": n, "raw_path": "data/sf/raw/neighbourhoods.geojson",
        "processed_path": [rel(path), rel(p_samples)], "script": SCRIPT, "refresh": "yearly",
        "limitations": "Planning analysis boundaries, not official or colloquial neighbourhood names. "
                       "Geometry simplified at 5 m. `id` is a slug of the name and is the stable key "
                       "used by every other dataset; renaming a neighbourhood changes it.",
        "status": "processed",
    })
    return {"features": n}


# --- P0-B police incidents -------------------------------------------------------------

VIOLENT = {"Assault", "Robbery", "Homicide", "Rape", "Sex Offense", "Human Trafficking (A), Commercial Sex Acts",
           "Human Trafficking (B), Involuntary Servitude", "Human Trafficking, Commercial Sex Acts"}
PROPERTY = {"Larceny Theft", "Burglary", "Motor Vehicle Theft", "Motor Vehicle Theft?", "Malicious Mischief",
            "Vandalism", "Arson", "Stolen Property"}
VEHICLE_BREAKIN_SUB = {"Larceny - From Vehicle", "Theft From Vehicle", "Larceny - Auto Parts"}
DRUG = {"Drug Offense", "Drug Violation"}
# Administrative, non-criminal or enforcement-driven records: not counted as reported crime.
NOT_CRIME = {"Non-Criminal", "Lost Property", "Missing Person", "Recovered Vehicle", "Suspicious Occ", "Suspicious",
             "Miscellaneous Investigation", "Case Closure", "Courtesy Report", "Traffic Collision",
             "Vehicle Impounded", "Vehicle Misplaced", "Fire Report", "Suicide", "Warrant",
             "Traffic Violation Arrest", "Other", None, ""}
CRIME_GROUPS = ("violent", "property", "vehicle_breakin", "drug", "other")


def crime_groups(category: str | None, sub: str | None) -> list[str]:
    if category in NOT_CRIME:
        return []
    if category in VIOLENT:
        return ["violent"]
    if category in PROPERTY:
        return ["property", "vehicle_breakin"] if sub in VEHICLE_BREAKIN_SUB else ["property"]
    if category in DRUG:
        return ["drug"]
    return ["other"]


def step_crime() -> dict:
    rows = json.loads(raw("police_incidents_12m.json").read_text(encoding="utf-8"))
    note = dl("police_incidents").get("note", "")
    window = re.findall(r"\d{4}-\d{2}-\d{2}", note)
    nh = load_nhoods()
    name_to_id = dict(zip(nh["name"], nh["id"]))
    area = dict(zip(nh["id"], nh["area_km2"]))

    df = pd.DataFrame(rows)
    n_rows = len(df)
    df = df[df["report_type_code"].isin(["II", "VI"])]  # initial reports; supplements duplicate them
    n_initial = len(df)
    df["groups"] = [crime_groups(c, s) for c, s in zip(df["incident_category"], df["incident_subcategory"])]
    df = df[df["groups"].map(bool)]
    df["lat"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["lon"] = pd.to_numeric(df["longitude"], errors="coerce")

    # Neighbourhood assignment: point-in-polygon where coordinates exist, else SFPD's own field.
    has_xy = df["lat"].notna() & df["lon"].notna()
    pts = gpd.GeoDataFrame(df[has_xy], geometry=gpd.points_from_xy(df.loc[has_xy, "lon"], df.loc[has_xy, "lat"]), crs=4326)
    joined = gpd.sjoin(pts, nh[["id", "geometry"]], how="left", predicate="within")
    joined = joined[~joined.index.duplicated()]
    df["nhood_id"] = None
    df.loc[joined.index, "nhood_id"] = joined["id"]
    no_xy = ~has_xy
    df.loc[no_xy, "nhood_id"] = df.loc[no_xy, "analysis_neighborhood"].map(name_to_id)
    unassigned = int(df["incident_id"].nunique() - df.dropna(subset=["nhood_id"])["incident_id"].nunique())

    # Count distinct incidents per group (an incident with two codes in one group counts once).
    exploded = df.explode("groups")
    by_nhood: dict[str, dict] = {}
    totals = df.dropna(subset=["nhood_id"]).groupby("nhood_id")["incident_id"].nunique()
    per_group = exploded.dropna(subset=["nhood_id"]).groupby(["nhood_id", "groups"])["incident_id"].nunique()
    cats = df.dropna(subset=["nhood_id"]).groupby(["nhood_id", "incident_category"])["incident_id"].nunique()
    for nid in nh["id"]:
        g = {grp: int(per_group.get((nid, grp), 0)) for grp in CRIME_GROUPS}
        total = int(totals.get(nid, 0))
        top = cats.loc[nid].sort_values(ascending=False).head(6) if nid in cats.index.get_level_values(0) else pd.Series(dtype=int)
        by_nhood[nid] = {
            "total": total,
            "per_km2": round(total / area[nid], 1),
            **{grp: g[grp] for grp in CRIME_GROUPS},
            **{f"{grp}_per_km2": round(g[grp] / area[nid], 1) for grp in ("violent", "property")},
            "top_categories": {k: int(v) for k, v in top.items()},
        }
    for key in ("per_km2", "violent_per_km2", "property_per_km2"):
        ranks = percentile_ranks({k: v[key] for k, v in by_nhood.items()})
        for k in by_nhood:
            by_nhood[k][f"{key}_pctile"] = ranks[k]

    meta = {
        "window_start": window[0] if window else None, "window_end_exclusive": window[1] if len(window) > 1 else None,
        "source": "SFPD Incident Reports (DataSF wg3w-h783)", "generated": today(),
        "rows_downloaded": n_rows, "initial_report_rows": n_initial,
        "incidents_counted": int(df["incident_id"].nunique()), "incidents_without_neighbourhood": unassigned,
        "incidents_without_coordinates": int(no_xy.sum()),
        "unit": "distinct reported incidents (initial reports only); per_km2 uses land area of the neighbourhood",
        "groups": {"violent": sorted(VIOLENT), "property": sorted(PROPERTY),
                   "vehicle_breakin": sorted(VEHICLE_BREAKIN_SUB) + ["(subset of property)"],
                   "drug": sorted(DRUG), "other": "all remaining categories except excluded",
                   "excluded": sorted(c for c in NOT_CRIME if c)},
        "limitations": [
            "Reported incidents only — not all crime is reported, and reporting rates differ by place and type.",
            "Per-km² rates are not per-resident: commercial and visitor areas (Downtown, Tenderloin, "
            "Financial District) have high daytime populations that inflate them.",
            "Drug offences largely reflect enforcement activity rather than resident risk.",
            "SFPD anonymises locations to the nearest intersection or block; points are not addresses.",
            "This describes reported incidents; it does not make any area safe or unsafe.",
        ],
    }
    p_summary = write_summary("crime_by_neighbourhood.json", {"meta": meta, "neighbourhoods": by_nhood})

    # Map layer: H3 res-8 counts (≈461 m cells), so no point is shown at false precision.
    pts_ok = df[has_xy].copy()
    pts_ok["cell"] = [h3.latlng_to_cell(a, b, GRID_RES) for a, b in zip(pts_ok["lat"], pts_ok["lon"])]
    cell_rows = []
    ex = pts_ok.explode("groups")
    tot_c = pts_ok.groupby("cell")["incident_id"].nunique()
    grp_c = ex.groupby(["cell", "groups"])["incident_id"].nunique()
    for cell, total in tot_c.items():
        cell_area = h3.cell_area(cell, unit="km^2")
        cell_rows.append({
            "h3": cell, "total": int(total), "per_km2": round(total / cell_area),
            **{grp: int(grp_c.get((cell, grp), 0)) for grp in ("violent", "property", "vehicle_breakin")},
            "geometry": hex_polygon(cell),
        })
    grid = gpd.GeoDataFrame(cell_rows, crs=4326)
    p_grid, n_grid = write_geojson(grid, "crime_grid.geojson", meta={
        "h3_resolution": GRID_RES, "window_start": meta["window_start"],
        "window_end_exclusive": meta["window_end_exclusive"], "unit": "distinct reported incidents per cell",
    })
    d = dl("police_incidents")
    update_manifest("police_incidents", {
        "source": "DataSF — Police Department Incident Reports: 2018 to Present (SFPD)",
        "source_url": "https://data.sf.gov/d/wg3w-h783",
        "licence": "ODC Public Domain Dedication and License (PDDL)",
        "downloaded_at": d.get("downloaded_at"),
        "measurement_period": f"{meta['window_start']} to {meta['window_end_exclusive']} (exclusive): 12 complete months",
        "resolution": "Incident points anonymised to intersection/block; published as neighbourhood totals and H3 res-8 cells",
        "feature_count": n_grid, "raw_path": "data/sf/raw/police_incidents_12m.json",
        "processed_path": [rel(p_summary), rel(p_grid)], "script": SCRIPT, "refresh": "monthly",
        "limitations": " ".join(meta["limitations"]) + f" {unassigned} incidents could not be placed in a neighbourhood.",
        "status": "processed", "incidents_counted": meta["incidents_counted"],
    })
    return {"incidents": meta["incidents_counted"], "cells": n_grid}


# --- P0-C cycling ------------------------------------------------------------------------

def bike_category(facility: str | None, symbology: str | None) -> str:
    f = facility.upper() if isinstance(facility, str) else ""
    s = symbology.upper() if isinstance(symbology, str) else ""
    if f == "CLASS I":
        return "path"           # off-street shared-use path
    if f == "CLASS IV" or s == "SEPARATED BIKEWAY":
        return "protected"      # physically separated on-street bikeway
    if s == "NEIGHBORWAY":
        return "neighborway"    # traffic-calmed residential street
    if f == "CLASS II":
        return "lane"           # painted (sometimes buffered) bike lane
    if f == "CLASS III":
        return "route"          # signed shared route / sharrows
    return "other"


def dem_sampler():
    """Bilinearly sample metre-valued USGS elevations at metric-CRS coordinates.

    Pixel centres matter: nearest-neighbour sampling creates staircase grades on
    flat roads. All four contributing pixels must be valid; never bridge nodata.
    The raster has no band unit tag; metre elevations are the USGS service contract.
    """
    p = RAW_DIR / "elevation_3dep_10m.tif"
    if not p.exists():
        return None
    import rasterio
    from pyproj import Transformer
    with rasterio.open(p) as src:
        if not src.crs or not src.crs.is_projected:
            raise ValueError("DEM must have a projected CRS with metre horizontal units")
        if src.crs.linear_units != "metre":
            raise ValueError(f"unsupported DEM horizontal units: {src.crs.linear_units}")
        band = src.read(1, masked=True).astype("float64").filled(np.nan)
        transform = src.transform
        transformer = Transformer.from_crs(METRIC_CRS, src.crs, always_xy=True)
    band[~np.isfinite(band) | (band < -1000) | (band > 10000)] = np.nan

    def sample(x: np.ndarray, y: np.ndarray) -> np.ndarray:
        xs, ys = transformer.transform(x, y)
        cols, rows = ~transform * (np.asarray(xs), np.asarray(ys))
        # Affine gives pixel corners; array samples are at pixel centres.
        cols, rows = cols - 0.5, rows - 0.5
        cc, rr = np.floor(cols).astype(int), np.floor(rows).astype(int)
        ok = (rr >= 0) & (rr + 1 < band.shape[0]) & (cc >= 0) & (cc + 1 < band.shape[1])
        out = np.full(len(rr), np.nan)
        r, c = rr[ok], cc[ok]
        dx, dy = cols[ok] - c, rows[ok] - r
        out[ok] = ((1-dx)*(1-dy)*band[r, c] + dx*(1-dy)*band[r, c+1]
                   + (1-dx)*dy*band[r+1, c] + dx*dy*band[r+1, c+1])
        return out
    return sample, band, transform, abs(transform.a)


def segment_grade(line: LineString, sample) -> float | None:
    """Steepest sustained grade (%) along a segment, sampling every ~25 m; None if too short."""
    length = line.length
    if length < 40:
        return None
    n = max(2, int(length // 25) + 1)
    pts = [line.interpolate(d) for d in np.linspace(0, length, n)]
    z = sample(np.array([p.x for p in pts]), np.array([p.y for p in pts]))
    if np.isnan(z).any():
        return None
    step = length / (n - 1)
    # Grade over ≥50 m windows to avoid single-pixel noise.
    w = max(1, int(round(50 / step)))
    grades = [abs(z[i + w] - z[i]) / (step * w) for i in range(0, n - w)]
    return round(float(max(grades)) * 100, 1) if grades else None


def step_cycling() -> dict:
    src = gpd.read_file(raw("bike_network.geojson"))
    src = src[src.geometry.notna()]
    src["cat"] = [bike_category(f, s) for f, s in zip(src["facility_t"], src["symbology"])]
    m = src.to_crs(METRIC_CRS)
    m["geometry"] = m.geometry.simplify(1.5)
    m["length_m"] = m.length.round(0)
    dem = dem_sampler()
    if dem:
        sample = dem[0]
        m["grade_pct"] = [segment_grade(g, sample) if isinstance(g, LineString) else None for g in m.geometry]
    else:
        m["grade_pct"] = None
    out = gpd.GeoDataFrame({
        "cat": m["cat"], "class": m["facility_t"], "street": m["streetname"].str.title(),
        "from": m["from_st"].str.title(), "to": m["to_st"].str.title(),
        "buffered": m["buffered"].eq("YES"), "raised": m["raised"].eq("YES"),
        "installed": pd.to_numeric(m["install_yr"], errors="coerce").astype("Int64"),
        "length_m": m["length_m"], "grade_pct": m["grade_pct"],
    }, geometry=m.geometry, crs=METRIC_CRS)
    path, n = write_geojson(out, "cycling_network.geojson", meta={
        "categories": {"protected": "Class IV separated bikeway", "path": "Class I off-street path",
                       "lane": "Class II painted bike lane", "neighborway": "Neighborway (traffic-calmed)",
                       "route": "Class III signed shared route", "other": "unclassified"},
        "grade_pct": "steepest 50 m grade along the segment from USGS 3DEP 10 m DEM; null if <40 m or no DEM",
    })

    # Neighbourhood km per category (segments clipped to each neighbourhood).
    nh = load_nhoods().to_crs(METRIC_CRS)
    inter = gpd.overlay(out[["cat", "geometry"]], nh[["id", "geometry"]], how="intersection", keep_geom_type=True)
    inter["km"] = inter.length / 1000
    km = inter.groupby(["id", "cat"])["km"].sum()
    area = dict(zip(nh["id"], nh.area / 1e6))
    summary = {}
    for nid in nh["id"]:
        cats = {c: round(float(km.get((nid, c), 0.0)), 2) for c in ("protected", "path", "lane", "neighborway", "route")}
        dedicated = cats["protected"] + cats["path"] + cats["lane"]
        summary[nid] = {"km": cats, "dedicated_km_per_km2": round(dedicated / area[nid], 2),
                        "protected_km": round(cats["protected"] + cats["path"], 2)}
    counts = Counter(out["cat"])
    d = dl("bike_network")
    update_manifest("cycling_network", {
        "source": "DataSF — MTA Bike Network Linear Features (SFMTA)",
        "source_url": "https://data.sf.gov/d/ygmz-vaxd",
        "licence": "ODC Public Domain Dedication and License (PDDL)",
        "downloaded_at": d.get("downloaded_at"), "measurement_period": "Network as of download date",
        "resolution": "Street segment (block-level line geometry)",
        "feature_count": n, "raw_path": "data/sf/raw/bike_network.geojson",
        "processed_path": [rel(path)], "script": SCRIPT, "refresh": "quarterly",
        "limitations": "San Francisco only (no Peninsula facilities). One feature per direction where "
                       "facilities differ, so km totals count each side. Category counts: "
                       + ", ".join(f"{k} {v}" for k, v in sorted(counts.items()))
                       + ". grade_pct is a terrain estimate, not a surveyed street grade.",
        "status": "processed",
    })
    return {"segments": n, "summary": summary}


# --- P0-D parks ---------------------------------------------------------------------------

RPD_PARK_TYPES = {"Regional Park", "Neighborhood Park or Playground", "Mini Park", "Civic Plaza or Square",
                  "Parkway", "Community Garden"}


def osm_polygons(elements: list[dict]) -> list[tuple[dict, object]]:
    out = []
    for e in elements:
        tags = e.get("tags", {})
        try:
            if e["type"] == "way" and len(e.get("geometry", [])) >= 4:
                coords = [(p["lon"], p["lat"]) for p in e["geometry"]]
                if coords[0] == coords[-1]:
                    out.append((tags, Polygon(coords)))
            elif e["type"] == "relation":
                lines = [LineString([(p["lon"], p["lat"]) for p in m["geometry"]])
                         for m in e.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
                polys = list(polygonize(unary_union(lines)))
                if polys:
                    out.append((tags, MultiPolygon(polys) if len(polys) > 1 else polys[0]))
        except (ValueError, shapely.errors.GEOSException):
            continue
    return out


def step_parks() -> dict:
    rpd = gpd.read_file(raw("parks_rpd.geojson"))
    rpd = rpd[rpd["propertytype"].isin(RPD_PARK_TYPES) & rpd.geometry.notna()]
    w, s, e, n = SF_BBOX
    rpd = rpd[rpd.geometry.representative_point().within(shapely.box(w, s, e, n))]
    rpd_out = gpd.GeoDataFrame({
        "name": rpd["property_name"], "type": rpd["propertytype"],
        "acres": pd.to_numeric(rpd["acres"], errors="coerce").round(2),
        "manager": "SF Recreation & Parks", "source": "rpd",
    }, geometry=rpd.geometry.values, crs=4326).to_crs(METRIC_CRS)
    rpd_out["geometry"] = rpd_out.geometry.buffer(0)

    added = 0
    osm_note = "OSM supplement not available"
    osm_path = RAW_DIR / "osm_parks.json"
    frames = [rpd_out]
    if osm_path.exists():
        els = json.loads(osm_path.read_text(encoding="utf-8")).get("elements", [])
        polys = [(t, g) for t, g in osm_polygons(els) if t.get("leisure") in ("park", "nature_reserve") and t.get("name")]
        if polys:
            osm = gpd.GeoDataFrame([{"name": t["name"], "type": t["leisure"].replace("_", " ").title(),
                                     "manager": t.get("operator") or "Other (non-RPD)", "source": "osm"} for t, _ in polys],
                                   geometry=[g for _, g in polys], crs=4326).to_crs(METRIC_CRS)
            osm["geometry"] = osm.geometry.buffer(0)
            osm = osm[osm.area >= 2000]  # ≥0.2 ha
            rpd_union = unary_union(rpd_out.geometry.values)
            # Keep only OSM parks mostly *outside* RPD land, then subtract the overlap.
            overlap = osm.geometry.intersection(rpd_union).area / osm.area
            osm = osm[overlap < 0.5].copy()
            osm["geometry"] = osm.geometry.difference(rpd_union)
            osm = osm[osm.area >= 2000]
            # Drop OSM parks nested inside bigger OSM parks (e.g. sub-areas of the Presidio).
            osm = osm.assign(_area=osm.area).sort_values("_area", ascending=False).drop(columns="_area")
            kept, acc = [], None
            for idx, g in osm.geometry.items():
                if acc is not None and g.intersection(acc).area / g.area > 0.5:
                    continue
                kept.append(idx)
                acc = g if acc is None else acc.union(g)
            osm = osm.loc[kept]
            osm["acres"] = (osm.area / 4046.86).round(2)
            frames.append(osm)
            added = len(osm)
            osm_note = f"{added} non-RPD parks added from OpenStreetMap (ODbL), e.g. " + ", ".join(osm["name"].head(6))
    parks = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs=METRIC_CRS)
    parks["geometry"] = parks.geometry.simplify(3, preserve_topology=True)
    path, n = write_geojson(parks[["name", "type", "acres", "manager", "source", "geometry"]], "parks.geojson")

    # Access: share of each neighbourhood's sample points within 400 m (straight line,
    # ~5 min walk) of a park of at least 0.5 acre; and park share of land area.
    pts = sample_points()
    usable = parks[parks["acres"].fillna(0) >= 0.5]
    union = unary_union(usable.geometry.values)
    dist = pts.distance(union)
    within400 = share_by_nhood(pts, dist <= 400)
    nh = load_nhoods().to_crs(METRIC_CRS)
    all_parks = unary_union(parks.geometry.values)
    summary = {}
    for _, r in nh.iterrows():
        park_area = r.geometry.intersection(all_parks).area
        summary[r["id"]] = {"share_within_400m": within400.get(r["id"]),
                            "park_land_share": round(park_area / r.geometry.area, 3)}
    d = dl("parks_rpd")
    update_manifest("parks", {
        "source": "DataSF — Recreation and Parks Properties (SF Rec & Park); supplemented by OpenStreetMap",
        "source_url": "https://data.sf.gov/d/gtr9-ntp6 ; https://www.openstreetmap.org (Overpass API)",
        "licence": "RPD: ODC PDDL. OSM supplement: ODbL 1.0 — attribution '© OpenStreetMap contributors' required",
        "downloaded_at": d.get("downloaded_at"), "measurement_period": "Properties as of download date",
        "resolution": "Park polygons; neighbourhood access shares from H3 res-9 sample points",
        "feature_count": n, "raw_path": "data/sf/raw/parks_rpd.geojson, data/sf/raw/osm_parks.json",
        "processed_path": [rel(path)], "script": SCRIPT, "refresh": "yearly",
        "limitations": "RPD covers only city-owned parks; federal (Presidio, GGNRA) and state land comes from "
                       f"OSM. {osm_note}. Non-park RPD property types (libraries, concessions, Camp Mather, "
                       "Sharp Park outside SF) are excluded. Access uses straight-line distance, not walking routes.",
        "status": "processed",
    })
    return {"parks": n, "osm_added": added, "summary": summary}


# --- P0-E transit ----------------------------------------------------------------------------

FEEDS = {
    # `files` in order of preference; the first one whose timetable covers TARGET_SERVICE_DATE wins.
    "bart": {"files": ["gtfs_bart.zip"], "agency": "BART"},
    "muni": {"files": ["gtfs_muni_511.zip", "gtfs_muni.zip"], "agency": "Muni"},
    "caltrain": {"files": ["gtfs_caltrain.zip"], "agency": "Caltrain"},
    # Only published through 511.org (needs API_511_KEY); included automatically once downloaded.
    "samtrans": {"files": ["gtfs_samtrans.zip"], "agency": "SamTrans", "optional": True},
}


def available_feeds() -> dict[str, dict]:
    """Feeds with a raw file on disk, each resolved to the best file (`file`) and its service day."""
    out = {}
    for key, feed in FEEDS.items():
        present = [f for f in feed["files"] if (RAW_DIR / f).exists()]
        if not present:
            if feed.get("optional"):
                continue
            raise MissingInput(f"no raw GTFS for {key} ({', '.join(feed['files'])})")
        chosen = next((f for f in present if service_date(zipfile.ZipFile(RAW_DIR / f))[2]), present[0])
        out[key] = feed | {"file": chosen, "download_key": chosen.removesuffix(".zip")}
    return out


def gtfs_table(z: zipfile.ZipFile, name: str) -> pd.DataFrame:
    if name not in z.namelist():
        return pd.DataFrame()
    return pd.read_csv(z.open(name), dtype=str, encoding="utf-8-sig", keep_default_na=False)


def route_mode(agency: str, route_type: str) -> str | None:
    if agency == "BART":
        return "bart" if route_type == "1" else None   # BART type-3 rows are bus bridges
    if agency == "Caltrain":
        return "caltrain"
    return {"0": "muni_metro", "5": "cable_car", "3": "bus", "11": "bus"}.get(route_type, "bus")


def active_services(z: zipfile.ZipFile, d: date) -> set[str]:
    cal, cdates = gtfs_table(z, "calendar.txt"), gtfs_table(z, "calendar_dates.txt")
    ds, wd = d.strftime("%Y%m%d"), d.strftime("%A").lower()
    active = set()
    if len(cal):
        active = set(cal[(cal[wd] == "1") & (cal["start_date"] <= ds) & (cal["end_date"] >= ds)]["service_id"])
    if len(cdates):
        ex = cdates[cdates["date"] == ds]
        active |= set(ex[ex["exception_type"] == "1"]["service_id"])
        active -= set(ex[ex["exception_type"] == "2"]["service_id"])
    return active


def feed_period(z: zipfile.ZipFile) -> tuple[date, date]:
    cal, cdates = gtfs_table(z, "calendar.txt"), gtfs_table(z, "calendar_dates.txt")
    starts = list(cal.get("start_date", [])) + list(cdates.get("date", []))
    ends = list(cal.get("end_date", [])) + list(cdates.get("date", []))
    return datetime.strptime(min(starts), "%Y%m%d").date(), datetime.strptime(max(ends), "%Y%m%d").date()


def service_date(z: zipfile.ZipFile) -> tuple[str, set[str], bool]:
    """(day, active service_ids, covers_target).

    Uses TARGET_SERVICE_DATE (the demo day) when the feed has service that day. Otherwise the
    feed is out of date for the target: fall back to a Wednesday inside its own period and say so
    (covers_target=False) — callers must label it, never present it as current."""
    target = date.fromisoformat(TARGET_SERVICE_DATE)
    active = active_services(z, target)
    if active:
        return target.isoformat(), active, True
    lo, hi = feed_period(z)
    d = min(max(lo, target), hi)
    while d.weekday() != 2 and d > lo:
        d -= timedelta(days=1)
    return d.isoformat(), active_services(z, d), False


def step_transit() -> dict:
    w, s, e, n = STUDY_BBOX
    bbox = shapely.box(w, s, e, n)
    stop_rows, route_rows, feed_notes = [], [], {}
    for key, feed in available_feeds().items():
        z = zipfile.ZipFile(raw(feed["file"]))
        routes, trips, stops = gtfs_table(z, "routes.txt"), gtfs_table(z, "trips.txt"), gtfs_table(z, "stops.txt")
        stop_times = pd.read_csv(z.open("stop_times.txt"), dtype=str, encoding="utf-8-sig",
                                 usecols=["trip_id", "stop_id"], keep_default_na=False)
        shapes = gtfs_table(z, "shapes.txt")
        routes["mode"] = [route_mode(feed["agency"], t) for t in routes["route_type"]]
        routes = routes[routes["mode"].notna()]
        trips = trips[trips["route_id"].isin(routes["route_id"])]
        day, active, covers = service_date(z)
        day_trips = trips[trips["service_id"].isin(active)]
        cal = gtfs_table(z, "calendar.txt")
        lo, hi = feed_period(z)
        feed_notes[key] = {"file": feed["file"], "service_date": day, "valid_from": lo.isoformat(),
                           "valid_to": hi.isoformat(), "covers_target": covers, "target_date": TARGET_SERVICE_DATE,
                           "weekday_trips": int(len(day_trips))}
        log.info("%s: %s, valid %s..%s, target %s covered=%s, %d trips on %s", key, feed["file"], lo, hi,
                 TARGET_SERVICE_DATE, covers, len(day_trips), day)

        # Stops: departures on the representative weekday; rail stops roll up to parent stations.
        st = stop_times.merge(trips[["trip_id", "route_id"]], on="trip_id")
        st_day = stop_times[stop_times["trip_id"].isin(day_trips["trip_id"])]
        stops = stops.copy()
        if "parent_station" not in stops:
            stops["parent_station"] = ""
        if "location_type" not in stops:
            stops["location_type"] = ""
        parent = dict(zip(stops["stop_id"], stops["parent_station"]))
        roll = lambda sid: parent.get(sid) or sid  # noqa: E731
        st["node"] = st["stop_id"].map(roll)
        st_day = st_day.assign(node=st_day["stop_id"].map(roll))
        deps = st_day.groupby("node").size()
        route_names = dict(zip(routes["route_id"], routes["route_short_name"].where(routes["route_short_name"] != "", routes["route_long_name"])))
        route_mode_map = dict(zip(routes["route_id"], routes["mode"]))
        node_routes = st.groupby("node")["route_id"].agg(lambda x: sorted(set(x)))
        nodes = stops[stops["stop_id"].isin(node_routes.index)]
        for _, r in nodes.iterrows():
            lat, lon = float(r["stop_lat"]), float(r["stop_lon"])
            if not bbox.contains(Point(lon, lat)):
                continue
            rids = node_routes[r["stop_id"]]
            modes = sorted({route_mode_map[x] for x in rids})
            stop_rows.append({
                "id": f"{key}:{r['stop_id']}", "name": r["stop_name"], "agency": feed["agency"],
                "modes": ",".join(modes), "rail": any(m in ("bart", "caltrain", "muni_metro") for m in modes),
                "routes": ",".join(sorted({route_names[x] for x in rids}, key=lambda v: (len(v), v)))[:120],
                "weekday_departures": int(deps.get(r["stop_id"], 0)),
                "geometry": Point(lon, lat),
            })

        # Routes: the most-used shape per route (direction 0 preferred) to avoid duplicate lines.
        if len(shapes):
            shapes["lat"], shapes["lon"] = shapes["shape_pt_lat"].astype(float), shapes["shape_pt_lon"].astype(float)
            shapes["seq"] = shapes["shape_pt_sequence"].astype(int)
            shape_lines = {sid: LineString(g.sort_values("seq")[["lon", "lat"]].values)
                           for sid, g in shapes.groupby("shape_id") if len(g) > 1}
            tr = trips.copy()
            if "direction_id" not in tr:
                tr["direction_id"] = "0"
            day_counts = day_trips.groupby("route_id").size()
            for rid, g in tr[tr["shape_id"] != ""].groupby("route_id"):
                pref = g[g["direction_id"] == "0"] if (g["direction_id"] == "0").any() else g
                sid = pref["shape_id"].value_counts().idxmax()
                line = shape_lines.get(sid)
                if line is None or not line.intersects(bbox):
                    continue
                rr = routes[routes["route_id"] == rid].iloc[0]
                color = rr.get("route_color", "") or ""
                route_rows.append({
                    "id": f"{key}:{rid}", "agency": feed["agency"], "mode": rr["mode"],
                    "short_name": rr["route_short_name"] or rr["route_long_name"], "long_name": rr["route_long_name"],
                    "color": f"#{color}" if re.fullmatch(r"[0-9A-Fa-f]{6}", color) else None,
                    "weekday_trips": int(day_counts.get(rid, 0)),
                    "geometry": line.intersection(bbox),
                })
    stops_gdf = gpd.GeoDataFrame(stop_rows, crs=4326)
    routes_gdf = gpd.GeoDataFrame(route_rows, crs=4326).to_crs(METRIC_CRS)
    routes_gdf["geometry"] = routes_gdf.geometry.simplify(4)
    # BART: several service lines share one track; keep them all (colours differ) — the UI offsets nothing.
    p_stops, n_stops = write_geojson(stops_gdf, "transit_stops.geojson", meta={"feeds": feed_notes})
    p_routes, n_routes = write_geojson(routes_gdf, "transit_routes.geojson", meta={"feeds": feed_notes})

    # Neighbourhood access: share of sample points within 800 m of a rail station and
    # within 400 m of a "frequent" stop (≥ 120 weekday departures across all routes ≈ every 8 min).
    pts = sample_points()
    sm = stops_gdf.to_crs(METRIC_CRS)
    rail_union = unary_union(sm[sm["rail"]].geometry.values)
    freq_union = unary_union(sm[sm["weekday_departures"] >= 120].geometry.values)
    rail800 = share_by_nhood(pts, pts.distance(rail_union) <= 800)
    freq400 = share_by_nhood(pts, pts.distance(freq_union) <= 400)
    nh = load_nhoods().to_crs(METRIC_CRS)
    summary = {}
    for _, r in nh.iterrows():
        inside = sm[sm.within(r.geometry)]
        summary[r["id"]] = {
            "share_within_800m_rail": rail800.get(r["id"]), "share_within_400m_frequent": freq400.get(r["id"]),
            "rail_stations": sorted(set(inside[inside["rail"] & inside["agency"].isin(["BART", "Caltrain"])]["name"])),
            "stops": int(len(inside)),
        }
    for fk, feed in available_feeds().items():
        d = dl(feed["download_key"])
        update_manifest(f"gtfs_{fk}", {
            "source": {"bart": "BART GTFS (bart.gov developer data)", "muni": "SFMTA Muni GTFS",
                       "caltrain": "Caltrain GTFS (Trillium-hosted official feed)",
                       "samtrans": "SamTrans GTFS via 511.org"}[fk],
            "source_url": d.get("url"),
            "licence": {"bart": "BART Developer License Agreement (https://www.bart.gov/schedules/developers/developer-license-agreement) — revocable; no BART trademarks",
                        "muni": "SFMTA Transit Data License Agreement — derivative data must carry the notice "
                                "'Reproduced with permission granted by the City and County of San Francisco…'",
                        "caltrain": "Caltrain developer terms — unresolved; attribute Caltrain",
                        "samtrans": "511.org Open Data terms — review"}[fk],
            "downloaded_at": d.get("downloaded_at"),
            "measurement_period": (f"Timetable valid {feed_notes[fk]['valid_from']} to {feed_notes[fk]['valid_to']}; "
                                   + (f"COVERS target {TARGET_SERVICE_DATE} ({feed_notes[fk]['weekday_trips']} trips)"
                                      if feed_notes[fk]["covers_target"] else
                                      f"EXPIRED for target {TARGET_SERVICE_DATE} — fallback weekday {feed_notes[fk]['service_date']} used")),
            "resolution": "Stop/station points and route shapes",
            "feature_count": None, "raw_path": f"data/sf/raw/{feed['file']}",
            "processed_path": [rel(p_stops), rel(p_routes)], "script": SCRIPT, "refresh": "quarterly",
            "limitations": ("" if feed_notes[fk]["covers_target"] else
                            f"Timetable does not cover {TARGET_SERVICE_DATE}: route geometry is reliable but departures "
                            f"and commute times reflect the {feed_notes[fk]['valid_from'][:7]} schedule. "
                            + ("SFMTA's public 'current' feed was not updated past this; a current Muni timetable needs "
                               "the 511.org feed (API_511_KEY -> gtfs_muni_511). " if fk == "muni" else ""))
                           + "Scheduled, not real-time."
                           + ("" if "samtrans" in available_feeds() else " No SamTrans (511 key required) — SFO buses (292/398/ECR) are absent."),
            "covers_target_date": feed_notes[fk]["covers_target"],
            "status": "processed",
        })
    update_manifest("transit", {
        "source": "Combined BART + Muni + Caltrain static GTFS", "source_url": "see gtfs_bart / gtfs_muni / gtfs_caltrain",
        "licence": "Per-feed (see gtfs_* entries); SFMTA notice required on the map attribution",
        "downloaded_at": today(), "measurement_period": "Representative weekday per feed",
        "resolution": "Stops (rail rolled up to parent stations) and one representative shape per route",
        "feature_count": n_stops, "raw_path": "data/sf/raw/gtfs_*.zip",
        "processed_path": [rel(p_stops), rel(p_routes)], "script": SCRIPT, "refresh": "quarterly",
        "limitations": f"{n_stops} stops, {n_routes} routes inside the study area. weekday_departures counts all "
                       "trips serving the stop on the representative day. 'Frequent' = >=120 weekday departures. "
                       "SamTrans missing (511 key). Not a routing engine.",
        "status": "processed", "route_count": n_routes,
    })
    return {"stops": n_stops, "routes": n_routes, "summary": summary}


# --- P1 hills -------------------------------------------------------------------------------

def step_hills() -> dict:
    # The former 170 m terrain-slope mean is deliberately retired: it measured
    # adjacent hillsides rather than gradients along the street network.
    from street_gradients import build_street_gradients
    return build_street_gradients()


# --- P1 groceries ----------------------------------------------------------------------------

def step_groceries() -> dict:
    els = json.loads(raw("osm_groceries.json").read_text(encoding="utf-8")).get("elements", [])
    rows = []
    for e in els:
        lat = e.get("lat") or e.get("center", {}).get("lat")
        lon = e.get("lon") or e.get("center", {}).get("lon")
        t = e.get("tags", {})
        if lat is None or not t.get("name"):
            continue
        rows.append({"name": t["name"], "brand": t.get("brand"), "shop": t.get("shop"),
                     "osm_id": f"{e['type']}/{e['id']}", "geometry": Point(lon, lat)})
    gdf = gpd.GeoDataFrame(rows, crs=4326)
    path, n = write_geojson(gdf, "groceries.geojson")
    pts = sample_points()
    sm = gdf[gdf["shop"] == "supermarket"].to_crs(METRIC_CRS)
    within = share_by_nhood(pts, pts.distance(unary_union(sm.geometry.values)) <= 800)
    d = dl("osm_groceries")
    update_manifest("groceries", {
        "source": "OpenStreetMap contributors via Overpass API (shop=supermarket|greengrocer)",
        "source_url": "https://overpass-api.de/api/interpreter", "licence": "ODbL 1.0 — '© OpenStreetMap contributors'",
        "downloaded_at": d.get("downloaded_at"), "measurement_period": "OSM snapshot at download date",
        "resolution": "Point (way/relation centroids)", "feature_count": n,
        "raw_path": "data/sf/raw/osm_groceries.json", "processed_path": [rel(path)], "script": SCRIPT,
        "refresh": "6 months",
        "limitations": "Volunteer-mapped: completeness varies; unnamed shops dropped. Access = straight-line 800 m "
                       "to a shop=supermarket.",
        "status": "processed",
    })
    return {"shops": n, "summary": {k: {"share_within_800m_supermarket": v} for k, v in within.items()}}


# --- P1 collisions ---------------------------------------------------------------------------

def step_collisions() -> dict:
    rows = json.loads(raw("injury_crashes_3y.json").read_text(encoding="utf-8"))
    df = pd.DataFrame(rows)
    df["lat"], df["lon"] = pd.to_numeric(df["tb_latitude"], errors="coerce"), pd.to_numeric(df["tb_longitude"], errors="coerce")
    grp = df["dph_col_grp_description"].fillna("")
    df["kind"] = np.select([grp.str.contains("Ped", case=False), grp.str.contains("Bicycle|Bike", case=False, regex=True)],
                           ["pedestrian", "cyclist"], "vehicle")
    df["ksi"] = df["collision_severity"].fillna("").str.contains("Fatal|Severe", case=False, regex=True)
    w, s, e, n = SF_BBOX
    outside = int((df["lat"].notna() & ~(df["lat"].between(s, n) & df["lon"].between(w, e))).sum())
    df = df[df["lat"].between(s, n) & df["lon"].between(w, e)]  # drops missing and mis-geocoded points
    if outside:
        log.warning("collisions: dropped %d crashes geocoded outside San Francisco", outside)
    nh = load_nhoods()
    pts = gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df["lon"], df["lat"]), crs=4326)
    j = gpd.sjoin(pts, nh[["id", "area_km2", "geometry"]], predicate="within")
    summary = {}
    for nid in nh["id"]:
        g = j[j["id"] == nid]
        a = float(nh.loc[nh["id"] == nid, "area_km2"].iloc[0])
        summary[nid] = {"injury_crashes": int(len(g)), "pedestrian": int((g["kind"] == "pedestrian").sum()),
                        "cyclist": int((g["kind"] == "cyclist").sum()), "killed_or_severe": int(g["ksi"].sum()),
                        "per_km2_per_year": round(len(g) / a / 3, 1)}
    df["cell"] = [h3.latlng_to_cell(a, b, GRID_RES) for a, b in zip(df["lat"], df["lon"])]
    cells = []
    for cell, g in df.groupby("cell"):
        cells.append({"h3": cell, "total": int(len(g)), "pedestrian": int((g["kind"] == "pedestrian").sum()),
                      "cyclist": int((g["kind"] == "cyclist").sum()), "killed_or_severe": int(g["ksi"].sum()),
                      "geometry": hex_polygon(cell)})
    note = dl("injury_crashes").get("note", "")
    path, n = write_geojson(gpd.GeoDataFrame(cells, crs=4326), "collisions_grid.geojson",
                            meta={"h3_resolution": GRID_RES, "window": note})
    d = dl("injury_crashes")
    update_manifest("injury_collisions", {
        "source": "DataSF — Traffic Crashes Resulting in Injury (SFPD/SFDPH TransBASE)",
        "source_url": "https://data.sf.gov/d/ubvf-ztfx", "licence": "ODC Public Domain Dedication and License (PDDL)",
        "downloaded_at": d.get("downloaded_at"), "measurement_period": note.replace("window ", "") + " (3 years)",
        "resolution": "Crash points geocoded to intersection/segment; published as H3 res-8 cells and neighbourhood totals",
        "feature_count": n, "raw_path": "data/sf/raw/injury_crashes_3y.json", "processed_path": [rel(path)],
        "script": SCRIPT, "refresh": "quarterly",
        "limitations": "Injury crashes only (no property-damage-only). Recent months are incomplete due to reporting lag. "
                       "Counts reflect traffic volume as much as danger.",
        "status": "processed",
    })
    return {"cells": n, "summary": summary}


# --- P1 rents (Zillow ZORI by ZIP) ------------------------------------------------------------

def step_rents() -> dict:
    zcta = gpd.read_file(raw("zcta_2020.geojson")).to_crs(METRIC_CRS)
    with raw("zillow_zori_zip.csv").open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        months = [c for c in reader.fieldnames if re.fullmatch(r"\d{4}-\d{2}-\d{2}", c)]
        rows = [r for r in reader if r["RegionName"] in set(zcta["ZCTA5"])]
    zips = {}
    for r in rows:
        series = {m[:7]: round(float(r[m])) for m in months if r[m]}
        if not series:
            continue
        keys = sorted(series)
        latest = keys[-1]
        prev = f"{int(latest[:4]) - 1}{latest[4:]}"
        zips[r["RegionName"]] = {"city": r["City"], "latest_month": latest, "latest": series[latest],
                                 "yoy_pct": round((series[latest] / series[prev] - 1) * 100, 1) if prev in series else None,
                                 "series": series}
    nh = load_nhoods().to_crs(METRIC_CRS)
    overlap = gpd.overlay(nh[["id", "geometry"]], zcta[["ZCTA5", "geometry"]], how="intersection")
    overlap["share"] = overlap.area / overlap["id"].map(dict(zip(nh["id"], nh.area)))
    summary = {}
    for nid, g in overlap.groupby("id"):
        g = g[g["share"] >= 0.1].sort_values("share", ascending=False)
        z = [{"zip": row.ZCTA5, "share": round(float(row.share), 2),
              "latest": zips.get(row.ZCTA5, {}).get("latest")} for row in g.itertuples()]
        with_data = [x for x in z if x["latest"] is not None]
        summary[nid] = {"zips": z, "typical_rent_zip_weighted": round(
            sum(x["latest"] * x["share"] for x in with_data) / sum(x["share"] for x in with_data)) if with_data else None}
    for nid in nh["id"]:
        summary.setdefault(nid, {"zips": [], "typical_rent_zip_weighted": None})
    meta = {"metric": "Zillow Observed Rent Index (ZORI), all homes (SFR+condo+multifamily), smoothed, USD/month",
            "measures": "ASKING rents of listed rentals (repeat-rent index), not rents paid by sitting tenants",
            "resolution": "ZIP code; a neighbourhood value is an area-weighted blend of overlapping ZIPs",
            "attribution": "Zillow Observed Rent Index (ZORI), Zillow Group", "generated": today()}
    path = write_summary("rents_zori_zip.json", {"meta": meta, "zips": zips})
    d = dl("zori_zip")
    update_manifest("rents_zori", {
        "source": "Zillow Research — ZORI (ZIP, all homes, smoothed, monthly); ZIP geography from Census 2020 ZCTAs",
        "source_url": "https://www.zillow.com/research/data/ ; TIGERweb ZCTA 2020",
        "licence": "Zillow Research data terms — free with attribution; REDISTRIBUTION OF DERIVED DATA UNRESOLVED, "
                   "review https://www.zillow.com/research/data/ terms before public deployment. ZCTA: public domain.",
        "downloaded_at": d.get("downloaded_at"),
        "measurement_period": f"{months[0][:7]} to {months[-1][:7]} monthly",
        "resolution": "ZIP code (ZCTA approximation); NOT neighbourhood-specific",
        "feature_count": len(zips), "raw_path": "data/sf/raw/zillow_zori_zip.csv, data/sf/raw/zcta_2020.geojson",
        "processed_path": [rel(path)], "script": SCRIPT, "refresh": "monthly",
        "limitations": "Asking rents for listed units, skewed toward units that turn over. ZIPs cross neighbourhood "
                       "boundaries; the neighbourhood figure is a blend and must be labelled as ZIP-level. "
                       "ZIPs with too few listings have no ZORI series.",
        "status": "processed",
    })
    return {"zips": len(zips), "summary": summary}


# --- P1 census tracts: ACS population/rent + CalEnviroScreen 5.0 pollution indicators ---------

ACS_SPECIAL = -100_000_000  # ACS annotation codes (-666666666 etc.) mean "not available"
# Pollution-burden indicators only (exposures + environmental effects). Population-characteristic,
# health and demographic fields — and the composite CES score that mixes them in — are NOT used.
CES_INDICATORS = {
    "pm": ("PM2.5", "annual mean µg/m³"), "diesel": ("Diesel PM", "emissions, tons/yr"),
    "ozone": ("Ozone", "summer max 8-h mean, ppm"), "traffic": ("Traffic", "traffic density near the tract"),
    "RSEIhaz": ("Toxic releases", "RSEI hazard-weighted"), "lead": ("Lead risk from housing", "score"),
}


def read_acs(path: Path, prefixes: tuple[str, ...]) -> dict[str, tuple[float | None, float | None]]:
    out = {}
    with path.open(encoding="utf-8") as f:
        next(f)
        for line in f:
            geo, est, moe = line.rstrip("\n").split("|")[:3]
            if geo.startswith(prefixes):
                e, m = float(est), float(moe)
                out[geo[-11:]] = (None if e < ACS_SPECIAL else e, None if m < ACS_SPECIAL else m)
    return out


def tract_weights(tracts: gpd.GeoDataFrame) -> pd.DataFrame:
    """Area-weighted tract -> neighbourhood shares, by each tract's land inside SF neighbourhoods."""
    nh = load_nhoods().to_crs(METRIC_CRS)
    t = tracts[tracts["GEOID"].str.startswith("06075")].to_crs(METRIC_CRS)[["GEOID", "geometry"]].copy()  # SF County only
    land = unary_union(nh.geometry.values)
    t["land_area"] = t.geometry.intersection(land).area
    t = t[t["land_area"] > 0]
    inter = gpd.overlay(t, nh[["id", "geometry"]], how="intersection")
    inter["w"] = inter.area / inter["land_area"]
    return inter[inter["w"] > 0.001][["GEOID", "id", "w"]]


def _num_or_none(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return None if (x < 0 or np.isnan(x)) else x


def step_tracts() -> dict:
    tracts = gpd.read_file(raw("census_tracts_2020.geojson"))
    prefixes = ("1400000US06075", "1400000US06081")
    pop = read_acs(raw("acs5y2024_b01003.dat"), prefixes)
    rent = read_acs(raw("acs5y2024_b25064.dat"), prefixes)
    with raw("calenviroscreen50_070126.csv").open(encoding="utf-8-sig") as f:
        ces = {r["tract"].zfill(11): r for r in csv.DictReader(f) if r["county"].strip() in ("San Francisco", "San Mateo")}
    tracts = tracts[tracts["GEOID"].str[:5].isin(["06075", "06081"])].copy()
    # Keep tracts centred in the study area; clip outlines of big rural Peninsula tracts to it (display only —
    # every value stays the whole tract's).
    w_, s_, e_, n_ = STUDY_BBOX
    box = shapely.box(w_, s_, e_, n_)
    tracts = tracts[tracts.geometry.representative_point().within(box)].copy()
    tracts["geometry"] = tracts.geometry.intersection(box)
    land_km2 = tracts["AREALAND"].astype(float) / 1e6
    tracts["population"] = [pop.get(g, (None, None))[0] for g in tracts["GEOID"]]
    tracts["population_moe"] = [pop.get(g, (None, None))[1] for g in tracts["GEOID"]]
    tracts["density_per_km2"] = [round(p / a) if p is not None and a > 0.01 else None
                                 for p, a in zip(tracts["population"], land_km2)]
    tracts["median_gross_rent"] = [rent.get(g, (None, None))[0] for g in tracts["GEOID"]]
    tracts["median_gross_rent_moe"] = [rent.get(g, (None, None))[1] for g in tracts["GEOID"]]
    for k in CES_INDICATORS:
        dp = 3 if k == "ozone" else 1
        tracts[f"ces_{k}"] = [None if (v := _num_or_none(ces.get(g, {}).get(k))) is None else round(v, dp) for g in tracts["GEOID"]]
        tracts[f"ces_{k}_pctl"] = [None if (v := _num_or_none(ces.get(g, {}).get(f"{k}P"))) is None else round(v, 1) for g in tracts["GEOID"]]
    tracts["ces_pollution_burden_pctl"] = [None if (v := _num_or_none(ces.get(g, {}).get("PollutionP"))) is None else round(v, 1)
                                           for g in tracts["GEOID"]]
    m = tracts.to_crs(METRIC_CRS)
    m["geometry"] = m.geometry.simplify(10, preserve_topology=True)
    keep = ["GEOID", "population", "population_moe", "density_per_km2", "median_gross_rent", "median_gross_rent_moe"] + \
           [c for c in tracts.columns if c.startswith("ces_")]
    out = gpd.GeoDataFrame(m[keep].rename(columns={"GEOID": "geoid"}), geometry=m.geometry, crs=METRIC_CRS)
    path, n = write_geojson(out, "census_tracts.geojson", meta={
        "acs": "ACS 2020-2024 5-year: B01003 total population, B25064 median gross rent (USD/month, rent PAID)",
        "ces": "CalEnviroScreen 5.0 (OEHHA, 2026-07-01). ces_<x> = indicator value, ces_<x>_pctl = statewide "
               "percentile (100 = most burdened). Only pollution-burden indicators are included; the composite "
               "CES score (which also weights population characteristics) is deliberately not used.",
        "indicators": {k: {"label": v[0], "unit": v[1]} for k, v in CES_INDICATORS.items()},
        "null": "not available (ACS suppression / no CES value, e.g. non-residential tracts)",
    })

    # Neighbourhood roll-up: population summed by land-area share; rent and percentiles population-weighted.
    w = tract_weights(tracts)
    props = out.drop(columns="geometry").set_index("geoid")
    summary = {}
    for nid in load_nhoods()["id"]:
        g = w[w["id"] == nid]
        rows = [(props.loc[t], wt) for t, wt in zip(g["GEOID"], g["w"]) if t in props.index]

        def wmean(col):
            pairs = [(r[col], wt * (r["population"] or 0)) for r, wt in rows if r[col] is not None and not pd.isna(r[col])]
            tot = sum(x for _, x in pairs)
            return round(sum(v * x for v, x in pairs) / tot, 1) if tot > 0 else None

        popsum = sum(r["population"] * wt for r, wt in rows if r["population"] is not None and not pd.isna(r["population"]))
        rent_w = wmean("median_gross_rent")
        summary[nid] = {
            "population": round(popsum) if rows else None, "tracts": len(rows),
            "median_gross_rent_popweighted": None if rent_w is None else round(rent_w),
            **{f"{k}_pctl": wmean(f"ces_{k}_pctl") for k in ("pm", "diesel", "traffic", "ozone")},
            "pollution_burden_pctl": wmean("ces_pollution_burden_pctl"),
        }
    pop_total = sum(v["population"] or 0 for v in summary.values())
    update_manifest("acs_tracts", {
        "source": "US Census Bureau — ACS 2020-2024 5-year table-based summary files (B01003, B25064); "
                  "2020 tract geometry from TIGERweb",
        "source_url": "https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/",
        "licence": "US public domain (Census Bureau)",
        "downloaded_at": dl("acs_b01003").get("downloaded_at"), "measurement_period": "2020-2024 (5-year estimates)",
        "resolution": "Census tract (2020 boundaries); neighbourhood totals by land-area apportionment",
        "feature_count": n,
        "raw_path": "data/sf/raw/acs5y2024_b01003.dat, acs5y2024_b25064.dat, census_tracts_2020.geojson",
        "processed_path": [rel(path)], "script": SCRIPT, "refresh": "yearly (December ACS release)",
        "limitations": f"Estimates with margins of error (kept as *_moe). Neighbourhood population (SF total {pop_total:,}) "
                       "assumes residents are spread evenly across each tract's land. Median gross rent is rent PAID "
                       "by current tenants (incl. long-standing rent-controlled leases), not asking rent. The Census API "
                       "needs a key; these official bulk files do not.",
        "status": "processed",
    })
    update_manifest("calenviroscreen5", {
        "source": "OEHHA CalEnviroScreen 5.0 (final), California Open Data Portal",
        "source_url": "https://data.ca.gov/dataset/calenviroscreen-5-0",
        "licence": "Unresolved on the portal ('License not specified'); California public agency data — attribute OEHHA",
        "downloaded_at": dl("calenviroscreen5").get("downloaded_at"),
        "measurement_period": "Indicator-specific (mostly 2019-2024); release dated 2026-07-01",
        "resolution": "Census tract (2020 boundaries; outlines clipped to the study area, values whole-tract)",
        "feature_count": n,
        "raw_path": "data/sf/raw/calenviroscreen50_070126.csv, calenviroscreen50_data_dictionary.pdf",
        "processed_path": [rel(path)], "script": SCRIPT, "refresh": "on OEHHA release",
        "limitations": "Only pollution-burden indicators (PM2.5, diesel PM, ozone, traffic, toxic releases, housing lead "
                       "risk, pollution burden percentile) are used. Percentiles are statewide, so SF sits in a narrow "
                       "band for some (ozone). Neighbourhood values are population-weighted tract means. Never combined "
                       "with population vulnerability into a single score.",
        "status": "processed",
    })
    return {"tracts": n, "summary": summary}


# --- P1 food & drink POIs ---------------------------------------------------------------------

POI_FILES = {"cafes": ("cafe", "coffee_shop"), "restaurants": ("restaurant",), "bars": ("bar", "pub")}


def step_pois() -> dict:
    els = json.loads(raw("osm_food_drink.json").read_text(encoding="utf-8")).get("elements", [])
    rows = []
    for e in els:
        t = e.get("tags", {})
        lat = e.get("lat") or e.get("center", {}).get("lat")
        lon = e.get("lon") or e.get("center", {}).get("lon")
        if lat is None or not t.get("name"):
            continue
        kind = "coffee_shop" if t.get("shop") == "coffee" else t.get("amenity")
        rows.append({"name": t["name"], "kind": kind,
                     "cuisine": (t.get("cuisine") or "").split(";")[0].replace("_", " ") or None,
                     "osm_id": f"{e['type']}/{e['id']}", "geometry": Point(lon, lat)})
    gdf = gpd.GeoDataFrame(rows, crs=4326).drop_duplicates("osm_id")
    nh = load_nhoods()
    joined = gpd.sjoin(gdf, nh[["id", "geometry"]], predicate="within", how="left")
    paths, counts = [], {}
    for name, kinds in POI_FILES.items():
        sub = gdf[gdf["kind"].isin(kinds)]
        cols = ["name", "kind"] + (["cuisine"] if name == "restaurants" else []) + ["geometry"]
        path, n = write_geojson(gpd.GeoDataFrame(sub[cols], crs=4326), f"{name}.geojson")
        paths.append(rel(path))
        counts[name] = n
    area = dict(zip(nh["id"], nh["area_km2"]))
    summary = {}
    for nid in nh["id"]:
        g = joined[joined["id"] == nid]
        c = {name: int(g["kind"].isin(kinds).sum()) for name, kinds in POI_FILES.items()}
        summary[nid] = {**c, "per_km2": round(sum(c.values()) / area[nid], 1)}
    update_manifest("food_drink_pois", {
        "source": "OpenStreetMap contributors via Overpass API (amenity=cafe|restaurant|bar|pub, shop=coffee)",
        "source_url": "https://overpass-api.de/api/interpreter", "licence": "ODbL 1.0 — '© OpenStreetMap contributors'",
        "downloaded_at": dl("osm_food_drink").get("downloaded_at"), "measurement_period": "OSM snapshot at download date",
        "resolution": "Point (way/relation centroids)", "feature_count": sum(counts.values()),
        "raw_path": "data/sf/raw/osm_food_drink.json", "processed_path": paths, "script": SCRIPT, "refresh": "6 months",
        "limitations": "San Francisco only. Unnamed places dropped. Volunteer-mapped: openings/closures lag. "
                       + ", ".join(f"{k} {v}" for k, v in counts.items())
                       + ". Discovery context only — never a ranking input.",
        "status": "processed",
    })
    return {**counts, "summary": summary}


# --- neighbourhood metrics (merge) ------------------------------------------------------------

def pick(d: dict | None, keys: tuple[str, ...]) -> dict | None:
    return {k: d[k] for k in keys} if d else None


def step_metrics(results: dict[str, dict]) -> dict:
    """Merge step summaries into one file. Missing inputs stay explicit nulls."""
    nh = load_nhoods()

    def from_file(name: str, key: str = "neighbourhoods") -> dict:
        p = PROCESSED_DIR / name
        return json.loads(p.read_text(encoding="utf-8"))[key] if p.exists() else {}

    crime = from_file("crime_by_neighbourhood.json")
    # Steps other than crime keep their summaries in a sidecar so --only reruns still merge.
    sidecar = PROCESSED_DIR / "_metrics_parts.json"
    parts = json.loads(sidecar.read_text(encoding="utf-8")) if sidecar.exists() else {}
    for k in ("cycling", "parks", "transit", "hills", "groceries", "collisions", "rents", "tracts", "pois"):
        if k in results and "summary" in results[k]:
            parts[k] = results[k]["summary"]
    sidecar.write_text(json.dumps(parts), encoding="utf-8")

    out = {}
    for _, r in nh.iterrows():
        nid = r["id"]
        c = crime.get(nid)
        out[nid] = {
            "name": r["name"], "area_km2": r["area_km2"],
            "crime": {k: c[k] for k in ("total", "per_km2", "violent", "property", "vehicle_breakin",
                                        "violent_per_km2", "property_per_km2", "per_km2_pctile",
                                        "top_categories")} if c else None,
            **{k: parts.get(k, {}).get(nid) for k in ("parks", "cycling", "transit", "hills", "groceries",
                                                      "collisions", "rents")},
            "population": pick(parts.get("tracts", {}).get(nid), ("population", "median_gross_rent_popweighted")),
            "environment": pick(parts.get("tracts", {}).get(nid), ("pm_pctl", "diesel_pctl", "traffic_pctl",
                                                                   "ozone_pctl", "pollution_burden_pctl")),
            "food_drink": parts.get("pois", {}).get(nid),
        }
        # Per-resident rate only where enough people live for it to mean anything.
        pop = (out[nid]["population"] or {}).get("population")
        if out[nid]["crime"] is not None:
            out[nid]["crime"]["per_1000_residents"] = round(c["total"] / pop * 1000, 1) if pop and pop >= 1000 else None
    meta = {
        "generated": today(),
        "missing_data_rule": "null means not measured — never treat it as passing or failing a preference",
        "definitions": {
            "crime.per_km2": "reported incidents (12 months) per km² of land; see crime_by_neighbourhood.json meta",
            "parks.share_within_400m": "share of H3 res-9 sample points within 400 m straight line of a park >= 0.5 acre",
            "parks.park_land_share": "share of the neighbourhood's land that is park",
            "transit.share_within_800m_rail": "share of sample points within 800 m of a BART/Caltrain/Muni Metro stop",
            "transit.share_within_400m_frequent": "share within 400 m of a stop with >= 120 weekday departures",
            "cycling.dedicated_km_per_km2": "protected + path + painted lane km per km² (each direction counted)",
            "hills.median_slope_pct": "length-weighted median 40 m DEM-derived street grade (percent); not surveyed",
            "groceries.share_within_800m_supermarket": "share of sample points within 800 m of an OSM supermarket",
            "collisions.per_km2_per_year": "injury crashes per km² per year (3-year window)",
            "rents.typical_rent_zip_weighted": "Zillow ZORI asking rent, area-weighted over overlapping ZIPs (ZIP-level!)",
            "crime.per_1000_residents": "reported incidents per 1,000 ACS residents; null if < 1,000 residents. Visitor/commuter-heavy areas read high",
            "population.population": "ACS 2020-2024 residents, tract populations apportioned by land area",
            "population.median_gross_rent_popweighted": "ACS median gross rent (rent PAID), population-weighted tract mean",
            "environment.*_pctl": "CalEnviroScreen 5.0 statewide percentile (100 = most burdened), population-weighted tract mean",
            "food_drink": "OSM cafes/restaurants/bars inside the neighbourhood - context only, not ranked",
        },
    }
    path = write_summary("neighbourhood_metrics.json", {"meta": meta, "neighbourhoods": out})
    coverage = {k: sum(1 for v in out.values() if v.get(k)) for k in ("crime", "parks", "cycling", "transit", "hills",
                                                                        "groceries", "collisions", "rents",
                                                                        "population", "environment", "food_drink")}
    update_manifest("neighbourhood_metrics", {
        "source": "Derived — merge of the processed datasets above", "source_url": "n/a (derived)",
        "licence": "Inherits the most restrictive input (Zillow terms for the rents block)",
        "downloaded_at": today(), "measurement_period": "Per input dataset",
        "resolution": "Neighbourhood (41), computed from finer inputs",
        "feature_count": len(out), "raw_path": "n/a", "processed_path": [rel(path)], "script": SCRIPT,
        "refresh": "after any input rebuild",
        "limitations": "Coverage (neighbourhoods with data): " + ", ".join(f"{k} {v}/41" for k, v in coverage.items()),
        "status": "processed",
    })
    return {"neighbourhoods": len(out), "coverage": coverage}


STEPS: dict[str, Callable[[], dict]] = {
    "neighbourhoods": step_neighbourhoods,
    "crime": step_crime,
    "cycling": step_cycling,
    "parks": step_parks,
    "transit": step_transit,
    "hills": step_hills,
    "groceries": step_groceries,
    "collisions": step_collisions,
    "rents": step_rents,
    "tracts": step_tracts,
    "pois": step_pois,
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", nargs="+", choices=list(STEPS) + ["metrics"])
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args(argv)
    if args.list:
        print("\n".join(list(STEPS) + ["metrics (always runs last)"]))
        return 0
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    selected = [s for s in STEPS if not args.only or s in args.only]
    results, status = {}, {}
    for name in selected:
        log.info("=== %s ===", name)
        try:
            results[name] = STEPS[name]()
            status[name] = "ok"
        except MissingInput as exc:
            log.warning("%s skipped: %s", name, exc)
            status[name] = f"skipped ({exc})"
        except Exception as exc:  # one failure must not stop the others
            traceback.print_exc()
            status[name] = f"FAILED ({type(exc).__name__}: {exc})"
    try:
        results["metrics"] = step_metrics(results)
        status["metrics"] = "ok"
    except Exception as exc:
        traceback.print_exc()
        status["metrics"] = f"FAILED ({exc})"
    print("\nSummary:")
    for k, v in status.items():
        extra = {kk: vv for kk, vv in results.get(k, {}).items() if kk != "summary"}
        print(f"  {k:15s} {v} {extra if extra else ''}")
    return 1 if any(v.startswith("FAILED") for v in status.values()) else 0


if __name__ == "__main__":
    sys.exit(main())
