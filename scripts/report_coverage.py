"""Export measured-cell coverage without treating absent evidence as zero."""
import csv
import json
from pathlib import Path
from _common import PROCESSED_DIR, REPO_ROOT

FIELDS={'park':'park_distance_m','grocery':'grocery_distance_m','rail':'rail_distance_m',
        'pollution':'pm25_percentile','rent':'zip_asking_rent','incidents':'incidents_per_km2','gradient':'street_grade_pct'}

if __name__=='__main__':
    areas=json.loads((PROCESSED_DIR/'neighbourhoods.geojson').read_text(encoding='utf-8'))['features']
    cells=json.loads((PROCESSED_DIR/'area_cells.geojson').read_text(encoding='utf-8'))['features']
    rows=[]
    for area in areas:
        p=area['properties'];group=[f['properties'] for f in cells if f['properties']['nhood_id']==p['id']]
        rows.append({'id':p['id'],'name':p['name'],'region':p['region'],'candidate_cells':len(group),
                     'residential_candidates':sum(f['residential'] is not False for f in group),
                     **{name+'_measured_cells':sum(f.get(field) is not None for f in group) for name,field in FIELDS.items()}})
    target=REPO_ROOT/'docs/verification/coverage-matrix.csv';target.parent.mkdir(exist_ok=True,parents=True)
    with target.open('w',encoding='utf-8',newline='') as stream:
        writer=csv.DictWriter(stream,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    print(f'{len(rows)} area groups; {len(cells)} complete candidates; {target.relative_to(REPO_ROOT)}')
