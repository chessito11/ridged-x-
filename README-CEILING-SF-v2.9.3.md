# ATLAS Estimating v2.9.3 — Ceiling Number + Square Footage Badge

This update builds directly on v2.9.2 and preserves true/fullscreen fallback, dark/light drawing, TAPE, ACT, Rigid X, gypsum shading/hatching, hanger-wire dots, PDF material reports and saved projects.

## What changed

Every SAVED ceiling shows a two-line badge directly on the DXF drawing:

    C-001
    240 SF

The second line is the calculated area of that ceiling outline in square feet, independent of the ceiling assembly, tile size, drywall layers or waste percentage. It is **not** an added material quantity. Areas are rounded to at most 1 decimal place, e.g. 128.5 SF. It updates with ceiling geometry and drawing calibration. The selected ceiling retains its brighter badge outline.

The ceiling overlay visibility checkbox still hides the entire ceiling overlay (including badges), just as before. No material formulas have been modified.

## Update on Android

1. Back up jobs with OPTIONS > Download Project Backup.
2. Upload the complete contents of this Android folder to your ATLAS Android repository.
3. Open `android.html` in Chrome while online and refresh. Close and reopen the installed app to load the new service-worker cache.
4. Select a saved ceiling and inspect the two-line label on the drawing.

Source change: `app.js`, function `drawCeilingsOverlay`, final takeoff badge drawing block. `sw-android.js` and HTML cache query versions updated so installed Android copies retrieve new code.
