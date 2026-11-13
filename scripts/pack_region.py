"""Repack committed analysis and viewport geometry after measurement refresh."""
import geopandas as gpd
from _common import METRIC_CRS, PROCESSED_DIR
from build_region import build_assets, manifest

if __name__ == '__main__':
    cells=gpd.read_file(PROCESSED_DIR/'area_cells.geojson').to_crs(METRIC_CRS)
    places=gpd.read_file(PROCESSED_DIR/'neighbourhoods.geojson').to_crs(METRIC_CRS)
    new=cells.nhood_id.str.startswith('census-')
    added=places[places.id.str.startswith('census-')]
    counts=build_assets(cells[~new],cells[new],added)
    manifest(counts,added)
    print(counts)
