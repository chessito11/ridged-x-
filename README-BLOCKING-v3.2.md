# ATLAS Estimating v3.2 — Tap-to-show blocking dimensions

This release is based on the complete Android v3.1 package, preserving wall/door takeoff, ACT and Rigid X ceiling grids, purple drywall hatch, wire markers, TAPE, dark/light, scrolling, native fullscreen, PDF/CSV and saved-project backup.

## Using the improved blocking elevation

1. Open a saved wall and press **BLOCKING ELEVATION**.
2. Blocking appears between studs with a clean elevation: **no extra length/AFF dimensions are shown automatically**.
3. **Tap an orange blocking row on the elevation**, or its entry in **Blocking markups**. Only that row shows:
   - Blocking run length
   - Start offset from the wall's left end (when space allows)
   - Vertical measurement **from finished floor (AFF)**
   - An explicit **TOP**, **CENTER**, or **BOTTOM** reference for the AFF height
4. Tap the **same row again** (or tap a blank area of the elevation) to hide its dimensions. Tap a different run to move the dimensions to that run.
5. Continue using **drag**, **end handles**, **TAP START → END**, exact feet/inches entry, and AFF-reference selection. Those controls keep their v3.1 behavior.
6. The markup list stays compact to avoid crowding: each row displays its number, wood size, and estimated cut-piece count. Detailed dimensions appear on the elevation when you select a run.
7. Press **SAVE BLOCKING**, then save the ATLAS project or download a project backup.

## Compatibility and fixes

- Fixed the canvas hit-test so fingertip taps on blocking zones match the actual wall-height coordinate system. This improves touch selection on narrow/mobile layouts.
- Tiny fingertip motion under about 5 screen pixels is treated as a tap, not an accidental drag/edit.
- Dimensions are presentation-only and never change quantities. Saved run positions, top/center/bottom AFF preferences, between-stud cuts, material summaries, PDF reports, and prior-project backups remain compatible.

## Installation on Android

1. Back up important jobs from ATLAS before uploading any files.
2. Publish **all files in this v3.2 folder** to the same Android repository (not your separate iPad project). `blocking-editor.js`, `index.html`, `android.html`, `sw-android.js`, and all companion files belong together.
3. Open `android.html` in Android Chrome while online, refresh the page, close the installed app fully, and reopen it to update the offline cache.
4. Open an existing saved wall with two blocking runs. Tap each, tap again to hide, and confirm your quantities match the previous version.

## Verification

- JavaScript syntax and package integrity checked.
- Chromium automated tests on desktop and phone-width viewports passed: no AFF dimension at initial open; tap markup displays top/center AFF; second tap hides; canvas touch selects/deselects; tapping blank clears; saving preserves both blocking records and AFF references.
- A real Android touch-screen field test is still recommended.
