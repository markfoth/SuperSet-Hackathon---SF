# Fine-area matching and priority ranking

Chosen by the user on 22 October 2026: **priority-first comparison using measurement bands**.

1. Matching unit: canonical H3-9 cell, using its H3 centre or a representative land point for
   coastal clipped cells. All active workplace polygons must contain that **same point**.
   Individual catchments and their exact polygon intersection remain visible on the map.
2. A requested pending, missing or failed route is never omitted. Its cells cannot be confirmed
   matches. With no workplace, the UI asks for one and shows unknown cells.
3. Every explicit Must is tested independently; all known failure reasons are retained. Missing
   required measurements are unknown, not passing or failing. Strong/partial results exclude
   those unknown hard requirements. Conservative parkland exclusions also apply per cell.
4. For feasible cells, compare active preferences in the saved explicit order. Click order and
   object insertion order have no effect. The first differing measurement band decides; lower
   priorities break ties. No weighted total, percentile liveability score or hidden aggregate.

| Measurement | Nice band width | Important / Must band width | Must threshold |
|---|---:|---:|---|
| Median DEM-derived street grade | 4 percentage points | 2 percentage points | <8% |
| Park distance | 400 m | 200 m | ≤400 m |
| Frequent-transit stop distance | 400 m | 200 m | ≤400 m |
| Rail distance | 400 m | 200 m | ≤800 m |
| Supermarket distance | 400 m | 200 m | ≤800 m |
| Dedicated cycling facility distance | 400 m | 200 m | ≤250 m |
| Reported incidents, H3-8 | 300/km²/year | 150/km²/year | <300/km²/year |

Bands are `floor(value / width)`, oriented so lower distances/grades/reports rank better.
Important distinguishes differences that Nice treats as equivalent. Explicit priority still
dominates: moving a Nice preference above an Important preference makes it the earlier decision.
Band boundaries are deliberate, deterministic approximations, not statistical confidence limits.
Equal vectors fall back to name and stable H3 id. Neighbourhood ties first prefer a larger
suitable-land share, then name/id.

Missing soft measurements retain a distinct null band, ordered after measured evidence at that
criterion. This is an **evidence-availability policy**, not an assumed poor measurement. Missing
values are never replaced with zero or a neighbourhood mean. Missing softer preferences are
flagged and yellow, even if none can be assessed: Nice/Important never remove feasible cells. This
explicit total ordering is transitive, including when different cells lack different inputs.

Neighbourhood discovery groups cells; a neighbourhood remains discoverable if **any** candidate
cell passes. It is ranked by its leading eligible cell's vector. Counts and suitable shares use
candidate cells (residential true or uncertain), excluding confidently park-only cells. Land
shares weight the clipped cell areas; these are approximate at neighbourhood borders because
each cell has one parent by largest overlap. Both counts and shares are displayed. A missing
critical measurement elsewhere does not erase an eligible part of the neighbourhood.

Green means all hard requirements satisfied and every active softer preference meets its stated
target. Yellow satisfies hard requirements but has weaker or missing softer measurements. With
no softer preferences active, green means commute feasibility only. These colours are threshold
categories, not a numeric score. Red/hatched means a known hard failure; grey means insufficient
required evidence. Known failures remain excluded
even if additional inputs are unavailable.

Exclusion previews count currently eligible **cells**, report newly failing and newly unknown
cells separately, and show neighbourhoods losing all eligible cells. Near misses have exactly
one failing Must, complete other hard information, and satisfied commutes. Tolerances: 2 grade
percentage points, 100 m access distance, or 60 reported incidents/km²/year. They remain excluded;
the UI explains that relaxing that Must to Important makes them feasible. No automatic relaxation.

Explanations follow the same saved order, show measured values and thresholds, and compare a
criterion's band against the median **measured eligible cell**. No unsupported comparisons are
made for missing values. H3-8 incident values are repeated context with the original source id;
they are not independent H3-9 observations. Pollutants and rents are not ranking criteria.
