# ATLAS Estimating v3.1 — Click-to-place blocking and live field dimensions

Built on v3.0, preserving wall/door/ceiling/ACT/Rigid X/tape/scroll/dark/fullscreen/CSV/PDF functionality.

## What's new in the blocking elevation

1. Select a **saved wall** and choose **BLOCKING ELEVATION**. The editor draws actual wall studs and saved door openings.
2. Pick **AFF reference: Bottom, Center, or Top**. This controls which part of the blocking corresponds to a measured height above finished floor.
3. Press **📍 TAP START → END**. Tap the first point **at the desired AFF height** and the beginning of the run. Then tap the second point at the opposite end of the run. The second tap sets the horizontal length only; its vertical position is ignored. For a right-to-left run, ATLAS automatically normalizes the start and end.
4. The new run appears between the saved studs, with individually calculated cut pieces. To place another run, press the button again. Press the active button (or Escape) to cancel incomplete placement.
5. Select any run to see **live elevation dimensions**: the horizontal blocking run length, left-wall offset (when space allows), and a vertical AFF dimension from finished floor to the chosen **top, center, or bottom** reference.
6. **Dimensions** controls the numeric entries and dimension overlays: **Feet** means decimal feet for inputs (on-screen dimension labels show feet/inches to 1/16 in); **Inches** means decimal inches for inputs (labels show inches and fractions to 1/16 in). The wood stock selector remains in feet.
7. Enter exact values in **Start**, **Zone length**, and **AFF elevation** after placement. Values are converted to the saved internal feet coordinates. Changing the AFF reference on a selected run changes *which elevation is displayed*; it does **not** shift the blocking. To set the chosen reference to a specific height, enter that height in the AFF field.
8. Continue to **drag** a zone or its **white end handles**, optionally snapping endpoints to nearby stud centers. To create a run without clicking two points, use **+ ADD BLOCKING** as before.
9. **SAVE BLOCKING**, then **Save Project** and/or **Download Project Backup**. The blocking list and the project/PDF material reports retain the selected AFF reference for each run.

**Note about AFF control and new placement:** When you have an existing blocking run selected, changing AFF reference outside placement mode updates that selected run's annotation. To choose a different reference for a *new* run without changing the selected one, press **TAP START → END** first, then choose the AFF reference before tapping the points.

## What stays compatible

- Blocking is still stored with `elevFt` indicating the **bottom** of each run. New `affReference` is a display/reference field; older backups without it use **bottom AFF** automatically.
- Existing material calculation code is unchanged: each horizontal blocking zone produces separate between-stud cuts (nominal stud face width configurable); door-intersecting bays under rough opening height are omitted.
- Existing wall quantities, ceiling grids, and drywall layouts are untouched. Material takeoff remains **preliminary**, not a structural fastener or cabinet-backup design.

## Android update

1. Before updating, use **OPTIONS → Download Project Backup** for every important job.
2. Upload the **entire v3.1 folder contents** to your Android GitHub Pages site, including `blocking-editor.js`, `app.js`, `index.html`, `style.css`, and `sw-android.js`.
3. Open `android.html` in Android Chrome **while online** and refresh once. Completely close and reopen the installed ATLAS app to activate the new offline cache.
4. Test with an existing saved wall, confirm your original job quantities, then place one sample blocking run by two taps.

## Verification status

- `node --check` passed for every JavaScript file.
- Simulated desktop Chromium exercise passed: imported a sample 12-foot DXF, saved wall W-001, placed B-001 with two clicks, switched feet/inches and AFF center/top, edited AFF exactly, saved, and checked the material summary and project backup.
- Mobile-width Chromium simulation passed: second blocking run created by two taps with the AFF selector displayed at narrow width. JavaScript reported no page errors.
- Legacy record test passed: a 12-foot wall at 16 inches O.C. with 8 feet of 2x6 between-stud blocking returned 6 cuts and 7.25 LF; untagged records defaulted to bottom AFF.
- Real Android device touch testing and jobsite verification still needed.
