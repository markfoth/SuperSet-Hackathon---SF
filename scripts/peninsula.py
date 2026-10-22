"""San Mateo County source adapters for the SF-to-SFO discovery area.

City/unincorporated boundaries are grouping context, not invented neighbourhoods.
County ocean/bay and lake polygons are subtracted before generating candidate cells.
"""
from __future__ import annotations

import geopandas as gpd
import pandas as pd
import shapely

from _common import METRIC_CRS, PROCESSED_DIR, RAW_DIR, STUDY_BBOX, read_download_log, rel, today, update_manifest


def record_sources() -> None:
    """Keep raw county layers and unavailable local reports visible in the manifest."""
    log = read_download_log()
    base = "https://gis.smcgov.org/maps/rest/services/Common/SanMateoCounty_Basemap/MapServer"
    layers = {"jurisdictions": ("County city / unincorporated boundaries", "https://gis.smcgov.org/maps/rest/services/ODP/Jurisdictions/FeatureServer/0"),
              "water": ("Ocean / bay polygons", base + "/38"), "lakes": ("Lake polygons", base + "/30"),
              "streets": ("County street centrelines", base + "/26"),
              "cycling": ("County bikeways (existing status only in processed output)", base + "/17"),
              "parks": ("County mapped park boundaries", base + "/37")}
    for key, (name, url) in layers.items():
        sid = "peninsula_" + key
        path = RAW_DIR / (sid + ".geojson")
        update_manifest(sid, {"source": "San Mateo County GIS — " + name, "source_url": url,
            "licence": "Public county GIS; no explicit redistribution licence in REST metadata; attribute San Mateo County",
            "downloaded_at": log.get(sid, {}).get("downloaded_at"), "measurement_period": "Published snapshot; individual feature dates vary",
            "resolution": "Source geometry; clipped to study land during processing",
            "feature_count": log.get(sid, {}).get("count"), "raw_path": rel(path), "processed_path": [],
            "script": "scripts/peninsula.py via process_datasets.py", "refresh": "quarterly",
            "limitations": "County snapshot, not a completeness guarantee. Jurisdiction boundaries include water, removed before matching. Proposed or unknown-status bikeways are not installed facilities.",
            "status": "downloaded"})
    for key, source, url in [
        ("peninsula_police_incidents", "South San Francisco Police crime statistics", "https://www.ssf.net/files/assets/public/v/1/police/flyers/2025/2024-pd-crime-stats.pdf"),
        ("peninsula_injury_collisions", "C/CAG San Mateo County local road safety reports / SWITRS", "https://ccag.ca.gov/wp-content/uploads/2024/04/4.1-A3_CCAG-Individual-LRSP-Combined-compressed.pdf"),
    ]:
        update_manifest(key, {"source": source, "source_url": url, "licence": "Source agency terms",
            "downloaded_at": today(), "measurement_period": "No compatible geocoded extract available",
            "resolution": "Reports, not a comparable local incident feed", "feature_count": None,
            "raw_path": None, "processed_path": [], "script": "scripts/peninsula.py", "refresh": "when a compatible source is available",
            "limitations": "SF police / TransBASE feeds do not cover Peninsula jurisdictions. City-wide or historical report totals cannot be copied into fine cells or treated as zero. Local values remain null.",
            "status": "blocked"})


def raw_layer(name: str) -> gpd.GeoDataFrame:
    path = RAW_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"{path.name} missing; download the peninsula_* sources first")
    return gpd.read_file(path).to_crs(4326)


def regions(sf_land) -> gpd.GeoDataFrame:
    from process_datasets import slug
    record_sources()
    jurisdictions = raw_layer("peninsula_jurisdictions.geojson")
    water = shapely.union_all([*raw_layer("peninsula_water.geojson").geometry,
                               *raw_layer("peninsula_lakes.geojson").geometry])
    bbox = shapely.box(*STUDY_BBOX)
    rows = []
    # Named municipal jurisdictions win over any overlapping residual county area.
    jurisdictions = jurisdictions.sort_values("COMMONNAME", key=lambda s: s.eq("UNINCORPORATED AREA"))
    seen = sf_land
    for _, row in jurisdictions.iterrows():
        geom = shapely.make_valid(row.geometry).intersection(bbox).difference(water).difference(seen)
        polygons = [p for p in shapely.get_parts(geom) if p.geom_type in ("Polygon", "MultiPolygon")]
        geom = shapely.union_all(polygons)
        if geom.is_empty:
            continue
        area = gpd.GeoSeries([geom], crs=4326).to_crs(METRIC_CRS).area.iloc[0]
        if area < 50_000:  # negligible clipped fragments are not standalone discovery groups
            continue
        name = row.COMMONNAME.title().replace("Mtn", "Mountain")
        if name == "San Francisco International Airport":
            name = "SFO Airport"
        elif name == "Unincorporated Area":
            name = "Northern Peninsula unincorporated areas"
        rows.append({"id": slug(name), "name": name, "region": "peninsula",
                     "boundary_kind": "unincorporated area" if row.UNINCORPORATED else "city",
                     "geometry": geom})
        seen = seen.union(geom)
    return gpd.GeoDataFrame(rows, crs=4326)


def clip_layer(name: str) -> gpd.GeoDataFrame:
    frame = raw_layer(name).to_crs(METRIC_CRS)
    groups = gpd.read_file(PROCESSED_DIR / "neighbourhoods.geojson").to_crs(METRIC_CRS)
    land = groups.loc[groups["region"].eq("peninsula"), "geometry"].union_all()
    frame["geometry"] = frame.geometry.intersection(land)
    return frame[~frame.geometry.is_empty & frame.geometry.notna()].copy()


def streets() -> gpd.GeoDataFrame:
    roads = clip_layer("peninsula_streets.geojson").explode(index_parts=False).reset_index(drop=True)
    roads = roads[roads["roadclass"].isin(["LOCAL", "ARTERIAL", "COLLECTOR", "SERVICE"])
                  & roads["expire"].isna() & roads.geometry.geom_type.eq("LineString")].copy()
    address = roads[["fromaddr_l", "toaddr_l", "fromaddr_r", "toaddr_r"]].apply(
        lambda s: pd.to_numeric(s, errors="coerce")).max(axis=1).fillna(0) > 0
    return gpd.GeoDataFrame({"cnn": "smc:" + roads["OBJECTID"].astype(str),
                            "streetname": roads["fullrdname"].fillna("Unnamed road"),
                            "analysis_neighborhood": None, "f_st": None, "t_st": None,
                            "residential_evidence": address & roads["roadclass"].eq("LOCAL")},
                           geometry=roads.geometry, crs=METRIC_CRS)


def cycling() -> gpd.GeoDataFrame:
    bikes = clip_layer("peninsula_cycling.geojson").explode(index_parts=False).reset_index(drop=True)
    # A master-plan proposal is not an installed bike lane. Unknown status stays out.
    bikes = bikes[bikes["STATUS"].eq("Existing") & bikes.geometry.geom_type.eq("LineString")].copy()
    cats = {1: "path", 2: "lane", 3: "route", 4: "protected"}
    classes = pd.to_numeric(bikes["BIKE_CLASS"], errors="coerce")
    return gpd.GeoDataFrame({"cat": classes.map(cats).fillna("other"),
                            "class": classes.map(lambda v: f"County class {v:g}" if pd.notna(v) else "Unknown"),
                            "street": bikes["NAME"].fillna("Unnamed bikeway"), "from": None, "to": None,
                            "buffered": False, "raised": False, "installed": None,
                            "length_m": bikes.length.round(), "grade_pct": None,
                            "source": "San Mateo County GIS"}, geometry=bikes.geometry.simplify(1.5), crs=METRIC_CRS)


def parks() -> gpd.GeoDataFrame:
    frame = clip_layer("peninsula_parks.geojson")
    frame["geometry"] = frame.geometry.buffer(0)
    frame = frame[frame.area >= 2023].copy()
    return gpd.GeoDataFrame({"name": frame["NAME"].fillna("Unnamed park"),
                            "type": frame["CATEGORY"].str.title(), "acres": (frame.area / 4046.86).round(2),
                            "manager": frame["SRC_AGENCY"].fillna("See county GIS"),
                            "source": "San Mateo County GIS"}, geometry=frame.geometry, crs=METRIC_CRS)
