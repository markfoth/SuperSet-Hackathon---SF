#!/usr/bin/env python
"""Build offline commute-area fixtures for the default workplaces (SFO, Financial District).

These let the frontend work with no routing credentials. Every polygon is
labelled with its method; none of them is a live routing result.

  transit  APPROXIMATE — a schedule model built from BART + Muni + Caltrain
           GTFS: weekday AM-peak (07:00–10:00) in-vehicle times, a boarding
           wait of half the route's headway (capped at 10 min), walking
           transfers between stops ≤ 400 m, and walking access/egress. It is
           solved *backwards from the workplace*, i.e. travel from each home
           cell TO work (inbound, arrive-by in spirit). No SamTrans (needs a
           511 key), no timetable-exact connections, no fares.
  walk     SYNTHETIC — straight-line distance × 1.3 detour at 4.8 km/h.
  bike     SYNTHETIC — straight-line distance × 1.3 detour at 14 km/h; ignores hills.
  drive    SYNTHETIC — straight-line distance × 1.4 detour at 32 km/h + 5 min
           parking. Traffic and freeways ignored; do not trust for SFO.

Output: data/sf/processed/commute_fixtures.geojson, one MultiPolygon per
(workplace, mode, minutes) for minutes in MINUTES. Replace with a live provider
via the frontend's CommuteProvider adapter (src/features/commute/).
"""
from __future__ import annotations

import heapq
import json
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

import geopandas as gpd
import h3
import numpy as np
import pandas as pd
import shapely
from shapely.geometry import Point
from shapely.ops import unary_union

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import (  # noqa: E402
    DEFAULT_WORKPLACES, METRIC_CRS, PROCESSED_DIR, RAW_DIR, STUDY_BBOX, TARGET_SERVICE_DATE, get_logger, rel, today,
    update_manifest,
)
from process_datasets import available_feeds, gtfs_table, route_mode, service_date, write_geojson  # noqa: E402

log = get_logger("commute")
MINUTES = (15, 30, 45, 60)
CELL_RES = 9
WALK_M_PER_MIN = 80.0          # 4.8 km/h
WALK_DETOUR = 1.25
MAX_ACCESS_M = 1000            # walk to/from a stop
MAX_TRANSFER_M = 400
MAX_WAIT_MIN = 10.0
PEAK = (7 * 60, 10 * 60)
# SFO's terminals are ~1.3 km from SFO BART; AirTrain links them. Assumed station→terminal time:
AIRTRAIN = {"sfo": ("bart:SFIA", 10.0)}
SYNTHETIC = {
    "walk": {"speed_m_min": 80.0, "detour": 1.3, "fixed": 0.0},
    "bike": {"speed_m_min": 233.0, "detour": 1.3, "fixed": 0.0},
    "drive": {"speed_m_min": 533.0, "detour": 1.4, "fixed": 5.0},
}


def to_min(t: str) -> float | None:
    try:
        h, m, s = (int(x) for x in t.split(":"))
        return h * 60 + m + s / 60
    except ValueError:
        return None


def land_mask():
    """SF neighbourhoods ∪ Census ZCTAs in the study box — a cheap land polygon for the Peninsula."""
    parts = [gpd.read_file(PROCESSED_DIR / "neighbourhoods.geojson").to_crs(METRIC_CRS).union_all()]
    z = RAW_DIR / "zcta_2020.geojson"
    if z.exists():
        parts.append(gpd.read_file(z).to_crs(METRIC_CRS).union_all())
    w, s, e, n = STUDY_BBOX
    box = gpd.GeoSeries([shapely.box(w, s, e, n)], crs=4326).to_crs(METRIC_CRS).iloc[0]
    return unary_union(parts).intersection(box)


def origin_cells(mask) -> gpd.GeoDataFrame:
    mask_ll = gpd.GeoSeries([mask], crs=METRIC_CRS).to_crs(4326).iloc[0]
    cells = set()
    for poly in getattr(mask_ll, "geoms", [mask_ll]):
        try:
            cells |= set(h3.geo_to_cells(poly.buffer(0).__geo_interface__, CELL_RES))
        except Exception:  # tiny/degenerate islands
            continue
    cells = sorted(cells)
    pts = [Point(lng, lat) for lat, lng in (h3.cell_to_latlng(c) for c in cells)]
    return gpd.GeoDataFrame({"h3": cells}, geometry=pts, crs=4326).to_crs(METRIC_CRS)


EXPIRED_FEEDS: list[str] = []  # agencies whose timetable doesn't cover TARGET_SERVICE_DATE


def build_graph():
    """Route-stop graph. Returns (stops gdf, adjacency for the REVERSED graph)."""
    stop_rows = []
    # reversed adjacency: node -> list[(prev_node, cost)] meaning prev_node --cost--> node in forward time
    radj: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for key, feed in available_feeds().items():
        z = zipfile.ZipFile(RAW_DIR / feed["file"])
        routes, trips, stops = gtfs_table(z, "routes.txt"), gtfs_table(z, "trips.txt"), gtfs_table(z, "stops.txt")
        routes["mode"] = [route_mode(feed["agency"], t) for t in routes["route_type"]]
        routes = routes[routes["mode"].notna()]
        day, active, covers = service_date(z)
        if not covers:
            EXPIRED_FEEDS.append(f"{feed['agency']} ({day[:7]} timetable)")
        trips = trips[trips["route_id"].isin(routes["route_id"]) & trips["service_id"].isin(active)]
        if "direction_id" not in trips:
            trips["direction_id"] = "0"
        st = pd.read_csv(z.open("stop_times.txt"), dtype=str, encoding="utf-8-sig", keep_default_na=False,
                         usecols=["trip_id", "stop_id", "stop_sequence", "arrival_time", "departure_time"])
        st = st[st["trip_id"].isin(trips["trip_id"])].copy()
        st["seq"] = st["stop_sequence"].astype(int)
        st["arr"] = st["arrival_time"].map(to_min)
        st["dep"] = st["departure_time"].map(to_min)
        st = st.dropna(subset=["arr", "dep"])
        if "parent_station" not in stops:
            stops["parent_station"] = ""
        parent = dict(zip(stops["stop_id"], stops["parent_station"]))
        st["node"] = [f"{key}:{parent.get(s) or s}" for s in st["stop_id"]]
        st = st.merge(trips[["trip_id", "route_id", "direction_id"]], on="trip_id").sort_values(["trip_id", "seq"])
        st["pattern"] = key + ":" + st["route_id"] + ":" + st["direction_id"]

        # Peak trips only, for both ride times and headways.
        first_dep = st.groupby("trip_id")["dep"].min()
        peak_trips = first_dep[(first_dep >= PEAK[0] - 60) & (first_dep < PEAK[1])].index
        pk = st[st["trip_id"].isin(peak_trips)]
        nxt = pk.groupby("trip_id").shift(-1)
        hops = pd.DataFrame({"pattern": pk["pattern"], "a": pk["node"], "b": nxt["node"],
                             "t": nxt["arr"] - pk["dep"], "dep": pk["dep"]}).dropna()
        hops = hops[(hops["t"] >= 0) & (hops["a"] != hops["b"])]
        ride = hops.groupby(["pattern", "a", "b"])["t"].median()
        in_window = pk[(pk["dep"] >= PEAK[0]) & (pk["dep"] < PEAK[1])]
        freq = in_window.groupby(["pattern", "node"]).size()
        for (pattern, a, b), t in ride.items():
            radj[f"{pattern}@{b}"].append((f"{pattern}@{a}", float(t)))      # ride a->b
        for (pattern, node), n_dep in freq.items():
            headway = (PEAK[1] - PEAK[0]) / n_dep
            radj[f"{pattern}@{node}"].append((node, min(headway / 2, MAX_WAIT_MIN)))  # board
            radj[node].append((f"{pattern}@{node}", 0.0))                              # alight
        # Patterns seen at a node but with no peak departures can still be alighted from.
        for pattern, node in set(zip(pk["pattern"], pk["node"])) - set(freq.index):
            radj[node].append((f"{pattern}@{node}", 0.0))
        used = set(st["node"])
        for _, r in stops.iterrows():
            node = f"{key}:{r['stop_id']}"
            if node in used:
                stop_rows.append({"node": node, "name": r["stop_name"],
                                  "geometry": Point(float(r["stop_lon"]), float(r["stop_lat"]))})
        log.info("%s: %d peak trips, %d ride hops", key, len(peak_trips), len(ride))
    stops_gdf = gpd.GeoDataFrame(stop_rows, crs=4326).to_crs(METRIC_CRS).drop_duplicates("node")
    # Walking transfers between nearby stops (both directions).
    tree = shapely.STRtree(stops_gdf.geometry.values)
    i, j = tree.query(stops_gdf.geometry.values, predicate="dwithin", distance=MAX_TRANSFER_M)
    nodes = stops_gdf["node"].values
    geoms = stops_gdf.geometry.values
    for a, b in zip(i, j):
        if a != b:
            d = geoms[a].distance(geoms[b])
            radj[nodes[b]].append((nodes[a], d * WALK_DETOUR / WALK_M_PER_MIN + 1.0))  # +1 min to change
    return stops_gdf, radj


def time_to_workplace(wp_key: str, wp: dict, stops_gdf, radj) -> dict[str, float]:
    """Dijkstra on the reversed graph: minutes from each stop node to the workplace."""
    wpt = gpd.GeoSeries([Point(wp["lon"], wp["lat"])], crs=4326).to_crs(METRIC_CRS).iloc[0]
    dist: dict[str, float] = {}
    heap: list[tuple[float, str]] = []
    near = stops_gdf[stops_gdf.distance(wpt) <= MAX_ACCESS_M]
    for node, g in zip(near["node"], near.geometry):
        heapq.heappush(heap, (g.distance(wpt) * WALK_DETOUR / WALK_M_PER_MIN, node))
    if wp_key in AIRTRAIN:
        node, t = AIRTRAIN[wp_key]
        heapq.heappush(heap, (t, node))
    while heap:
        d, node = heapq.heappop(heap)
        if node in dist:
            continue
        dist[node] = d
        for prev, cost in radj.get(node, ()):
            if prev not in dist:
                heapq.heappush(heap, (d + cost, prev))
    return {k: v for k, v in dist.items() if "@" not in k}


def cell_times_transit(cells, stops_gdf, stop_time: dict[str, float], wpt) -> np.ndarray:
    direct = cells.distance(wpt).values * WALK_DETOUR / WALK_M_PER_MIN
    best = direct.copy()
    tree = shapely.STRtree(stops_gdf.geometry.values)
    ci, si = tree.query(cells.geometry.values, predicate="dwithin", distance=MAX_ACCESS_M)
    nodes = stops_gdf["node"].values
    sgeom, cgeom = stops_gdf.geometry.values, cells.geometry.values
    for c, s in zip(ci, si):
        t = stop_time.get(nodes[s])
        if t is None:
            continue
        total = cgeom[c].distance(sgeom[s]) * WALK_DETOUR / WALK_M_PER_MIN + t
        if total < best[c]:
            best[c] = total
    return best


def polygons(cells, times: np.ndarray, mask) -> dict[int, object]:
    out = {}
    hexes = gpd.GeoSeries([shapely.Polygon([(lng, lat) for lat, lng in h3.cell_to_boundary(c)]) for c in cells["h3"]],
                          crs=4326).to_crs(METRIC_CRS)
    for m in MINUTES:
        sel = hexes[times <= m]
        if sel.empty:
            continue
        geom = unary_union(sel.values).intersection(mask).buffer(30).buffer(-30).simplify(20)
        out[m] = geom
    return out


def transit_label() -> str:
    base = "Approximate (GTFS schedule model, AM peak, inbound)"
    return f"{base}; out-of-date timetable: {', '.join(EXPIRED_FEEDS)}" if EXPIRED_FEEDS else base


def main() -> int:
    mask = land_mask()
    cells = origin_cells(mask)
    log.info("%d origin cells (H3 res-%d) over the study area", len(cells), CELL_RES)
    stops_gdf, radj = build_graph()
    rows = []
    for wp_key, wp in DEFAULT_WORKPLACES.items():
        wpt = gpd.GeoSeries([Point(wp["lon"], wp["lat"])], crs=4326).to_crs(METRIC_CRS).iloc[0]
        stop_time = time_to_workplace(wp_key, wp, stops_gdf, radj)
        transit = cell_times_transit(cells, stops_gdf, stop_time, wpt)
        modes = {"transit": transit}
        crow = cells.distance(wpt).values
        for mode, p in SYNTHETIC.items():
            modes[mode] = crow * p["detour"] / p["speed_m_min"] + p["fixed"]
        for mode, times in modes.items():
            for minutes, geom in polygons(cells, times, mask).items():
                rows.append({
                    "workplace": wp_key, "mode": mode, "minutes": minutes,
                    "method": "gtfs-schedule-model" if mode == "transit" else "synthetic-speed-model",
                    "label": (transit_label() if mode == "transit"
                              else "Synthetic (straight-line speed model) — not a real route"),
                    "synthetic": mode != "transit", "geometry": geom,
                })
            log.info("%s %-7s: cells within 30/60 min = %d / %d", wp_key, mode,
                     int((times <= 30).sum()), int((times <= 60).sum()))
    gdf = gpd.GeoDataFrame(rows, crs=METRIC_CRS)
    path, n = write_geojson(gdf, "commute_fixtures.geojson", meta={
        "generated": today(), "minutes": list(MINUTES), "workplaces": DEFAULT_WORKPLACES,
        "direction": "home -> workplace (inbound)", "target_service_date": TARGET_SERVICE_DATE,
        "expired_feeds": EXPIRED_FEEDS, "warning": "Fixtures, not live routing. See method/label per feature.",
    })
    update_manifest("commute_fixtures", {
        "source": "Derived — Common Ground commute fixtures (GTFS schedule model + synthetic speed models)",
        "source_url": "n/a (derived from gtfs_bart, gtfs_muni, gtfs_caltrain)",
        "licence": "Inherits GTFS terms (SFMTA notice required)", "downloaded_at": today(),
        "measurement_period": "Representative weekday AM peak 07:00-10:00 per feed",
        "resolution": f"H3 res-{CELL_RES} origin cells (~174 m) dissolved to polygons, simplified 20 m",
        "feature_count": n, "raw_path": "data/sf/raw/gtfs_*.zip", "processed_path": [rel(path)],
        "script": "scripts/build_commute_fixtures.py", "refresh": "after GTFS refresh",
        "limitations": (f"Timetables not covering {TARGET_SERVICE_DATE}: {', '.join(EXPIRED_FEEDS)} — labelled in the UI. "
                        if EXPIRED_FEEDS else "") +
                       "Transit: approximate, not timetable-exact; waits = half headway (cap 10 min); "
                       "SamTrans absent; SFO uses an assumed 10 min AirTrain link from SFO BART. Walk/bike/drive "
                       "are SYNTHETIC straight-line models and must be labelled as such in the UI.",
        "status": "processed",
    })
    return 0


if __name__ == "__main__":
    sys.exit(main())
