# ATLAS Estimating v3.0 — Cabinet Blocking Elevation Editor

## New feature: wood blocking BETWEEN studs

This is the full Android-only ATLAS takeoff application, built on **v2.9.4** (scrolling, native fullscreen, wall/door takeoff, ACT and Rigid X ceiling systems, live purple drywall hatch, TAPE measurement, dark/light mode, and PDF reports). The new `blocking-editor.js` file must be uploaded together with the existing application files.

### Start a blocking elevation

1. Open your DXF, confirm the unit setting / scale, and select a wall line.
2. Enter the wall properties and press **Save Wall**. Blocking can only be attached to saved walls.
3. Press **BLOCKING ELEVATION** in Selected Wall, or use **Blocking** beside the wall in the Wall Markups list.
4. The wall elevation uses the selected wall's length, height, and stud spacing. Existing door openings show as dark interruptions.
5. Press **+ ADD BLOCKING** to create a horizontal backing zone (default 2x6, bottom at 4 ft AFF; this is only an editable starting value).
6. Grab the orange zone to **move** it up/down or left/right. Grab either **white end handle** to extend or shrink it.
7. Edit **Start (ft), Zone Length (ft), Bottom Elevation AFF (ft), Wood size, Stock Length**, or the optional block label for precise positioning. Click / tap out of a changed field to apply it.
8. The **Snap ends to stud centers** toggle helps align run endpoints to stud locations. **Stud face width** is editable (default 1.5 in, appropriate for many wood studs; confirm actual stud orientation / face dimensions).
9. Add as many horizontal zones as needed (up to 100 per wall), choose an existing zone from **Blocking markups** to edit, or select one and **Remove** it.
10. Press **SAVE BLOCKING**. The selected wall receives a small `B × N` mark on the floor plan. Save the project or download its backup.

### How material is estimated

- Each horizontal zone is split into individual **clear lengths between adjacent stud centers**, subtracting half the entered stud face width on either side. Example: at 16 in O.C. and 1.5 in face width, a fully covered bay typically requires a **14.5 in** piece.
- If a zone only reaches partway across a bay, the run calculates a shorter piece. The drawing shows each physical cut separately in orange.
- For saved door openings, a bay that intersects the rough door width *and* occurs below its rough opening head is omitted. Recheck actual jamb-adjacent blocking: the nominal stud grid does not model every king/jack/jamb member.
- Materials are grouped by wood size and nominal stock length. A first-fit decreasing stock-bin estimate plus a nominal 5% **linear footage allowance** produces a preliminary stock-pieces estimate. This is not a manufacturing cut list or guaranteed material order; field cutting/offcut reuse can change requirements.
- The **Material Summary**, **Material Summary PDF**, **Wall CSV**, **project save**, and **project backup** include the new blocking records and quantities. The wall PDF adds a **Cabinet Blocking Markup Schedule**, listed wall by wall.
- Nonblocking wall, door, ACT, Rigid X, drywall, scrolling, fullscreen, and tape calculations have not intentionally been changed.

### Installation on Android

1. **Before replacing files**, use ATLAS > Options > Download Project Backup for any important jobs. Browser data is stored on the device, not on GitHub.
2. Upload the **entire v3.0 Android folder contents** to the same dedicated Android GitHub Pages repository. Include `blocking-editor.js`; don't mix the separate iPad source in this directory.
3. Open the site's `android.html` in Chrome while online. Refresh once, then fully close and reopen the installed Android app so the new offline cache activates.
4. Test with one saved wall. Verify the elevation heights and cut quantities before using materials for a real estimate.

### Design and estimating cautions

- This is a **takeoff aid**, not engineered cabinet fastening or backing design. Blocking heights, wood sizes, continuity, anchorage, fasteners, and load-support requirements must follow approved plans, shop drawings, and project specifications.
- The elevation is a readable schematic and may not have identical x/y scaling on screen. Numeric distances are based on saved wall dimensions.
- Check corners, returns, structural studs, double studs, special jamb framing, plumbing cavities, and irregular conditions before ordering.
- The drawn location of a wood piece does not mean its attachment has been structurally verified.

## Testing performed

- JavaScript syntax validation on all application scripts.
- Simulated Chromium browser interaction: loaded a DXF, saved a wall, opened Blocking Elevation, added a zone, edited the dimensions, saved, and checked material summary, PDF output, and project backup.
- Unit check: a 12 ft wall at 16 in O.C. with 1.5 in stud face width gives six 2x6 cut pieces and 7.25 LF for an 8 ft-long zone aligned to stud centers. Adding a 3 ft wide 7 ft high door reduces pieces at a 4 ft AFF blocking height.
- Actual physical Android-device touch/gestures and jobsite drawings still require field testing.
