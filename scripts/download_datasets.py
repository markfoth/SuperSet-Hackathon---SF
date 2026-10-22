#!/usr/bin/env python
"""Download raw source data into data/sf/raw/.

Idempotent: a dataset whose raw file already exists and passes its check is
skipped unless --refresh is given. Each download is validated (non-empty,
expected minimum feature count, parseable) before it replaces anything, and
recorded in data/sf/raw/_downloads.json (url, date, bytes, sha256). One failed
source never stops the others; the exit code is non-zero only if a P0 source
failed.

Usage:
    .venv/Scripts/python.exe scripts/download_datasets.py               # everything missing
    .venv/Scripts/python.exe scripts/download_datasets.py --only police_incidents gtfs_bart
    .venv/Scripts/python.exe scripts/download_datasets.py --refresh     # re-download everything
    .venv/Scripts/python.exe scripts/download_datasets.py --list
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Callable

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import (  # noqa: E402
    METRIC_CRS, RAW_DIR, SF_BBOX, STUDY_BBOX, TARGET_SERVICE_DATE, USER_AGENT, env, get_logger, read_download_log,
    sha256, today, update_manifest, write_download_log,
)

log = get_logger("download")
SOCRATA = "https://data.sf.gov/resource"
ACS_BULK = "https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData"
OVERPASS = "https://overpass-api.de/api/interpreter"


class DownloadError(Exception):
    pass


# --- validators: raise DownloadError if the file is not what we expect --------

def geojson_min(n: int) -> Callable[[Path], int]:
    def check(path: Path) -> int:
        data = json.loads(path.read_text(encoding="utf-8"))
        feats = data.get("features")
        if not isinstance(feats, list) or len(feats) < n:
            raise DownloadError(f"expected >= {n} features, got {len(feats) if feats is not None else 'none'}")
        return len(feats)
    return check


def json_rows_min(n: int) -> Callable[[Path], int]:
    def check(path: Path) -> int:
        rows = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(rows, list) or len(rows) < n:
            raise DownloadError(f"expected >= {n} rows, got {len(rows) if isinstance(rows, list) else 'non-list'}")
        return len(rows)
    return check


def overpass_min(n: int) -> Callable[[Path], int]:
    def check(path: Path) -> int:
        els = json.loads(path.read_text(encoding="utf-8")).get("elements", [])
        if len(els) < n:
            raise DownloadError(f"expected >= {n} OSM elements, got {len(els)}")
        return len(els)
    return check


def gtfs_covers(path: Path, day: str) -> bool:
    """True if the feed has any active service on `day` (YYYY-MM-DD)."""
    from datetime import date as _date
    d = _date.fromisoformat(day)
    ds, wd = d.strftime("%Y%m%d"), d.strftime("%A").lower()
    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())
        active = set()
        if "calendar.txt" in names:
            for r in csv.DictReader(io.TextIOWrapper(z.open("calendar.txt"), "utf-8-sig")):
                if r.get(wd) == "1" and r["start_date"] <= ds <= r["end_date"]:
                    active.add(r["service_id"])
        if "calendar_dates.txt" in names:
            for r in csv.DictReader(io.TextIOWrapper(z.open("calendar_dates.txt"), "utf-8-sig")):
                if r["date"] == ds:
                    (active.add if r["exception_type"] == "1" else active.discard)(r["service_id"])
    return bool(active)


def gtfs_valid(path: Path) -> int:
    try:
        with zipfile.ZipFile(path) as z:
            names = set(z.namelist())
            for required in ("stops.txt", "routes.txt", "trips.txt", "stop_times.txt"):
                if required not in names:
                    raise DownloadError(f"GTFS zip missing {required}")
            with z.open("stops.txt") as f:
                return sum(1 for _ in f) - 1
    except zipfile.BadZipFile as exc:
        raise DownloadError("not a valid zip file") from exc


def csv_rows_min(n: int) -> Callable[[Path], int]:
    def check(path: Path) -> int:
        with path.open(encoding="utf-8") as f:
            rows = sum(1 for _ in csv.reader(f)) - 1
        if rows < n:
            raise DownloadError(f"expected >= {n} CSV rows, got {rows}")
        return rows
    return check


def pipe_rows_min(n: int) -> Callable[[Path], int]:
    def check(path: Path) -> int:
        with path.open(encoding="utf-8") as f:
            header = f.readline()
            if not header.startswith("GEO_ID|"):
                raise DownloadError(f"unexpected ACS header {header[:40]!r}")
            rows = sum(1 for _ in f)
        if rows < n:
            raise DownloadError(f"expected >= {n} rows, got {rows}")
        return rows
    return check


def pdf_valid(path: Path) -> int:
    if path.read_bytes()[:4] != b"%PDF":
        raise DownloadError("not a PDF")
    return path.stat().st_size


def tiff_valid(path: Path) -> int:
    head = path.read_bytes()[:4]
    if head not in (b"II*\x00", b"MM\x00*"):
        raise DownloadError(f"not a TIFF (starts {head!r}) — the server probably returned an error page")
    import rasterio
    with rasterio.open(path) as src:
        if src.crs is None:
            raise DownloadError("TIFF has no CRS")
        return src.width * src.height


# --- fetch helpers --------------------------------------------------------------

def http_get(url: str, *, params: dict | None = None, timeout: int = 180, retries: int = 3,
             method: str = "GET", data: dict | None = None) -> requests.Response:
    last: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            resp = requests.request(method, url, params=params, data=data, timeout=timeout,
                                    headers={"User-Agent": USER_AGENT})
            if resp.status_code == 429 or resp.status_code >= 500:
                raise DownloadError(f"HTTP {resp.status_code}")
            if resp.status_code != 200:
                raise DownloadError(f"HTTP {resp.status_code}: {resp.text[:200]}")
            return resp
        except (requests.RequestException, DownloadError) as exc:
            last = exc
            if attempt < retries and not (isinstance(exc, DownloadError) and "HTTP 4" in str(exc) and "429" not in str(exc)):
                wait = 5 * attempt
                log.warning("%s failed (%s); retry %d/%d in %ds", url, exc, attempt, retries, wait)
                time.sleep(wait)
            else:
                break
    raise DownloadError(str(last))


def fetch_url(url: str, params: dict | None = None) -> Callable[[Path], str]:
    def run(dest: Path) -> str:
        resp = http_get(url, params=params)
        dest.write_bytes(resp.content)
        return resp.url
    return run


def fetch_socrata_paged(dataset: str, select: str, where: str, order: str, page: int = 50000) -> Callable[[Path], str]:
    """Page through a Socrata JSON endpoint; writes one JSON list."""
    def run(dest: Path) -> str:
        url = f"{SOCRATA}/{dataset}.json"
        rows: list[dict] = []
        offset = 0
        while True:
            params = {"$select": select, "$where": where, "$order": order, "$limit": page, "$offset": offset}
            batch = http_get(url, params=params).json()
            rows.extend(batch)
            log.info("  %s: %d rows so far", dataset, len(rows))
            if len(batch) < page:
                break
            offset += page
        dest.write_text(json.dumps(rows), encoding="utf-8")
        return f"{url}?$select={select}&$where={where}"
    return run


def fetch_overpass(query: str) -> Callable[[Path], str]:
    def run(dest: Path) -> str:
        resp = http_get(OVERPASS, method="POST", data={"data": query}, timeout=300)
        dest.write_bytes(resp.content)
        return OVERPASS
    return run


def fetch_arcgis(layer: str, fields: str = "*", where: str = "1=1") -> Callable[[Path], str]:
    """Page public county layers; never silently accept ArcGIS's 1,000-feature cap."""
    def fetch(dest: Path) -> str:
        features, offset = [], 0
        while True:
            params = {"where": where, "geometry": ",".join(map(str, STUDY_BBOX)),
                      "geometryType": "esriGeometryEnvelope", "inSR": 4326,
                      "spatialRel": "esriSpatialRelIntersects", "outFields": fields,
                      "outSR": 4326, "returnGeometry": "true", "f": "geojson",
                      "geometryPrecision": 6, "resultOffset": offset, "resultRecordCount": 1000}
            body = http_get(layer + "/query", params=params).json()
            if "error" in body or "features" not in body:
                raise ValueError(f"ArcGIS query failed: {body.get('error', 'no features')}")
            page = body["features"]
            features.extend(page)
            if not page or (len(page) < 1000 and not body.get("exceededTransferLimit")):
                break
            offset += len(page)
        dest.write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")
        return layer
    return fetch


def twelve_month_window(today_: date | None = None) -> tuple[str, str]:
    """The 12 most recent complete calendar months: [start, end)."""
    t = today_ or date.today()
    end = date(t.year, t.month, 1)
    start = date(end.year - 1, end.month, 1)
    return start.isoformat(), end.isoformat()


def fetch_elevation(dest: Path) -> str:
    """USGS 3DEP seamless DEM, exported at ~10 m in California State Plane zone 3."""
    from pyproj import Transformer
    tr = Transformer.from_crs("EPSG:4326", METRIC_CRS, always_xy=True)
    w, s, e, n = STUDY_BBOX
    xs, ys = zip(*(tr.transform(x, y) for x, y in [(w, s), (w, n), (e, s), (e, n)]))
    xmin, xmax, ymin, ymax = min(xs), max(xs), min(ys), max(ys)
    cell = 10.0
    width, height = int((xmax - xmin) / cell), int((ymax - ymin) / cell)
    url = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage"
    params = {
        "bbox": f"{xmin},{ymin},{xmax},{ymax}", "bboxSR": 26943, "imageSR": 26943,
        "size": f"{width},{height}", "format": "tiff", "pixelType": "F32",
        "interpolation": "RSP_BilinearInterpolation", "f": "image",
    }
    resp = http_get(url, params=params, timeout=300)
    dest.write_bytes(resp.content)
    return url


# --- dataset registry -------------------------------------------------------------

@dataclass
class Source:
    id: str
    filename: str
    fetch: Callable[[Path], str]
    validate: Callable[[Path], int]
    priority: str = "P0"
    note: str = ""
    requires: list[str] = field(default_factory=list)  # env vars needed


def sources() -> list[Source]:
    crime_start, crime_end = twelve_month_window()
    crash_start = f"{int(crime_end[:4]) - 3}{crime_end[4:]}"
    w, s, e, n = SF_BBOX
    sw, ss, se, sn = STUDY_BBOX
    county = "https://gis.smcgov.org/maps/rest/services/Common/SanMateoCounty_Basemap/MapServer"
    return [
        Source("peninsula_jurisdictions", "peninsula_jurisdictions.geojson", fetch_arcgis(
            "https://gis.smcgov.org/maps/rest/services/ODP/Jurisdictions/FeatureServer/0",
            "COMMONNAME,NAME,UNINCORPORATED"), geojson_min(8)),
        Source("peninsula_water", "peninsula_water.geojson", fetch_arcgis(county + "/38"), geojson_min(1)),
        Source("peninsula_lakes", "peninsula_lakes.geojson", fetch_arcgis(county + "/30"), geojson_min(1)),
        Source("peninsula_streets", "peninsula_streets.geojson", fetch_arcgis(county + "/26",
            "OBJECTID,fullrdname,roadclass,fromaddr_l,toaddr_l,fromaddr_r,toaddr_r,expire,dateupdate"), geojson_min(1000)),
        Source("peninsula_cycling", "peninsula_cycling.geojson", fetch_arcgis(county + "/17",
            "OBJECTID,STATUS,BIKE_CLASS,NAME,CITY,SOURCE,LAST_EDITED_DATE"), geojson_min(40)),
        Source("peninsula_parks", "peninsula_parks.geojson", fetch_arcgis(county + "/37",
            "OBJECTID,NAME,CATEGORY,CITY,SRC_AGENCY,SRC_DATE,REV_DATE"), geojson_min(40)),
        # P0 — DataSF. Analysis Neighborhoods: p5b7-5n3h is a map *visualisation*; its
        # underlying table (same 41 polygons) is j2bu-swwd, which has the GeoJSON endpoint.
        Source("neighbourhoods", "neighbourhoods.geojson",
               fetch_url(f"{SOCRATA}/j2bu-swwd.geojson", {"$limit": 1000}), geojson_min(41)),
        Source("police_incidents", "police_incidents_12m.json",
               fetch_socrata_paged(
                   "wg3w-h783",
                   select="row_id,incident_id,incident_datetime,report_type_code,incident_category,"
                          "incident_subcategory,police_district,analysis_neighborhood,latitude,longitude",
                   where=f"incident_date >= '{crime_start}T00:00:00' AND incident_date < '{crime_end}T00:00:00'",
                   order="row_id"),
               json_rows_min(50000), note=f"window {crime_start} to {crime_end} (exclusive)"),
        Source("bike_network", "bike_network.geojson",
               fetch_url(f"{SOCRATA}/ygmz-vaxd.geojson", {"$limit": 50000}), geojson_min(3000)),
        Source("streets_active", "streets_active.geojson",
               fetch_url(f"{SOCRATA}/3psu-pn9h.geojson", {"$where": "active=true", "$limit": 50000}),
               geojson_min(10000), note="Official DPW active centrelines; road classes/layers filtered during processing"),
        Source("parks_rpd", "parks_rpd.geojson",
               fetch_url(f"{SOCRATA}/gtr9-ntp6.geojson", {"$limit": 5000}), geojson_min(200)),
        # P0 — transit. 511.org requires an API token (HTTP 401 without one); the agencies
        # publish their own static GTFS publicly, which is what we use.
        Source("gtfs_bart", "gtfs_bart.zip",
               fetch_url("https://www.bart.gov/dev/schedules/google_transit.zip"), gtfs_valid),
        Source("gtfs_muni", "gtfs_muni.zip",
               fetch_url("https://muni-gtfs.apps.sfmta.com/data/muni_gtfs-current.zip"), gtfs_valid),
        Source("gtfs_caltrain", "gtfs_caltrain.zip",
               fetch_url("https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip"), gtfs_valid),
        Source("gtfs_samtrans_public", "gtfs_samtrans_public.zip",
               fetch_url("https://www.samtrans.com/media/37770/download"), gtfs_valid,
               note="Official public SamTrans developer feed; no 511 key required"),
        # P1 — secondary; failures are reported but never fatal.
        Source("osm_parks", "osm_parks.json", fetch_overpass(
            f"[out:json][timeout:180];"
            f"(way[\"leisure\"~\"^(park|nature_reserve|garden)$\"]({ss},{sw},{sn},{se});"
            f"relation[\"leisure\"~\"^(park|nature_reserve|garden)$\"]({ss},{sw},{sn},{se}););out geom;"),
               overpass_min(100), priority="P1",
               note="fills non-RPD parks (Presidio, GGNRA, state parks, POPOS gardens)"),
        Source("osm_groceries", "osm_groceries.json", fetch_overpass(
            f"[out:json][timeout:120];"
            f"(nwr[\"shop\"~\"^(supermarket|greengrocer)$\"]({ss},{sw},{sn},{se}););out center tags;"),
               overpass_min(50), priority="P1"),
        Source("elevation_3dep", "elevation_3dep_10m.tif", fetch_elevation, tiff_valid, priority="P1"),
        Source("zori_zip", "zillow_zori_zip.csv",
               fetch_url("https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_month.csv"),
               csv_rows_min(1000), priority="P1"),
        # ZIP Code Tabulation Areas: approximate ZIP geography, only used to relate
        # ZIP-level rents to neighbourhoods by area overlap.
        Source("zcta_boundaries", "zcta_2020.geojson", fetch_url(
            "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/1/query",
            {"where": "1=1", "geometry": f"{sw},{ss},{se},{sn}", "geometryType": "esriGeometryEnvelope",
             "inSR": 4326, "spatialRel": "esriSpatialRelIntersects", "outFields": "ZCTA5",
             "outSR": 4326, "returnGeometry": "true", "f": "geojson"}),
               geojson_min(20), priority="P1"),
        Source("injury_crashes", "injury_crashes_3y.json",
               fetch_socrata_paged(
                   "ubvf-ztfx",
                   select="unique_id,collision_datetime,collision_severity,dph_col_grp_description,"
                          "number_killed,number_injured,tb_latitude,tb_longitude,analysis_neighborhood",
                   where=f"collision_datetime >= '{crash_start}T00:00:00' AND collision_datetime < '{crime_end}T00:00:00'",
                   order="unique_id"),
               json_rows_min(1000), priority="P1", note=f"window {crash_start} to {crime_end} (exclusive)"),
        # ACS 2020-2024 5-year, official table-based summary files: keyless (the Census *API* now
        # needs a key — every data endpoint redirects to missing_key.html). Nationwide, ~18 MB each;
        # filtered to our tracts during processing.
        Source("acs_b01003", "acs5y2024_b01003.dat",
               fetch_url(f"{ACS_BULK}/acsdt5y2024-b01003.dat"), pipe_rows_min(70000), priority="P1",
               note="ACS 2020-2024 5-year B01003 total population"),
        Source("acs_b25064", "acs5y2024_b25064.dat",
               fetch_url(f"{ACS_BULK}/acsdt5y2024-b25064.dat"), pipe_rows_min(70000), priority="P1",
               note="ACS 2020-2024 5-year B25064 median gross rent (rent paid)"),
        Source("census_tracts_2020", "census_tracts_2020.geojson", fetch_url(
            "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/10/query",
            {"where": "1=1", "geometry": f"{sw},{ss},{se},{sn}", "geometryType": "esriGeometryEnvelope",
             "inSR": 4326, "spatialRel": "esriSpatialRelIntersects", "outFields": "GEOID,AREALAND,AREAWATER",
             "outSR": 4326, "returnGeometry": "true", "f": "geojson"}),
               geojson_min(200), priority="P1"),
        # CalEnviroScreen 5.0 (final, OEHHA, July 2026) — tract-level indicators + data dictionary.
        Source("calenviroscreen5", "calenviroscreen50_070126.csv", fetch_url(
            "https://publish.data.ca.gov/dataset/72b28c84-ceac-4886-9f71-d422470d2223/resource/"
            "c4e277e0-cf23-4a8f-b07e-c8544c5d3d2b/download/calenviroscreen50_070126.csv"),
               csv_rows_min(8000), priority="P1"),
        Source("calenviroscreen5_dictionary", "calenviroscreen50_data_dictionary.pdf", fetch_url(
            "https://publish.data.ca.gov/dataset/72b28c84-ceac-4886-9f71-d422470d2223/resource/"
            "31ddb21a-44bb-4cb0-81d8-6e2f80ee359d/download/final-calenviroscreen-5.0-data-dictionary.pdf"),
               pdf_valid, priority="P1"),
        Source("osm_nightlife", "osm_nightlife.json", fetch_overpass(
            f'[out:json][timeout:120];nwr["amenity"~"^(bar|pub|nightclub)$"]({ss},{sw},{sn},{se});out center tags;'),
               overpass_min(100), priority="P1", note="Mapped bars, pubs and nightclubs from SF through SFO; nightlife density context"),
        Source("osm_food_drink", "osm_food_drink.json", fetch_overpass(
            f"[out:json][timeout:180];"
            f"(nwr[\"amenity\"~\"^(cafe|restaurant|bar|pub)$\"]({ss},{sw},{sn},{se});"
            f"nwr[\"shop\"=\"coffee\"]({ss},{sw},{sn},{se}););out center tags;"),
               overpass_min(1000), priority="P1", note="cafes, coffee shops, restaurants, bars, pubs (SF to SFO)"),
        # Optional 511 alternatives. SamTrans also has the keyless official public feed above.
        # Muni via 511 is the current timetable when SFMTA's own lags.
        Source("gtfs_samtrans", "gtfs_samtrans.zip", fetch_511_gtfs("SM"), gtfs_valid, priority="P1",
               requires=["API_511_KEY"]),
        Source("gtfs_muni_511", "gtfs_muni_511.zip", fetch_511_gtfs("SF"), gtfs_valid, priority="P1",
               requires=["API_511_KEY"], note="preferred over gtfs_muni when it covers the target date"),
    ]


BLOCKED_MANIFEST = {
    "gtfs_muni_511": {
        "source": "SFMTA Muni GTFS via 511.org Open Data",
        "source_url": "https://api.511.org/transit/datafeeds?operator_id=SF",
        "licence": "511.org Open Data developer terms (token signup)", "resolution": "Stops and route shapes",
        "limitations": "SFMTA's public 'current' feed ended 2026-08-28; 511 carries the current timetable but "
                       "returns HTTP 401 without a token. Add API_511_KEY to .env and rerun.",
    },
    "gtfs_samtrans": {
        "source": "SamTrans GTFS via 511.org Open Data",
        "source_url": "https://api.511.org/transit/datafeeds?operator_id=SM",
        "licence": "511.org Open Data terms — review", "resolution": "Stops and route shapes",
        "limitations": "511.org returns HTTP 401 without a token. Add API_511_KEY to .env and rerun; "
                       "processing picks the feed up automatically.",
    },
}


def fetch_511_gtfs(operator: str) -> Callable[[Path], str]:
    def run(dest: Path) -> str:
        url = "https://api.511.org/transit/datafeeds"
        resp = http_get(url, params={"api_key": env("API_511_KEY"), "operator_id": operator})
        dest.write_bytes(resp.content)
        return f"{url}?operator_id={operator}"
    return run


# --- driver --------------------------------------------------------------------------

def run_one(src: Source, refresh: bool) -> tuple[str, str, dict]:
    dest = RAW_DIR / src.filename
    missing_env = [v for v in src.requires if not env(v)]
    if missing_env:
        return src.id, "blocked", {"reason": f"missing {', '.join(missing_env)} in .env"}
    if dest.exists() and not refresh:
        try:
            count = src.validate(dest)
            return src.id, "skipped", {"count": count}
        except Exception as exc:  # existing file is bad: re-download
            log.warning("%s: existing file invalid (%s); re-downloading", src.id, exc)
    tmp = dest.with_suffix(dest.suffix + ".part")
    started = time.monotonic()
    try:
        url = src.fetch(tmp)
        count = src.validate(tmp)
    except Exception as exc:
        tmp.unlink(missing_ok=True)
        return src.id, "failed", {"reason": f"{type(exc).__name__}: {exc}"}
    if dest.exists() and sha256(dest) != sha256(tmp):
        # Preserve the original: archive it under its old download date.
        old_date = read_download_log().get(src.id, {}).get("downloaded_at", "unknown")
        archive = RAW_DIR / "archive" / f"{dest.stem}_{old_date}{dest.suffix}"
        archive.parent.mkdir(exist_ok=True)
        dest.replace(archive)
        log.info("%s: previous file archived to raw/%s", src.id, archive.relative_to(RAW_DIR).as_posix())
    tmp.replace(dest)
    if src.id.startswith("gtfs_"):
        covered = gtfs_covers(dest, TARGET_SERVICE_DATE)
        src.note = f"{'covers' if covered else 'DOES NOT cover'} {TARGET_SERVICE_DATE}"
        if not covered:
            log.warning("%s: timetable does not cover %s — kept, but will be labelled expired", src.id, TARGET_SERVICE_DATE)
    info = {"url": url, "downloaded_at": today(), "bytes": dest.stat().st_size,
            "sha256": sha256(dest), "count": count, "file": src.filename, "note": src.note,
            "seconds": round(time.monotonic() - started, 1)}
    return src.id, "downloaded", info


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", nargs="+", help="dataset ids to download")
    parser.add_argument("--refresh", action="store_true", help="re-download even if a valid file exists")
    parser.add_argument("--list", action="store_true", help="list dataset ids and exit")
    parser.add_argument("--p0", action="store_true", help="only the P0 (core) datasets")
    args = parser.parse_args(argv)

    all_sources = sources()
    if args.list:
        for s in all_sources:
            print(f"{s.priority}  {s.id:20s} -> data/sf/raw/{s.filename}  {s.note}")
        return 0
    selected = [s for s in all_sources if (not args.only or s.id in args.only) and (not args.p0 or s.priority == "P0")]
    unknown = set(args.only or []) - {s.id for s in all_sources}
    if unknown:
        log.error("unknown dataset ids: %s", sorted(unknown))
        return 2

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    dl_log = read_download_log()
    results: dict[str, tuple[str, dict]] = {}
    # Overpass asks clients not to run parallel queries; everything else is a different host.
    overpass = [s for s in selected if s.id.startswith("osm_")]
    others = [s for s in selected if not s.id.startswith("osm_")]
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(run_one, s, args.refresh) for s in others]
        for s in overpass:  # sequential, on this thread, while the pool works
            sid, status, info = run_one(s, args.refresh)
            results[sid] = (status, info)
            log.info("%-18s %s %s", sid, status, info.get("reason") or info.get("count"))
        for fut in as_completed(futures):
            sid, status, info = fut.result()
            results[sid] = (status, info)
            log.info("%-18s %s %s", sid, status, info.get("reason") or info.get("count"))

    for sid, (status, info) in results.items():
        entry = dl_log.get(sid, {})
        if status == "downloaded":
            entry = info | {"status": "ok"}
        elif status in ("failed", "blocked"):
            entry |= {"status": status, "last_error": info["reason"], "last_attempt": today()}
            if sid in BLOCKED_MANIFEST and not (RAW_DIR / next(s.filename for s in all_sources if s.id == sid)).exists():
                update_manifest(sid, BLOCKED_MANIFEST[sid] | {
                    "downloaded_at": None, "measurement_period": None, "feature_count": None,
                    "raw_path": None, "processed_path": [], "script": "scripts/download_datasets.py",
                    "refresh": "n/a until unblocked", "status": "blocked",
                    "limitations": f"{BLOCKED_MANIFEST[sid]['limitations']} Last attempt {today()}: {info['reason']}.",
                })
        dl_log[sid] = entry
    write_download_log(dl_log)

    print("\nSummary:")
    p0_failed = False
    for s in selected:
        status, info = results[s.id]
        detail = info.get("reason") or f"{info.get('count')} records"
        print(f"  {s.priority} {s.id:20s} {status:10s} {detail}")
        if status == "failed" and s.priority == "P0":
            p0_failed = True
    return 1 if p0_failed else 0


if __name__ == "__main__":
    sys.exit(main())
