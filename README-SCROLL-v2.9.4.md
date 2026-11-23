# ATLAS Estimating v2.9.4 — SCROLL Drawing Mode

This update is based on the complete Android v2.9.3 source and preserves wall, ACT, Rigid X, tape measurement, ceiling SF badges, PDF/CSV summaries, the DARK switch, and fullscreen.

## How to use

1. Open a drawing; check scale and units.
2. In the drawing's **VIEW** menu, tap **SCROLL OFF** to turn SCROLL ON. In fullscreen the same toggle is in the toolbar.
3. With SCROLL ON, the mouse wheel/trackpad scrolls the DXF drawing up/down; two-finger trackpad motion can scroll left/right. Hold Shift with a mouse wheel for horizontal scroll.
4. On Android, drag the drawing with one finger or use the small ▲ ◀ ▶ ▼ on-screen arrows. Each arrow tap pans by about 110 screen pixels.
5. Ctrl/Command/Alt + wheel zooms while SCROLL is ON; two-finger pinch always zooms. SCROLL OFF restores the usual wheel-to-zoom behavior.
6. SCROLL ON prevents accidental ceiling-grid dragging and takeoff point selection. Turn SCROLL OFF to trace, take dimensions, select a ceiling or move its grid.
7. View/Options dropdown menus can also be scrolled if they exceed screen height. Existing independent takeoff panel scrolling is retained.

This is a view-only setting. Moving the drawing does not change its scale, geometry, or any material quantities. The SCROLL toggle is saved locally on that device.

## Update

Back up each saved project first using OPTIONS > Download Project Backup. Upload the entire Android folder to your repository. Open android.html in Chrome while online, refresh once, then completely close and reopen the installed ATLAS app to allow its new offline cache to activate.
