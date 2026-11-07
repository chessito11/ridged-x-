# ATLAS Estimating v2.9 — TAPE Measure (Android)

This is the complete Android package, based on ATLAS v2.8.1 (including enlarged hanger-wire dots).

## New: independent temporary tape tool

1. Open a DXF. Check DXF units under OPTIONS or calibrate Scale 1 / Scale 2 first.
2. Tap **📏 TAPE** in the top toolbar or in full-screen mode.
3. Tap a starting point on the drawing, then tap the ending point.
4. See the distance drawn on the plan and in the floating readout, in feet / inches / sixteenths.
5. Tap a third point to start another distance. Use **CLEAR** to erase the temporary line.
6. **Snap** is on by default: nearby DXF endpoints take priority, then line points. Uncheck to measure free points.
7. Drag with one finger to pan; pinch with two fingers to zoom. The measurement stays anchored to DXF geometry.
8. **COPY** copies the completed measurement to the device clipboard (if the browser permits clipboard access).
9. **EXIT** returns to the normal drawing selection mode and leaves the last measurement visible until CLEAR.

This is a two-point, straight-line tape only. It does not add walls, ceiling areas, material items, or persistent project markups. Measurements are temporary and are cleared when you open a different drawing or project.

**Important**: If a DXF has unknown units, the interface warns you to verify them or calibrate before trusting measurements. Verify a known dimension in the field; the tape is based on the drawing's scale, not laser-measured real-world distance.

## Update

Back up current projects first. Replace the published Android folder with this complete package; launch `android.html` over HTTPS. Reload once online to pick up the new service worker, then reopen the installed application. Do not mix iPad files into the Android folder.

## Testing status

Syntax and offline-file checks are run as part of packaging. Touchscreen validation on a physical Android device is recommended.
