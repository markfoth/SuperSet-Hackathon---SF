# Desktop decision workspace

At widths of 1,100 CSS pixels and above, destinations, commute settings and preferences remain in the left panel. Matches and the selected location remain in the right panel. Each panel scrolls independently. The centre retains the existing full MapLibre canvas, with controls and camera framing placed within the space between the panels.

The search panel ranges from 300 to 350 pixels wide and the results panel from 320 to 390 pixels. At the requested desktop sizes, the space between their visible edges is approximately 595 pixels at 1280 × 800, 674 pixels at 1440 × 900 and 1,148 pixels at 1920 × 1080. Either panel can be collapsed using its chevron and restored using the corresponding map-edge button. Focus on map hides both panels and restores their previous collapsed states when closed.

Destination cards keep travel mode and the one-way limit visible. Person, colour, office days and arrival time share a collapsed settings section. Preferences retain their expandable section and explicit priority order. The results count, sort control and explanation stay visible while the result list scrolls. A selected-place briefing retains its Results back button, and returning restores the list position and card focus.

## Camera behaviour

Framing measures the current visible panel rectangles, including independently collapsed states. The panel class observer preserves the viewed geographical centre and adjusts camera padding when a panel is hidden or restored. Explicit Fit locations includes matching geometry, destinations and prospective home pins. Selecting a district or matching cell fits that selection within the visible map.

MapLibre 6 retains padding set by `easeTo`, such as Show pin. By default, `fitBounds` adds its supplied padding to the retained value. With two panels that can leave no usable fitting width. All explicit bounds fits use the supported `absolutePadding: true` option, which replaces retained padding. The Leaflet compatibility renderer measures the same two panel edges using its own asymmetric fit options.

## Verification

`tests/browser/desktop-layout.spec.ts` covers all three requested desktop sizes, simultaneous criteria/results visibility, independent collapse/restore, independent scrolling, persistent sorting and the Show pin → Fit locations padding regression. Existing `commute-upgrade.spec.ts` covers changing destination labels and actual places, office days, modes, adding/removing destinations, failed routes and stale route responses.

`node scripts/audit_desktop_panels.mjs` captures all three desktop sizes with both panels, each individual collapse, both collapsed and both restored. Its 15-state audit checks destination-pin visibility after an explicit fit and uses browser hit testing to check the map's mode, layer, tilt, rotation and fit controls. The report and real-tile screenshots are in `docs/audit/desktop-panel-framing/`. These are desktop checks; they do not claim a mobile redesign or mobile verification.
