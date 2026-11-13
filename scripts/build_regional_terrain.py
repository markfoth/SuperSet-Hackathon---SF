"""Record a verified viewport-only terrain service, without downloading a planet archive.

The old clipped USGS pyramid remains a reproducible baseline, not a runtime source.
Run outside frontend builds. Network requests are bounded metadata GETs only.
"""
import requests
from _common import PROCESSED_DIR, update_manifest, write_json, today, rel


def build():
    service = 'https://tiles.mapterhorn.com/tilejson.json'
    response = requests.get(service, timeout=30)
    response.raise_for_status()
    remote = response.json()
    if remote.get('encoding') != 'terrarium' or remote.get('tileSize') != 512 or remote.get('scheme') != 'xyz':
        raise ValueError('Unexpected Mapterhorn encoding, dimensions or Y indexing')
    catalogue_url = 'https://download.mapterhorn.com/attribution.json'
    catalogue_response = requests.get(catalogue_url, timeout=30)
    catalogue_response.raise_for_status()
    relevant = [row for row in catalogue_response.json() if row['source'] in ('glo30', 'usgs3dep13') or row['source'].startswith('us1')]
    metadata = {
        'source': 'Mapterhorn regional rendering terrain', 'verified_at': today(),
        'source_url': service, 'tiles': remote['tiles'], 'encoding': 'terrarium',
        'tileSize': 512, 'scheme': 'xyz', 'minzoom': 0, 'maxzoom': 12,
        'bounds': remote['bounds'], 'exaggeration': 1,
        'attribution': "Terrain: <a href='https://mapterhorn.com/attribution/'>Mapterhorn and source contributors</a> · USGS 3DEP",
        'catalogue_url': catalogue_url,
        'regional_sources': [{key: row.get(key) for key in ('source', 'name', 'website', 'license', 'resolution', 'access_year')} for row in relevant],
        'limitations': 'Rendering context only. Source acquisition dates and vertical datums vary. Uses globally complete z0-12 pyramid, overzoomed at street scale; not a building survey or street-grade measurement. Hosted best-effort service without an application SLA. No local flat or fabricated elevation fallback.',
    }
    path = PROCESSED_DIR / 'regional_terrain.json'
    write_json(path, metadata)
    update_manifest('regional_terrain', {
        'source': 'Mapterhorn, USGS 3DEP and global context contributors',
        'source_url': service, 'licence': 'Underlying USGS datasets: US public domain; Copernicus GLO-30: full, free and open licence. Full source attribution: https://mapterhorn.com/attribution/',
        'downloaded_at': today(), 'measurement_period': 'Source-specific acquisition dates; provider catalogue accessed 2025-2026',
        'resolution': '512px WebP Terrarium XYZ; z0-12 globally complete context pyramid; approximately 15 m pixels at z12 near SF, overzoomed at street scale',
        'feature_count': None, 'raw_path': 'Remote viewport tiles, not downloaded as a dataset',
        'processed_path': [rel(path)], 'script': 'scripts/build_regional_terrain.py',
        'refresh': 'Rerun to verify provider TileJSON and source catalogue; viewport requests use normal HTTP caching',
        'limitations': metadata['limitations'], 'status': 'processed', 'processed_at': today(),
    })
    print(f'Wrote {rel(path)}; {len(relevant)} relevant source catalogue records. No terrain archive downloaded.')


if __name__ == '__main__':
    build()
