# Street-gradient audit and validation

The old `step_hills()` used `numpy.gradient` on the DEM and averaged the magnitude within
170 m of every sample centre, then took a neighbourhood median. This measured hillsides,
including slopes beside flat streets. `segment_grade()` used nearest-pixel samples and
roughly 50 m windows only for bike segments, not for residential matching.

The existing TIFF is EPSG:26943, horizontal metres, 10.005 m pixels; its band has no unit or
nodata tag. Elevation metres follow the USGS elevation-service contract. The revised sampler
reads the mask, preserves nonfinite values, rejects out-of-range sentinels, transforms from
the metric analysis CRS, and interpolates bilinearly at pixel centres. All four neighbouring
pixels must be valid. No missing elevation is interpolated across.

Official source: [DataSF Streets – Active and Retired, 3psu-pn9h](https://data.sf.gov/d/3psu-pn9h).
Schema verified on 22 October: CNN unique ids; active boolean; classcode; streetname; layer;
address ranges; line geometry. Of 16,378 active records, 14,585 usable line parts remain:
street layers and road classes 2–5, plus addressed private streets. Freeways, ramps, paper,
park, pseudo and pedestrian/stair layers are excluded. Class 5 plus a nonzero address range
supports residential eligibility but does not prove parcel land use.

Each original road is split into approximately 10 m pieces. A piece's grade is the absolute
elevation difference over a 40 m window centred on it; end windows shift inward. Short
roads (<40 m) have null grades. Windows are calculated before clipping at H3 boundaries.
Pieces are intersected with H3-9 cells and weighted by their actual intersected length.
Median, 90th percentile, fraction of street length above 10%, measured length and coverage
are retained. A cell needs 100 m measured streets and 75% valid length. No terrain mean fills
missing streets. Bike segment grades retain their separate steepest-window meaning and now
use the corrected sampler.

An independent USGS elevation-unit cross-check at Twin Peaks (37.7544, -122.4477) returned
250.198 m from the official [Elevation Point Query Service](https://apps.nationalmap.gov/epqs/)
(`units=Meters`, 1 m source). The local bilinear ~10 m raster returned 249.435 m at the same
coordinate. The 0.763 m difference is consistent with differing sample resolution; it also
rules out a feet/metres scale mismatch at that location. This is a unit check, not a vertical
accuracy certification.

Computed contrasts (not calibrated to expectations):

| Area | Street median | Street p90 | Range of H3 cell medians |
|---|---:|---:|---:|
| Mission | 1.2% | 5.3% | 0.4–9.5% |
| Sunset/Parkside | 2.1% | 6.8% | 0.2–8.4% |
| Nob Hill | 7.1% | 15.9% | 3.5–9.7% |
| Russian Hill | 6.3% | 15.9% | 0.4–12.6% |
| Potrero Hill | 2.8% | 15.3% | 0.2–15.4% |
| Bernal Heights | 5.7% | 16.1% | 1.1–12.0% |

Individual segments on Valencia and Irving return approximately flat gradients; Jones,
22nd and Vermont vary substantially by block. Inspectable per-CNN estimates live in
`street_gradients.geojson`; aggregate contrasts in `street_gradient_validation.json`.
These checks confirm plausible contrasts and within-neighbourhood variation, not survey accuracy.
Bridges, tunnels, cuttings, retaining walls and the elevation export's resampling can still
bias estimates. The map explicitly labels the result **DEM-derived**, not surveyed.

Rebuild: `python -X utf8 scripts/process_datasets.py --only hills cycling`, then
`python -X utf8 scripts/build_area_cells.py`. No new elevation download is needed.
