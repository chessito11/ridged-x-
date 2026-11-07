# ATLAS Estimating v2.8 - Rigid X + Live Drywall Board Layout

This is an Android-only **complete** ATLAS source folder. It contains the wall/door takeoff, previous ACT ceiling estimator, the Rigid X / drywall suspension ceiling mode and offline CSV/PDF reports. The former ACT ceiling layout remains selectable. All components are locally run in the browser; production Android installation uses HTTPS.

## What's new

**Rigid X / drywall suspension ceiling** is a new **Ceiling system** selector inside the existing CEILING panel. It stores each area as a numbered C-001 / C-002 ... markup alongside existing ACT takeoffs. RX areas show:

- Main suspension tees (amber): choose 4 ft or 6 ft OC; nominal 12 ft main-piece order estimate.
- Cross tees (cyan): select 16 or 24 inches OC; estimated nominal 4 ft or 6 ft cross-piece counts (matching selected main spacing).
- Hanger wires (pink marks) at configurable 24, 36 or 48 inches along mains, and 10 ft wall angle ordering.
- Drywall sheet locations shaded purple, with light hatch for cut pieces; optional outline-only and hidden views independent of framing.
- Board locations labeled G1, G2, ... inside all displayed ceiling boards when there is enough room at the current zoom.
- Editable board width, board length, thickness, 1/2 layers, 0/90-degree direction and optional alternating half-sheet stagger. Suggested dimensions include 4x8, 4x10, 4x12, 4x14 and 4x16 ft, but width and length inputs can be customized within their allowed ranges.
- Separate gypsum X/Y offsets let you fine tune board seams relative to framing; MOVE GRID moves the entire ceiling grid and board layout over the pre-drawn DXF. Pinch-to-zoom remains a viewer zoom, not a rescale of the 4-ft / 6-ft geometry.
- A takeoff material summary including ceiling area, main/tee LF, approximate purchase pieces with waste, hangers, wall angle, gypsum board positions and board SF. PDF and CSV exports include both ACT and Rigid X assemblies, grouped by system and board size.

## Workflow

1. **Backup first.** Export important jobs with OPTIONS > Download Project Backup. Old browser records are stored on the Android device/browser, not in the hosting repository.
2. Publish the **whole** `ATLAS-Ceiling-Android-v2.8` folder on your Android static HTTPS site (typically your dedicated Android GitHub Pages project). Upload `drywall-ceiling.js` alongside every other file, not just HTML/JS replacements.
3. In Android Chrome, open `android.html` online, reload once if necessary, then fully close and reopen the installed ATLAS icon. The service-worker version changed to refresh all offline files.
4. Open an ASCII DXF. Verify dimensions with the units selector or existing scale calibration.
5. Tap **CEILING**, select **RIGID X - drywall suspension grid**. Keep the chosen board size and spacing in the form.
6. If the ceiling outline already exists in DXF, select **PICK DXF OUTLINE** and tap it. For a rectangle choose **2 CORNERS**. Otherwise use **+ NEW CEILING AREA** and trace the area, then CLOSE CEILING.
7. Choose board size, layer count, tee spacing and direction. On the plan, see **amber mains + cyan cross tees + transparent purple boards with light diagonal hatch on cut pieces** and **G1/G2** sheet location marks. Switch ACT on a different ceiling area if needed.
8. Use **MOVE GRID** and drag the selected room to align both frameworks to the RCP; pinching zooms. If only board seams need to move, adjust **Drywall X/Y offset** without altering framing coordinates. Rotate the overall ceiling with Rotation degrees.
9. Use **CEILING PDF** or **Ceiling CSV**, or the original **DOWNLOAD MATERIAL SUMMARY PDF** button inside Material Summary to include walls and all ceiling types.
10. Save Project / Download Project Backup for portability.

## Critical estimating notes

Rigid X is a drywall suspension-grid family, **not** conventional visible acoustical tile grid. The 4 ft / 6 ft main and cross tee choices are configurable *conceptual layouts*; particular Rigid X components, rated assemblies and installation methods must be confirmed in the project's approved plans/submittals and the exact manufacturer's current literature. Product compatibility, loading, bracing, hanger spacing, perimeter connections and code/fire-rated requirements are **not** verified by this software.

**Drywall location model**: Rectangles show estimated *first-layer* board footprints clipped to the room outline. Stagger offsets joint locations by half a full board dimension in alternating rows/columns depending on sheet orientation. The second layer, if chosen, is included only in the material quantity, **not** in its own drawn joint pattern. G marks are layout references, not physical panel IDs or approved cutting/fastening instructions. A seam can be drawn in a location without a supporting tee; verify support at every edge, butt, and field joint. Fixtures, ducts, openings and columns are not automatically cut out.

**Board orders:** The PDF displays two different material estimates:
- *Area minimum (with waste)* = ceiling SF x number of layers / board SF, rounded up after waste. This is only a mathematical lower bound.
- *Conservative no-offcut-reuse* = every full or cut board location is treated as needing a separate full sheet, multiplied by layers and waste. This is an upper-style takeoff estimate, not a guaranteed purchase upper bound.

Actual ordering should account for piece reuse, edge conditions, transport, installation sequence and waste practices. Member counts use clipped grid line lengths and nominal stock sizes, **not an optimized cut list**. Wires are conceptual support points, not installed quantities required for fixtures, seismic bracing or special structural loads.

## Compatibility/testing

- Existing saved ACT ceilings (without a `system` property) are recognized as ACT. Rigid X ceilings save extra settings as fields inside the existing `ceilings` array in the ATLAS v2 project backup format.
- Previous v2.7: the 20 x 12 ft ceiling and report export were tested with a desktop browser.
- Current v2.8: JavaScript syntax and sample geometric quantities checked. Canvas overlay rendering tested with a mocked 2D context for all four display modes, full/cut fills, G labels, framing visibility and independent toggles. **Full browser testing was unavailable in this build environment**.
- **Not physically tested on an Android phone/tablet**; actual device gestures, installation and offline opening need field verification.

Keep previous version backup before replacement and check project quantities before placing material orders.

## v2.8 live drywall rendering

- **Purple + light hatch on cuts** (default): full boards are shaded translucent purple; partial sheet positions have lighter purple and fine diagonal hatch.
- **Purple shade (all sheets)**: fill every board in shades of purple, without hatching.
- **Outline only**: see board boundaries with no fills.
- **Drywall hidden**: remove board fills, outlines and G labels; framing remains visible if Show Rigid X framing is checked.
- **Show sheet labels**: G1, G2, etc. centered inside boards when enough space exists at current zoom; too-small slivers hide labels for legibility.
- Rendering is clipped to the ceiling boundary and does not alter takeoff counts, board spacing, framing settings, CSV or PDF quantity calculations.
- Older saved jobs without a board display setting use the new default, except jobs which explicitly had sheet display disabled, which continue to hide sheets.

Reminder: the hatch represents a partial *sheet location*, not an exact fabrication-ready cut shape.

## v2.8.1 — Larger hanger-wire dots

- The pink on-drawing hanger-wire location markers are now **3× larger in diameter** (circle radius 2.5 px → 7.5 px).
- Applies to visible hanger-wire points on both ACT and Rigid X ceilings, without changing hanger counts, wire spacing or takeoff formulas.
- Cache version and HTML asset URL updated so the Android installed app reloads the new marker rendering.
- Export saved project backups before updating, and fully close/reopen ATLAS after uploading the complete folder.
