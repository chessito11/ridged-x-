> **Previous ACT v2.6 feature documentation.** For current Rigid X and drywall sheet takeoff functionality in v2.8, see `README-RIGID-X.md`.

# ATLAS Estimating - Android | Live Ceiling Takeoff v2.6

This is a **complete Android-only project folder**, containing ATLAS wall takeoff, doors, ceiling grids, and an offline PDF material report generator. Keep these files together; do not mix them into the iPad source folder.

## New in v2.6

- **PICK DXF OUTLINE:** If the reflected ceiling plan includes a closed DXF polyline or simple closed set of LINE entities, tap inside the drawn ceiling area to select its boundary and calculate its area. Not every imported DXF has recognizable closed loops. If it does not recognize yours, use 2 CORNERS or TRACE.
- **2 CORNERS:** Tap opposite corners of a rectangular ceiling already drawn on the plan; ATLAS creates the rectangular takeoff without tracing all four corners. This is for drawing-axis-aligned rectangles. Use TRACE for angled or irregular rooms.
- **MOVE GRID:** Choose a saved ceiling, enable MOVE GRID, then drag a finger/mouse *inside that room* to slide the live 2x2 or 2x4 grid over the existing RCP. The side panel collapses to expose the plan. Tap CEILING again to return to the controls. Pinch with two fingers to zoom/pan the plan; pinching **does not resize the actual 2-foot or 4-foot material spacing**.
- **Numbered ceiling markups:** Each ceiling has an editable ID (C-001, C-002, etc.) and room/area name, both saved in the project. A number badge is drawn inside the ceiling. Ceiling Markups lists the ID, name, grid size, square feet, FIND and Delete controls. Tap an area on the drawing to select it while the Ceiling panel is active.
- **PDF summaries:** CEILING PDF exports the saved ceiling schedule and combined ceiling material-order estimates. DOWNLOAD MATERIAL SUMMARY PDF (inside the existing Material Summary panel) includes visible wall materials plus all saved ceilings. PDFs download directly without online libraries and can be opened or shared on Android.
- Ceiling CSV now includes the ceiling number, not just the room name.
- Improved two-finger zoom centering for existing drawings.

## Workflow: a pre-drawn room

1. Open `index.html` (Windows browser), or publish the **whole folder** over HTTPS and open `android.html` in Android Chrome.
2. Load a **DXF** (not raw PDF). Verify units; calibrate from a known dimension if necessary. Takeoff quantities cannot be trusted if units/scale are wrong.
3. Tap `CEILING`, choose `PICK DXF OUTLINE`, then tap an existing closed room outline. If DXF shapes are not closed/recognized, use `2 CORNERS` (rectangles) or `+ NEW CEILING AREA` / `CLOSE CEILING` (irregular rooms).
4. Enter/adjust ceiling number and room name, choose `2x2` or `2x4`, and set waste percentage. The main runners and cross tees appear as a live grid over the drawing.
5. Tap `MOVE GRID: OFF` to activate alignment. Drag inside the ceiling until the grid matches the pre-drawn layout. **Pinch to zoom** and inspect perimeter cuts. Tap `CEILING` at the top to reopen the controls. Rotation and 6-inch nudge buttons offer finer adjustment.
6. Create other ceilings. The Ceiling Markups table shows each one. Use `Find` to zoom to a room.
7. Use `Ceiling PDF` for ceiling materials or expand `Material Summary` and use `DOWNLOAD MATERIAL SUMMARY PDF` for walls and ceilings. Export CSV if you need to edit quantities in a spreadsheet.
8. `Save Project` to keep the work on that device. Also use `Download Project Backup` periodically so a browser reset or Android upgrade does not erase the only copy.

## Android update / installation

- **Back up any important jobs before updating.** Publish this *complete v2.6 folder* to your existing dedicated Android repository/HTTPS hosting. Do not upload only `android.html` or only `app.js`.
- Open `android.html` in Chrome once while connected to the internet. If necessary, refresh the site in Chrome and close/reopen the installed ATLAS app to allow the new service-worker cache to activate.
- To install, choose Chrome menu > Install app / Add to Home screen. Open once online for offline caching. Saved projects live in that device's browser storage, not in GitHub.
- Existing v2.5 project backups can be imported. Older ceiling areas without numbers are assigned `C-001`, `C-002`, etc. when opened, while keeping their geometry.

## Quantity assumptions (preliminary)

- Ceiling area and perimeter use each selected/traced polygon. Tile counts include each grid location touched by that polygon, including cut/border locations. A cut tile may not need its own full board in practice; cut-piece reuse is not optimized.
- Standard 4-foot-on-center main runners, 4-foot tees at 2-foot lines, and for 2x2 layouts additional 2-foot infills. Typical main pieces counted as 12-foot stock; wall angle as 10-foot stock. Grid, tee, and wire totals are preliminary; actual systems and takeoff details can differ.
- Hanger points indicate conceptual supports up to 4 feet apart along main runs. Not a complete structural/seismic/fixture bracing layout. Check manufacturer requirements, special supports, and code requirements before ordering or installation.
- Columns, light fixtures, ducts, soffit holes, slopes, and embedded ceiling details are not yet deducted/automatically recognized. The DXF line-based picker does not read arbitrary pre-drawn grids as an exact stock bill; it estimates materials using a real-size grid laid over the picked ceiling boundary.
- The combined PDF wall section uses the existing material summary scope (visible wall layers and any wall AREA SELECT filter); ceiling sections include **all** saved ceiling areas. The PDF reports purchases by summing each area's waste-adjusted, rounded estimated quantities.

ATLAS v2.6 is a field takeoff **prototype**, not a shop drawing or approved ceiling system design. Verify against the reflected ceiling plan and specifications before purchase.
