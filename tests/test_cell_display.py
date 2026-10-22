"""Display footprints must not suggest homes inside mapped park/open-space polygons."""
import geopandas as gpd

from _common import METRIC_CRS, PROCESSED_DIR


def test_display_cells_remove_parks_and_keep_matching_ids():
    cells = gpd.read_file(PROCESSED_DIR / "area_cells.geojson").to_crs(METRIC_CRS).set_index("h3")
    display = gpd.read_file(PROCESSED_DIR / "area_cell_display.geojson").to_crs(METRIC_CRS).set_index("h3")
    parks = gpd.read_file(PROCESSED_DIR / "parks.geojson").to_crs(METRIC_CRS).geometry.make_valid().union_all()
    assert display.index.is_unique
    assert set(display.index) <= set(cells.index)
    assert display.geometry.is_valid.all()
    assert not display.geometry.is_empty.any()
    assert display.geom_type.isin(["Polygon", "MultiPolygon"]).all()
    # GeoJSON rounding can move an edge by centimetres; allow <1 m of boundary tolerance.
    assert display.geometry.intersection(parks.buffer(-1)).area.max() < 0.1
    originals = cells.loc[display.index].geometry
    assert display.geometry.difference(originals.buffer(1)).area.max() < 0.1
    assert (originals.area - display.area > 100).sum() > 100  # real park edges were cut
    omitted = cells.loc[~cells.index.isin(display.index)]
    assert len(omitted) > 0
    assert omitted.geometry.difference(parks.buffer(1)).area.max() < 0.1
