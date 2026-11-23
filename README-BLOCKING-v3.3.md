# ATLAS v3.3 — Smart Imperial Blocking Dimension Input

The Blocking Elevation Editor now defaults to a single text input for each dimension: start offset, run length, and AFF elevation (Top, Center, or Bottom).

**Example entries:** `10'6"`, `10'-6 1/2"`, `10' 6 1/2"`, `6 3/4"`, `126 1/2"`, `10'`, `10ft 6in`.

When no foot mark is supplied, a number is treated as **inches**. With `10'` the value is ten feet. The app formats saved values as feet, inches, and fractions rounded to 1/16 inch, but stores them internally in decimal feet for material calculations.

Use **Dimensions** to switch between Smart FT/IN/Fraction (default), Decimal feet and Decimal inches. Changing the display mode does not move the blocking. If an invalid dimension is entered, a message appears and the field returns to its previous value.

The existing v3.2 tap-to-show dimension behavior remains: tap a row to show its dimensions, tap again or blank space to hide. Two-click blocking placement and manual drag/resize remain available.

Backup existing jobs before uploading this complete Android-only package. Publish all files, open `android.html` in Chrome while online, refresh, and reopen the installed ATLAS app to activate its updated offline cache. Existing saved project and blocking records remain compatible.
