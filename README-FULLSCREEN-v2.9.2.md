# ATLAS Estimating v2.9.2 — Native Fullscreen Fix

Built from the **complete v2.9.1 Android package** (with tape and drawing DARK ON/OFF).

## Behavior

- On supported browsers, the viewer requests true browser fullscreen (hides the browser frame).
- The Android launcher loads ATLAS in a same-origin `iframe`. In this case the fullscreen request is made on that parent `iframe` and the inner viewer fills the newly fullscreen frame. This preserves access to the drawing tools.
- Opening `index.html` directly requests native fullscreen on the viewer itself.
- If the browser denies the Fullscreen API, CSS page-filling mode remains available. It cannot hide the browser bars.
- Exit from the fullscreen toolbar or ESC returns to the normal viewer. Browser-native exits are synchronized with the ATLAS button.
- Pinch zoom, pan, TAPE, TRACE, ACT/Rigid X grids, and DARK ON/OFF are unchanged.

## Install

Back up saved projects via `OPTIONS > Download Project Backup`. Upload the full contents of the version folder to your existing Android repo, open `android.html` online in Chrome, reload, then fully close and reopen the installed ATLAS icon. Keep iPad Tape Layout separate.

## Notes

- Native fullscreen behavior depends on browser support and site permissions. On iPad Safari, CSS mode may remain the only supported mode.
- This update does not alter project data, calculations, the ceiling grid, drywall hatch, or material reports.
