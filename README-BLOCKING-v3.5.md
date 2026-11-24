# ATLAS v3.5 — Six Reusable Blocking Patterns

Open a saved wall → BLOCKING ELEVATION. Arrange the blocking runs, select one of the six pattern slots, give it a name, and press **SAVE / UPDATE SLOT**. This saves a reusable copy without replacing the wall's blocking.

To reuse, open another saved wall, select a saved pattern, and press **APPLY PATTERN**. Normally it replaces the blocking in the editor (not on the saved wall until **SAVE BLOCKING**). Check **Keep existing wall blocking** first to add the pattern's runs instead. All applied rows receive new IDs and B-### labels so they are editable on their new wall.

To edit a pattern, apply it to a wall, edit the blocking rows, then press **SAVE / UPDATE SLOT** and confirm overwriting the slot. **DELETE SLOT** removes the template only; saved walls are not altered.

Patterns preserve material type, start, length, bottom AFF position, TOP/CENTER/BOTTOM reference, and stock length, plus the stud-face setting. They retain their measurements (they do not stretch proportionally to the new wall). Any runs extending past the wall are clipped, and invalid/outside runs are omitted; always inspect the elevation and material takeoff after applying.

**Storage:** Patterns are held in local browser storage for this installed app/device. They are *not* part of project backups or automatically shared to other devices. Clearing browser/site data may erase patterns; do not use these slots as the sole archive of critical layouts. Existing project backup data and blocking runs are unchanged.

After updating GitHub Pages, open the Android app online once to refresh the offline cache. Back up existing projects first.
