"""DEM-derived street gradients. No terrain-slope proxy enters matching.

Lengths, sampling and weighting use EPSG:26943 metres. A rolling 40 m
elevation difference suppresses individual 10 m raster-pixel steps. Grades
are assigned to 10 m street pieces, then clipped/length-weighted per H3 cell.
"""
from __future__ import annotations

import json
import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import LineString
from shapely.ops import substring

from _common import METRIC_CRS, PROCESSED_DIR, rel, today, update_manifest
from process_datasets import dem_sampler, dl, raw, write_geojson, write_summary

STREET_LAYERS = {"STREETS", "STREETS_TI", "STREETS_YBI", "STREETS_HUNTERSP", "PRIVATE"}
MIN_CELL_STREET_M = 100
MIN_COVERAGE = 0.75
STEEP_PCT = 10


def usable_streets() -> gpd.GeoDataFrame:
    roads = gpd.read_file(raw("streets_active.geojson")).explode(index_parts=False).reset_index(drop=True)
    classes = roads["classcode"].astype(str).isin(["2", "3", "4", "5"])
    addressed = roads[["lf_fadd", "rt_fadd", "lf_toadd", "rt_toadd"]].apply(
        lambda s: pd.to_numeric(s, errors="coerce")).max(axis=1).fillna(0) > 0
    roads = roads[roads["active"].eq(True) & roads["layer"].isin(STREET_LAYERS)
                  & (classes | (roads["layer"].eq("PRIVATE") & addressed))
                  & roads.geometry.geom_type.eq("LineString")].copy()
    roads["residential_evidence"] = addressed.loc[roads.index] & roads["classcode"].astype(str).eq("5")
    return roads.to_crs(METRIC_CRS)


def weighted_quantile(values, weights, q):
    values, weights = np.asarray(values, dtype=float), np.asarray(weights, dtype=float)
    ok = np.isfinite(values) & np.isfinite(weights) & (weights > 0)
    if not ok.any():
        return None
    v, w = values[ok], weights[ok]
    order = np.argsort(v, kind="stable")
    v, w = v[order], w[order]
    return round(float(v[np.searchsorted(np.cumsum(w), q * w.sum(), side="left")]), 1)


def road_windows(line: LineString, sample) -> list[dict]:
    """40 m rolling differences on the ORIGINAL road, before splitting at cells.

    Segments <40 m have no defensible window and retain missing measurements.
    Every micro-piece carries its actual length; overlapping rolling windows do
    not double-count road length. End windows shift inward rather than shortening.
    """
    length = line.length
    if length < 40:
        return [{"geometry": line, "grade_pct": None}]
    edges = np.linspace(0, length, int(np.ceil(length / 10)) + 1)
    mids = (edges[:-1] + edges[1:]) / 2
    starts = np.clip(mids - 20, 0, length - 40)
    ends = starts + 40
    points = [line.interpolate(float(d)) for d in np.concatenate([starts, ends])]
    z = sample(np.array([p.x for p in points]), np.array([p.y for p in points]))
    grades = np.abs(z[len(starts):] - z[:len(starts)]) / 40 * 100
    return [{"geometry": substring(line, float(a), float(b)),
             "grade_pct": float(g) if np.isfinite(g) else None}
            for a, b, g in zip(edges[:-1], edges[1:], grades)]


def build_street_gradients() -> dict:
    from build_area_cells import canonical_grid
    dem = dem_sampler()
    if dem is None:
        raise FileNotFoundError("USGS elevation raster missing")
    roads = usable_streets()
    pieces, summaries = [], []
    for _, road in roads.iterrows():
        windows = road_windows(road.geometry, dem[0])
        values = [w["grade_pct"] for w in windows]
        lengths = [w["geometry"].length for w in windows]
        good_length = sum(l for v, l in zip(values, lengths) if v is not None)
        coverage = good_length / road.geometry.length if road.geometry.length else 0
        summaries.append({"cnn": str(road["cnn"]), "street": road["streetname"],
                          "grade_pct": weighted_quantile(values, lengths, 0.5) if coverage >= MIN_COVERAGE else None,
                          "geometry": road.geometry.simplify(2)})
        pieces.extend(windows)
    segment_path, segment_count = write_geojson(gpd.GeoDataFrame(summaries, crs=METRIC_CRS), "street_gradients.geojson", meta={
        "method": "USGS DEM-derived, not surveyed; absolute grade over rolling 40 m windows, sampled every ~10 m",
        "filter": "active street layers, road classes 2-5; addressed private streets; no freeway, ramp, park/paper/stair layer",
        "coverage": "fraction of street length with valid elevation at both ends of a rolling window; null grade if <75% or <40 m",
    })
    grid = canonical_grid()
    micro = gpd.GeoDataFrame(pieces, crs=METRIC_CRS)
    inter = gpd.overlay(micro, grid[["h3", "nhood_id", "geometry"]], how="intersection", keep_geom_type=True)
    inter["length_m"] = inter.length
    groups = {c: g for c, g in inter.groupby("h3")}
    cellrows = []
    for _, cell in grid.iterrows():
        g = groups.get(cell["h3"])
        total = float(g["length_m"].sum()) if g is not None else 0
        valid = g[g["grade_pct"].notna()] if g is not None else None
        measured = float(valid["length_m"].sum()) if valid is not None else 0
        coverage = measured / total if total else None
        enough = measured >= MIN_CELL_STREET_M and coverage is not None and coverage >= MIN_COVERAGE
        cellrows.append({"h3": cell["h3"], "nhood_id": cell["nhood_id"],
                         "street_m": round(total), "measured_street_m": round(measured),
                         "grade_coverage": round(coverage, 3) if coverage is not None else None,
                         "street_grade_pct": weighted_quantile(valid["grade_pct"], valid["length_m"], 0.5) if enough else None,
                         "street_grade_p90_pct": weighted_quantile(valid["grade_pct"], valid["length_m"], 0.9) if enough else None,
                         "steep_street_share": round(float(valid.loc[valid["grade_pct"] > STEEP_PCT, "length_m"].sum()) / measured, 3) if enough else None,
                         "geometry": cell.geometry})
    cells = gpd.GeoDataFrame(cellrows, crs=METRIC_CRS)
    cell_path, count = write_geojson(cells, "hills_grid.geojson", meta={
        "h3_resolution": 9, "method": "Length-weighted street-aligned 40 m DEM gradients; not surveyed road grades",
        "steep_threshold_pct": STEEP_PCT, "minimum_measured_street_m": MIN_CELL_STREET_M,
        "minimum_coverage": MIN_COVERAGE, "raster_pixel_m": round(dem[3], 3),
        "source_resolution": "USGS bare-earth elevation resampled to ~10 m; official street centrelines",
    })
    neighbourhoods = {}
    validation = {}
    for nid, g in inter.groupby("nhood_id"):
        valid = g[g["grade_pct"].notna()]
        lengths = valid["length_m"]
        grades = valid["grade_pct"]
        neighbourhoods[nid] = {"median_slope_pct": weighted_quantile(grades, lengths, 0.5),
                              "share_steep": round(float(lengths[grades > STEEP_PCT].sum() / lengths.sum()), 3) if lengths.sum() else None,
                              "elev_min_m": None, "elev_max_m": None, "method": "street_aligned_dem"}
        if nid in {"mission", "sunset-parkside", "nob-hill", "russian-hill", "potrero-hill", "bernal-heights"}:
            local = cells[cells["nhood_id"] == nid]["street_grade_pct"].dropna()
            validation[nid] = {"street_length_m": round(float(lengths.sum())),
                               "median_grade_pct": weighted_quantile(grades, lengths, 0.5),
                               "p90_grade_pct": weighted_quantile(grades, lengths, 0.9),
                               "cell_min_pct": float(local.min()) if len(local) else None,
                               "cell_max_pct": float(local.max()) if len(local) else None}
    write_summary("street_gradient_validation.json", {"method": "Unmodified computed values; geographical contrasts are validation, not calibration", "areas": validation})
    entry = {
        "source": "USGS 3DEP bare-earth DEM + SF DPW Streets – Active and Retired (DataSF 3psu-pn9h)",
        "source_url": "https://data.sf.gov/d/3psu-pn9h; https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer",
        "licence": "USGS US public domain; DataSF ODC PDDL", "downloaded_at": dl("streets_active").get("downloaded_at") or today(),
        "measurement_period": "Street snapshot at download; DEM composite of lidar acquisitions",
        "resolution": "Street centrelines sampled every ~10 m; 40 m rolling windows; length-weighted H3-9 aggregates",
        "raw_path": "data/sf/raw/streets_active.geojson; data/sf/raw/elevation_3dep_10m.tif",
        "script": "scripts/street_gradients.py via process_datasets.py --only hills", "refresh": "after street or DEM refresh",
        "limitations": "DEM-derived street-gradient estimates, not surveyed. Bare-earth DEM cannot resolve bridge decks, tunnels, "
                        "retaining walls or stairs. No windows on roads <40 m. Null cell grade below 100 m valid street length or 75% coverage. "
                        "Median may hide a steep street: p90 and steep-length share are retained. No neighbourhood terrain mean used.",
        "status": "processed",
    }
    update_manifest("street_gradients", {**entry, "feature_count": segment_count, "processed_path": [rel(segment_path), "data/sf/processed/street_gradient_validation.json"]})
    update_manifest("elevation", {**entry, "feature_count": count, "processed_path": [rel(cell_path), "data/sf/processed/cycling_network.geojson (grade_pct)"]})
    return {"cells": count, "streets": segment_count, "summary": neighbourhoods}
