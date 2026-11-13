import json
import requests
from pathlib import Path

urls = {
    'muni_metadata': 'https://data.sf.gov/api/views/dni7-qpv3.json',
    'fema_metadata': 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer?f=pjson',
}
folder = Path('data/sf/raw/regional'); folder.mkdir(exist_ok=True)
for name, url in urls.items():
    try:
        response = requests.get(url, timeout=45); response.raise_for_status()
        value = response.json(); (folder / f'{name}.json').write_text(json.dumps(value), encoding='utf-8')
        print(name, response.status_code, len(response.content))
        if name == 'muni_metadata': print(json.dumps(value.get('blobFilename')), value.get('blobId'), value.get('metadata', {}).get('custom_fields'))
        else: print([(x['id'], x['name']) for x in value.get('layers', [])])
    except Exception as error: print(name, type(error).__name__, str(error)[:200])
