(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const canvas = $("dxfCanvas");
  const ctx = canvas.getContext("2d");

  const WALL_TYPE_STORAGE_KEY = "atlasTakeoffWallTypesV1";
  const DRAWING_DARK_STORAGE_KEY = "atlasDrawingDarkModeV1";
  function loadDrawingDark() {
    try { return localStorage.getItem(DRAWING_DARK_STORAGE_KEY) !== "off"; }
    catch (_) { return true; }
  }


  function loadWallTypes() {
    try {
      const raw = localStorage.getItem(WALL_TYPE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function persistWallTypes() {
    try {
      localStorage.setItem(WALL_TYPE_STORAGE_KEY, JSON.stringify(state.wallTypes));
      localStorage.setItem("atlasWallLibraryMetaV1",JSON.stringify(state.wallLibrary));
    } catch (err) {
      // The app still works if private browsing/storage blocks persistence.
    }
  }

  const state = {
    fileName: "",
    projectName: "",
    savedProjectId: null,
    projectDirty: false,
    darkDrawing: loadDrawingDark(),
    fullscreenFallback: false,
    fullscreenPersistent: false,
    segments: [],
    ceilings: [],
    ceilingSelected: null,
    ceilingDraft: [],
    ceilingDrawing: false,
    ceilingPickMode: false,
    ceilingRectMode: false,
    ceilingRectDraft: [],
    ceilingMoveMode: false,
    ceilingDragStart: null,
    // Temporary two-point tape measurement, never part of the material takeoff or project file.
    tape: { start: null, end: null, preview: null, snap: true },
    gesturePinched: false,
    selectedId: null,
    placingDoor: false,
    editingDoor: null,
    doorTypes: loadDoorTypes(),
    activeDoorType: "",
    walls: new Map(),
    detectedUnits: null,
    calibration: { activePoint: null, points: [null, null], feetPerUnit: null },
    toolMode: "wall",
    wallTypes: loadWallTypes(),
    wallLibrary: loadWallLibraryMeta(),
    materialLibrary: loadMaterialLibrary(),
    hiddenWallTypes: new Set(),
    hiddenDoorTypes: new Set(),
    activeWallType: "",
    editingWallTypeOriginalName: "",
    trace: { lastPoint: null, locked: false, ortho: false },
    markupCollapsedGroups: new Set(),
    tempArea: {
      selecting: false,
      closed: false,
      points: [],
      wallIds: new Set()
    },
    history: [],
    view: { scale: 1, offsetX: 0, offsetY: 0 },
    bounds: null,
    dragging: false,
    moved: false,
    dragStart: null,
    pointers: new Map(),
    pinchStartDistance: null,
    pinchStartScale: null,
    pinchStartWorld: null
  };

  const INSUNITS = {
    1: "in",
    2: "ft",
    4: "mm",
    5: "cm",
    6: "m"
  };

  function pairDXF(text) {
    const raw = text.replace(/\r/g, "").split("\n");
    const pairs = [];
    for (let i = 0; i + 1 < raw.length; i += 2) {
      pairs.push({ code: Number(raw[i].trim()), value: raw[i + 1].trim() });
    }
    return pairs;
  }

  function detectInsUnits(pairs) {
    for (let i = 0; i < pairs.length - 2; i++) {
      if (pairs[i].code === 9 && pairs[i].value === "$INSUNITS") {
        for (let j = i + 1; j < Math.min(i + 6, pairs.length); j++) {
          if (pairs[j].code === 70) return INSUNITS[Number(pairs[j].value)] || null;
        }
      }
    }
    return null;
  }

  function parseDXF(text) {
    const pairs = pairDXF(text);
    const segments = [];
    const detectedUnits = detectInsUnits(pairs);

    let inEntities = false;
    let id = 1;
    let polyline = null;

    const addSegment = (x1, y1, x2, y2, sourceType, meta = {}) => {
      const nums = [x1, y1, x2, y2].map(Number);
      if (nums.some(v => !Number.isFinite(v))) return;
      const dx = nums[2] - nums[0], dy = nums[3] - nums[1];
      if (Math.hypot(dx, dy) < 1e-9) return;
      segments.push({
        id: id++,
        x1: nums[0], y1: nums[1], x2: nums[2], y2: nums[3],
        sourceType, ...meta
      });
    };

    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i];

      if (p.code === 0 && p.value === "SECTION" && pairs[i + 1]?.code === 2 && pairs[i + 1]?.value === "ENTITIES") {
        inEntities = true;
        i++;
        continue;
      }
      if (inEntities && p.code === 0 && p.value === "ENDSEC") {
        inEntities = false;
        polyline = null;
        continue;
      }
      if (!inEntities || p.code !== 0) continue;

      if (p.value === "LINE") {
        let x1, y1, x2, y2;
        let j = i + 1;
        for (; j < pairs.length && pairs[j].code !== 0; j++) {
          const q = pairs[j];
          if (q.code === 10) x1 = q.value;
          else if (q.code === 20) y1 = q.value;
          else if (q.code === 11) x2 = q.value;
          else if (q.code === 21) y2 = q.value;
        }
        addSegment(x1, y1, x2, y2, "LINE");
        i = j - 1;
      }

      else if (p.value === "LWPOLYLINE") {
        const verts = [];
        let flags = 0, current = null, j = i + 1;
        for (; j < pairs.length && pairs[j].code !== 0; j++) {
          const q = pairs[j];
          if (q.code === 70) flags = Number(q.value);
          else if (q.code === 10) { current = {x:Number(q.value), y:null}; verts.push(current); }
          else if (q.code === 20 && current) current.y = Number(q.value);
        }
        const closed = !!(flags & 1) || (verts.length > 2 &&
          Math.hypot(verts[0].x-verts.at(-1).x,verts[0].y-verts.at(-1).y) < 1e-7);
        const loopId = `DXF-POLY-${id}`;
        for (let k=0;k<verts.length-1;k++) addSegment(verts[k].x,verts[k].y,verts[k+1].x,verts[k+1].y,
          "LWPOLYLINE",{loopId,loopClosed:closed});
        if (closed && verts.length>2) {
          const a=verts.at(-1),b=verts[0];
          if (Math.hypot(a.x-b.x,a.y-b.y)>1e-7) addSegment(a.x,a.y,b.x,b.y,"LWPOLYLINE",{loopId,loopClosed:true});
        }
        i=j-1;
      }

      else if (p.value === "POLYLINE") {
        let flags = 0;
        let j = i + 1;
        for (; j < pairs.length && pairs[j].code !== 0; j++) {
          if (pairs[j].code === 70) flags = Number(pairs[j].value);
        }
        polyline = { verts: [], closed: !!(flags & 1) };
        i = j - 1;
      }

      else if (p.value === "VERTEX" && polyline) {
        let x, y;
        let j = i + 1;
        for (; j < pairs.length && pairs[j].code !== 0; j++) {
          if (pairs[j].code === 10) x = Number(pairs[j].value);
          else if (pairs[j].code === 20) y = Number(pairs[j].value);
        }
        if (Number.isFinite(x) && Number.isFinite(y)) polyline.verts.push({ x, y });
        i = j - 1;
      }

      else if (p.value === "SEQEND" && polyline) {
        const loopId=`DXF-POLY-${id}`;
        const closed = polyline.closed || (polyline.verts.length>2 &&
          Math.hypot(polyline.verts[0].x-polyline.verts.at(-1).x,
            polyline.verts[0].y-polyline.verts.at(-1).y)<1e-7);
        for (let k=0;k<polyline.verts.length-1;k++) {
          const a=polyline.verts[k],b=polyline.verts[k+1];
          addSegment(a.x,a.y,b.x,b.y,"POLYLINE",{loopId,loopClosed:closed});
        }
        if (closed && polyline.verts.length>2) {
          const a=polyline.verts.at(-1),b=polyline.verts[0];
          if(Math.hypot(a.x-b.x,a.y-b.y)>1e-7) addSegment(a.x,a.y,b.x,b.y,"POLYLINE",{loopId,loopClosed:true});
        }
        polyline=null;
      }
    }

    return { segments, detectedUnits };
  }

  function computeBounds(segments) {
    if (!segments.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of segments) {
      minX = Math.min(minX, s.x1, s.x2);
      minY = Math.min(minY, s.y1, s.y2);
      maxX = Math.max(maxX, s.x1, s.x2);
      maxY = Math.max(maxY, s.y1, s.y2);
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }


  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function orient(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  function onSegment(a, b, p) {
    return Math.min(a.x,b.x) - 1e-9 <= p.x && p.x <= Math.max(a.x,b.x) + 1e-9 &&
      Math.min(a.y,b.y) - 1e-9 <= p.y && p.y <= Math.max(a.y,b.y) + 1e-9;
  }

  function segmentsIntersect(a, b, c, d) {
    const o1 = orient(a,b,c), o2 = orient(a,b,d), o3 = orient(c,d,a), o4 = orient(c,d,b);
    if ((o1 > 0 && o2 < 0 || o1 < 0 && o2 > 0) &&
        (o3 > 0 && o4 < 0 || o3 < 0 && o4 > 0)) return true;
    if (Math.abs(o1) < 1e-9 && onSegment(a,b,c)) return true;
    if (Math.abs(o2) < 1e-9 && onSegment(a,b,d)) return true;
    if (Math.abs(o3) < 1e-9 && onSegment(c,d,a)) return true;
    if (Math.abs(o4) < 1e-9 && onSegment(c,d,b)) return true;
    return false;
  }

  function wallInsideTemporaryArea(segment, polygon) {
    const a = {x: segment.x1, y: segment.y1};
    const b = {x: segment.x2, y: segment.y2};
    const mid = {x: (a.x+b.x)/2, y: (a.y+b.y)/2};

    if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon) || pointInPolygon(mid, polygon)) {
      return true;
    }

    for (let i = 0; i < polygon.length; i++) {
      const c = polygon[i];
      const d = polygon[(i+1) % polygon.length];
      if (segmentsIntersect(a,b,c,d)) return true;
    }
    return false;
  }

  function updateTemporaryAreaWalls() {
    state.tempArea.wallIds = new Set();
    if (!state.tempArea.closed || state.tempArea.points.length < 3) return;

    for (const [id] of state.walls) {
      const segment = state.segments.find(s => s.id === id);
      if (segment && wallInsideTemporaryArea(segment, state.tempArea.points)) {
        state.tempArea.wallIds.add(id);
      }
    }
  }

  function updateTemporaryAreaUI() {
    const count = state.tempArea.points.length;
    const closed = state.tempArea.closed;

    $("areaSelectBtn").classList.toggle("active-tool", state.tempArea.selecting);
    $("areaSelectBtn").textContent = state.tempArea.selecting ? `POINT ${Math.min(count+1,4)} / 4` : "AREA SELECT";
    $("closeAreaBtn").disabled = count < 3 || closed;
    $("clearTempAreaBtn").disabled = !count && !closed;

    $("fsAreaSelectBtn").classList.toggle("active-tool", state.tempArea.selecting);
    $("fsAreaSelectBtn").textContent = state.tempArea.selecting ? `POINT ${Math.min(count+1,4)} / 4` : "AREA SELECT";
    $("fsCloseAreaBtn").disabled = count < 3 || closed;
    $("fsClearTempAreaBtn").disabled = !count && !closed;
  }

  function startTemporaryAreaSelection() {
    if (!state.segments.length) {
      alert("Open a DXF drawing first.");
      return;
    }
    if (state.toolMode === 'tape') { state.toolMode = 'wall'; state.tape.preview = null; updateToolUI(); }
    state.ceilingDrawing=false;state.ceilingDraft=[];updateCeilingStats();
    state.tempArea = {
      selecting: true,
      closed: false,
      points: [],
      wallIds: new Set()
    };
    if ($("viewerOptionsMenu")) $("viewerOptionsMenu").open = false;
    $("hintbar").textContent = "AREA SELECT: tap corner 1 of 4.";
    updateTemporaryAreaUI();
    refreshTemporaryAreaTotals();
    draw();
  }

  function addTemporaryAreaPoint(screenX, screenY) {
    if (!state.tempArea.selecting || state.tempArea.closed) return false;
    if (state.tempArea.points.length >= 4) return true;

    const world = screenToWorld(screenX, screenY);
    state.tempArea.points.push({x: world.x, y: world.y});

    const count = state.tempArea.points.length;
    if (count < 4) {
      $("hintbar").textContent = `AREA SELECT: tap corner ${count+1} of 4.`;
    } else {
      state.tempArea.selecting = false;
      $("hintbar").textContent = "4 area points selected • press CLOSE AREA for temporary totals.";
    }

    updateTemporaryAreaUI();
    draw();
    return true;
  }

  function closeTemporaryArea() {
    if (state.tempArea.points.length < 3) return;
    state.tempArea.closed = true;
    state.tempArea.selecting = false;
    updateTemporaryAreaWalls();
    updateTemporaryAreaUI();
    refreshTables();
    refreshTemporaryAreaTotals();
    draw();

    const count = state.tempArea.wallIds.size;
    $("hintbar").textContent = `AREA CLOSED • ${count} saved wall${count === 1 ? "" : "s"} included in temporary totals.`;
  }

  function clearTemporaryArea() {
    state.tempArea = {
      selecting: false,
      closed: false,
      points: [],
      wallIds: new Set()
    };
    updateTemporaryAreaUI();
    refreshTables();
    refreshTemporaryAreaTotals();
    draw();
    $("hintbar").textContent = "Temporary area cleared • full takeoff totals restored.";
  }

  function getTemporaryAreaWalls(walls) {
    if (!state.tempArea.closed) return walls;
    updateTemporaryAreaWalls();
    return walls.filter(w => state.tempArea.wallIds.has(w.segmentId));
  }

  function refreshTemporaryAreaTotals() {
    const el = $("temporaryAreaTotals");
    if (!el) return;

    if (!state.tempArea.closed) {
      el.className = "temporary-area-totals muted";
      el.textContent = state.tempArea.points.length
        ? `${state.tempArea.points.length} area point${state.tempArea.points.length === 1 ? "" : "s"} selected • press CLOSE AREA`
        : "No temporary area closed.";
      return;
    }

    const walls = getTemporaryAreaWalls([...state.walls.values()]);
    let studs = 0;
    let lf = 0;
    for (const w of walls) {
      studs += Number(w.studQty || 0);
      lf += Number(w.lengthFt || 0);
    }

    el.className = "temporary-area-totals";
    el.innerHTML = `
      <div class="temp-total-card"><span>Walls</span><strong>${walls.length}</strong></div>
      <div class="temp-total-card"><span>Studs</span><strong>${studs}</strong></div>
      <div class="temp-total-card"><span>Linear Feet</span><strong>${lf.toFixed(1)} LF</strong></div>
    `;
  }

  function applyDrawingTheme() {
    document.body.classList.toggle('drawing-light', !state.darkDrawing);
    for (const id of ['drawingDarkBtn', 'fsDrawingDarkBtn']) {
      const button = $(id);
      if (!button) continue;
      button.textContent = state.darkDrawing ? 'DARK ON' : 'DARK OFF';
      button.setAttribute('aria-pressed', String(state.darkDrawing));
      button.title = state.darkDrawing ? 'Dark drawing is on; tap for white background' : 'Dark drawing is off; tap for dark background';
    }
    draw();
  }

  function toggleDrawingDark() {
    state.darkDrawing = !state.darkDrawing;
    try { localStorage.setItem(DRAWING_DARK_STORAGE_KEY, state.darkDrawing ? 'on' : 'off'); }
    catch (_) { /* Continue without persistence if device storage is blocked. */ }
    applyDrawingTheme();
  }

  $('drawingDarkBtn').addEventListener('click', toggleDrawingDark);
  $('fsDrawingDarkBtn').addEventListener('click', toggleDrawingDark);

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function fitDrawing() {
    if (!state.bounds) return;
    const rect = canvas.getBoundingClientRect();
    const pad = 35;
    const worldW = Math.max(state.bounds.width, 1);
    const worldH = Math.max(state.bounds.height, 1);
    const sx = (rect.width - pad * 2) / worldW;
    const sy = (rect.height - pad * 2) / worldH;
    state.view.scale = Math.max(0.0001, Math.min(sx, sy));
    state.view.offsetX = pad - state.bounds.minX * state.view.scale;
    state.view.offsetY = pad + state.bounds.maxY * state.view.scale;
    draw();
  }

  function worldToScreen(x, y) {
    return {
      x: x * state.view.scale + state.view.offsetX,
      y: state.view.offsetY - y * state.view.scale
    };
  }

  function screenToWorld(x, y) {
    return {
      x: (x - state.view.offsetX) / state.view.scale,
      y: (state.view.offsetY - y) / state.view.scale
    };
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = state.darkDrawing ? "#090b0e" : "#f9fafc";
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (!state.segments.length) return;

    ctx.lineCap = "round";
    for (const s of state.segments) {
      const savedWall = state.walls.get(s.id);
      const hidden = savedWall && state.hiddenWallTypes.has(savedWall.wallType || "");
      if (hidden && s.sourceType === "MANUAL_WALL") continue;
      const a = worldToScreen(s.x1, s.y1);
      const b = worldToScreen(s.x2, s.y2);
      const isSelected = !hidden && s.id === state.selectedId;
      const wall = hidden ? null : savedWall;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      const inTempArea = state.tempArea.closed && state.tempArea.wallIds.has(s.id);
      ctx.lineWidth = isSelected ? 4 : (wall ? (inTempArea ? 3.2 : 2.4) : 1);
      ctx.strokeStyle = isSelected ? (state.darkDrawing ? "#ffd166" : "#ab6d00") :
        (wall ? (inTempArea ? (state.darkDrawing ? "#65d68a" : "#138244") : (state.darkDrawing ? "#4da3ff" : "#136fb8")) :
        (state.darkDrawing ? "#d8dde5" : "#333d49"));
      ctx.stroke();

      if (wall) {
        drawStudDots(s, wall, isSelected, inTempArea);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        ctx.font = "12px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const text = wall.wallNumber;
        const metrics = ctx.measureText(text);
        const w = metrics.width + 10;
        ctx.fillStyle = state.darkDrawing ? "#11151b" : "#e9f1fa";
        ctx.fillRect(mx - w/2, my - 9, w, 18);
        ctx.fillStyle = state.darkDrawing ? "#9fd0ff" : "#115c9b";
        ctx.fillText(text, mx, my);
      }
    }

    // Door layers are independent of wall layers and are painted above wall marks.
    for (const segment of state.segments) {
      const wall=state.walls.get(segment.id);
      if(wall) drawDoorOverlay(segment,wall);
    }
    drawCeilingsOverlay();
    drawTemporaryAreaOverlay();
    drawCalibrationOverlay();
    drawTraceOverlay();
    drawTapeOverlay();
  }


  // TAPE v2.9: Temporary 2-point measurements. No material qty or project state changes.
  function tapePoint(sx, sy) {
    return state.tape.snap ? nearestCalibrationPoint(sx, sy) : screenToWorld(sx, sy);
  }

  function tapeLengthFt(end = state.tape.end || state.tape.preview) {
    return state.tape.start && end
      ? rawPointDistance(state.tape.start, end) * activeFeetPerUnit() : null;
  }

  function updateTapeUI() {
    const active = state.toolMode === 'tape';
    for (const id of ['tapeModeBtn', 'fsTapeBtn']) {
      const btn = $(id);
      if (!btn) continue;
      btn.classList.toggle('active-tool', active);
      btn.setAttribute('aria-pressed', String(active));
      btn.textContent = active ? '📏 TAPE ✓' : '📏 TAPE';
    }
    const t = state.tape;
    $('tapeReadout').hidden = !active && !t.start;
    $('tapeSnapCheck').checked = t.snap;
    const feet = tapeLengthFt();
    $('tapeDistance').textContent = feet === null ? '—' : formatFeetInches(feet);
    $('tapeCopyBtn').disabled = !t.end;
    $('tapeStep').textContent = !t.start ? 'Tap first point' : !t.end ? 'Tap ending point' : 'Tap again for new tape';
    const calibrated = Number.isFinite(state.calibration.feetPerUnit) && state.calibration.feetPerUnit > 0;
    const unverified = !calibrated && !state.detectedUnits && $('unitSelect').value === 'auto';
    $('tapeScaleNote').textContent = unverified ? '⚠ Verify DXF units or calibrate' : calibrated ? 'Using calibrated drawing scale' : `DXF units: ${currentUnit()} (verify scale)`;
  }

  function activateTapeMode() {
    if (!state.segments.length) { alert('Open a DXF drawing first.'); return; }
    if (state.toolMode === 'tape') {
      state.tape.preview = null;
      activateWallMode(false);
      $('hintbar').textContent = 'TAPE OFF • last measurement remains until CLEAR';
      updateTapeUI();
      draw();
      return;
    }
    // Other modes must not steal tape taps; keep ceiling entities and saved walls untouched.
    clearCeilingModes();
    state.tempArea.selecting = false;
    updateTemporaryAreaUI();
    state.placingDoor = false;
    updateDoorModeUI();
    state.trace.locked = false;
    state.trace.lastPoint = null;
    state.calibration.activePoint = null;
    hideCalibrationPanel();
    closeMoreMenu();
    state.toolMode = 'tape';
    state.tape.preview = null;
    updateToolUI();
    updateTraceUI();
    updateTapeUI();
    $('hintbar').textContent = state.tape.end ? 'TAPE: tap to begin a new distance • drag pans • pinch zooms' :
      state.tape.start ? 'TAPE: tap ending point • drag pans • pinch zooms' :
        'TAPE: tap start, then tap end • drag pans • pinch zooms';
    draw();
  }

  function clearTape() {
    state.tape.start = null;
    state.tape.end = null;
    state.tape.preview = null;
    updateTapeUI();
    if (state.toolMode === 'tape') $('hintbar').textContent = 'TAPE CLEARED • tap first point';
    draw();
  }

  function tapTapePoint(sx, sy) {
    const p = tapePoint(sx, sy);
    if (!state.tape.start || state.tape.end) {
      state.tape.start = p;
      state.tape.end = null;
      state.tape.preview = null;
      $('hintbar').textContent = 'TAPE: starting point set • tap ending point';
    } else if (rawPointDistance(state.tape.start, p) > 1e-9) {
      state.tape.end = p;
      state.tape.preview = null;
      $('hintbar').textContent = `TAPE: ${formatFeetInches(tapeLengthFt())} • tap for a new measurement, or CLEAR`;
    } else {
      $('hintbar').textContent = 'TAPE: ending point must differ from starting point';
    }
    updateTapeUI();
    draw();
  }

  function drawTapeOverlay() {
    const t = state.tape;
    if (!t.start) return;
    const a = worldToScreen(t.start.x, t.start.y);
    const end = t.end || (state.toolMode === 'tape' ? t.preview : null);
    ctx.save();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#ffd166';
    ctx.fillStyle = '#ffd166';
    ctx.setLineDash(end && !t.end ? [7, 5] : []);
    if (end) {
      const b = worldToScreen(end.x, end.y);
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      ctx.setLineDash([]);
      const theta = Math.atan2(b.y-a.y,b.x-a.x);
      for (const [p,sign] of [[a,1],[b,-1]]) {
        ctx.beginPath();
        ctx.moveTo(p.x+10*Math.cos(theta+sign*.55)*sign,p.y+10*Math.sin(theta+sign*.55)*sign);
        ctx.lineTo(p.x,p.y);
        ctx.lineTo(p.x+10*Math.cos(theta-sign*.55)*sign,p.y+10*Math.sin(theta-sign*.55)*sign);
        ctx.stroke();
      }
      const text = formatFeetInches(tapeLengthFt(end));
      ctx.font = 'bold 13px system-ui';
      const w = ctx.measureText(text).width+20;
      const rect = canvas.getBoundingClientRect();
      const mx = Math.max(w/2+8,Math.min(rect.width-w/2-8,(a.x+b.x)/2));
      const my = Math.max(20,Math.min(rect.height-20,(a.y+b.y)/2-18));
      ctx.fillStyle = 'rgba(14,18,26,.94)';
      ctx.strokeStyle = '#e7b95c';ctx.lineWidth = 1.2;
      ctx.beginPath();ctx.roundRect(mx-w/2,my-12,w,24,6);ctx.fill();ctx.stroke();
      ctx.fillStyle = '#ffdc83';ctx.textAlign = 'center';ctx.textBaseline = 'middle';
      ctx.fillText(text,mx,my);
      ctx.fillStyle = '#ffd166';
    }
    ctx.setLineDash([]);
    for (const p of end ? [a,worldToScreen(end.x,end.y)] : [a]) {
      ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);
      ctx.fillStyle = '#ffd166';ctx.fill();
      ctx.strokeStyle = '#222';ctx.lineWidth = 1.8;ctx.stroke();
    }
    ctx.restore();
  }

  $('tapeModeBtn').addEventListener('click', activateTapeMode);
  $('fsTapeBtn').addEventListener('click', activateTapeMode);
  $('tapeClearBtn').addEventListener('click', clearTape);
  $('tapeExitBtn').addEventListener('click', () => {
    if (state.toolMode === 'tape') activateTapeMode();
    else { clearTape(); }
  });
  $('tapeSnapCheck').addEventListener('change', (e) => {
    state.tape.snap = e.target.checked;
    state.tape.preview = null;
    updateTapeUI();draw();
  });
  $('tapeCopyBtn').addEventListener('click', async () => {
    if (!state.tape.end) return;
    const s = formatFeetInches(tapeLengthFt());
    try { await navigator.clipboard.writeText(s); $('tapeStep').textContent = 'Copied'; }
    catch (_) { $('tapeStep').textContent = 'Clipboard unavailable'; }
  });

  $("showStudDots").addEventListener("change", draw);

  function drawStudDots(segment, wall, selected, inArea) {
    if (!$("showStudDots").checked) return;
    const a = worldToScreen(segment.x1, segment.y1);
    const b = worldToScreen(segment.x2, segment.y2);
    const distance = Math.hypot(b.x-a.x, b.y-a.y);
    if (!distance) return;
    const nx = -(b.y-a.y)/distance, ny = (b.x-a.x)/distance;
    const rect = canvas.getBoundingClientRect();
    ctx.save();
    for (const mark of AtlasQuantities.studPositions(wall)) {
      const t = mark.at/wall.lengthFt;
      const x = a.x+(b.x-a.x)*t, y = a.y+(b.y-a.y)*t;
      if (x < -20 || y < -20 || x > rect.width+20 || y > rect.height+20) continue;
      const color = mark.kind === "wood" ? "#ffb45c" :
        mark.kind === "jamb" ? "#e9a7ff" : selected ? "#ffd166" : inArea ? "#65d68a" : "#9fd0ff";
      for (let i=0; i<mark.count; i++) {
        // Multiple members share a station; separate their symbols across the line.
        const offset = mark.kind === "end" ? 7 : (i-(mark.count-1)/2)*7;
        ctx.beginPath();
        ctx.arc(x+nx*offset, y+ny*offset, 3, 0, Math.PI*2);
        ctx.fillStyle = mark.kind === "cripple" ? (state.darkDrawing ? "#090b0e" : "#f9fafc") : color;
        ctx.strokeStyle = mark.kind === "cripple" ? color : (state.darkDrawing ? "#090b0e" : "#2a3441");
        ctx.lineWidth = 1.2;
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawTemporaryAreaOverlay() {
    const pts = state.tempArea.points;
    if (!pts.length) return;

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = state.tempArea.closed ? "#65d68a" : "#f4c95d";
    ctx.fillStyle = state.tempArea.closed ? "rgba(101,214,138,.10)" : "rgba(244,201,93,.06)";
    ctx.setLineDash(state.tempArea.closed ? [] : [7,5]);

    ctx.beginPath();
    pts.forEach((p, i) => {
      const s = worldToScreen(p.x, p.y);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });

    if (state.tempArea.closed && pts.length >= 3) {
      ctx.closePath();
      ctx.fill();
    }
    ctx.stroke();
    ctx.setLineDash([]);

    pts.forEach((p, i) => {
      const s = worldToScreen(p.x, p.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5, 0, Math.PI*2);
      ctx.fillStyle = "#11151b";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = state.tempArea.closed ? "#65d68a" : "#f4c95d";
      ctx.stroke();

      ctx.font = "bold 10px system-ui";
      ctx.fillStyle = state.tempArea.closed ? "#8ef0aa" : "#ffe399";
      ctx.fillText(String(i+1), s.x+7, s.y-7);
    });

    ctx.restore();
  }

  function drawTraceOverlay() {
    if (state.toolMode !== "trace" || !state.trace.lastPoint) return;
    const p = worldToScreen(state.trace.lastPoint.x, state.trace.lastPoint.y);
    ctx.save();
    ctx.fillStyle = "#ff9f43";
    ctx.strokeStyle = "#11151b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#11151b";
    ctx.font = "bold 10px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("•", p.x, p.y);
    ctx.restore();
  }

  function drawCalibrationOverlay() {
    const pts = state.calibration.points;
    const entries = pts
      .map((p, i) => p ? { p, index: i } : null)
      .filter(Boolean);
    if (!entries.length) return;

    ctx.save();
    ctx.strokeStyle = "#50e3c2";
    ctx.fillStyle = "#50e3c2";
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);

    if (pts[0] && pts[1]) {
      const a = worldToScreen(pts[0].x, pts[0].y);
      const b = worldToScreen(pts[1].x, pts[1].y);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.setLineDash([]);
    entries.forEach(({ p, index }) => {
      const s = worldToScreen(p.x, p.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#081310";
      ctx.font = "bold 11px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(index + 1), s.x, s.y);
      ctx.fillStyle = "#50e3c2";
    });
    ctx.restore();
  }

  function baseFeetPerUnit() {
    return unitToFeetFactor(currentUnit());
  }

  function activeFeetPerUnit() {
    return state.calibration.feetPerUnit || baseFeetPerUnit();
  }

  function rawPointDistance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function nearestCalibrationPoint(screenX, screenY) {
    let bestEndpoint = null;
    let endpointDistance = 18;
    let bestOnLine = null;
    let lineDistance = 16;

    for (const s of state.segments) {
      const a = worldToScreen(s.x1, s.y1);
      const b = worldToScreen(s.x2, s.y2);

      const da = Math.hypot(screenX - a.x, screenY - a.y);
      if (da < endpointDistance) {
        endpointDistance = da;
        bestEndpoint = { x: s.x1, y: s.y1 };
      }
      const db = Math.hypot(screenX - b.x, screenY - b.y);
      if (db < endpointDistance) {
        endpointDistance = db;
        bestEndpoint = { x: s.x2, y: s.y2 };
      }

      const abx = b.x - a.x, aby = b.y - a.y;
      const len2 = abx * abx + aby * aby;
      if (len2 > 0) {
        let t = ((screenX - a.x) * abx + (screenY - a.y) * aby) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = a.x + t * abx, py = a.y + t * aby;
        const d = Math.hypot(screenX - px, screenY - py);
        if (d < lineDistance) {
          lineDistance = d;
          bestOnLine = {
            x: s.x1 + t * (s.x2 - s.x1),
            y: s.y1 + t * (s.y2 - s.y1)
          };
        }
      }
    }

    return bestEndpoint || bestOnLine || screenToWorld(screenX, screenY);
  }

  function nearestWallEndpoint(screenX, screenY) {
    let best = null;
    let bestDistance = 24;

    for (const s of state.segments) {
      if (s.sourceType === "MANUAL_WALL") continue;
      const candidates = [
        { x: s.x1, y: s.y1 },
        { x: s.x2, y: s.y2 }
      ];
      for (const p of candidates) {
        const sp = worldToScreen(p.x, p.y);
        const d = Math.hypot(screenX - sp.x, screenY - sp.y);
        if (d < bestDistance) {
          bestDistance = d;
          best = p;
        }
      }
    }
    return best;
  }

  function wallTemplateFromForm() {
    return {
      height: Number($("wallHeight").value),
      studSize: $("studSize").value,
      gauge: $("gauge").value,
      spacing: Number($("spacing").value),
      topTrack: $("topTrack").value,
      bottomTrack: $("bottomTrack").value,
      doubleEnds: $("doubleEnds").checked,
      wastePercent: Number($("wastePercent").value) || 0
    };
  }

  function applyWallTemplate(template) {
    if (!template) return;
    $("wallHeight").value = String(template.height ?? 10);
    $("studSize").value = template.studSize || '3-5/8"';
    $("gauge").value = template.gauge || "20ga";
    $("spacing").value = String(template.spacing ?? 16);
    $("topTrack").value = template.topTrack || "Standard";
    $("bottomTrack").value = template.bottomTrack || "Standard";
    $("doubleEnds").checked = !!template.doubleEnds;
    $("wastePercent").value = Number(template.wastePercent ?? 0);
    updateCalcPreview();
  }

  function updateCurrentTypeBadge() {
    const name = state.activeWallType || "Unassigned";
    const el = $("currentTypeBadge");
    el.textContent = `TYPE: ${name}`;
    const t = state.wallTypes[state.activeWallType];
    el.title = t
      ? `${name} • ${t.studSize} ${t.gauge} @ ${t.spacing}" O.C. • Height ${t.height}'`
      : "No saved wall type selected; trace walls will be unassigned.";
    el.classList.toggle("type-assigned", !!t);
    $("fsCurrentTypeBadge").textContent = `TYPE: ${name}`;
    $("fsCurrentTypeBadge").title = el.title;
    $("fsCurrentTypeBadge").classList.toggle("type-assigned", !!t);
  }

  function setActiveWallType(name, applyToCurrent = false) {
    state.activeWallType = name && state.wallTypes[name] ? name : "";
    $("activeWallTypeSelect").value = state.activeWallType;
    updateCurrentTypeBadge();

    if (applyToCurrent && state.selectedId) {
      $("wallTypeSelect").value = state.activeWallType;
      if (state.activeWallType) applyWallTemplate(state.wallTypes[state.activeWallType]);
    }
  }

  function calculateWallFromTemplate(segment, template) {
    return AtlasQuantities.wallQuantities(segmentLengthFeet(segment), template, template.doors || []);
  }

  function updateWallsUsingType(oldName, newName, template) {
    pushTakeoffHistory();
    for (const [id, wall] of state.walls.entries()) {
      if ((wall.wallType || "") !== oldName) continue;
      const seg = state.segments.find(s => s.id === id);
      if (!seg) continue;
      const c = calculateWallFromTemplate(seg, { ...template, doors: wall.doors || [] });
      wall.wallType = newName;
      wall.height = Number(template.height);
      wall.studSize = template.studSize;
      wall.gauge = template.gauge;
      wall.spacing = Number(template.spacing);
      wall.topTrack = template.topTrack;
      wall.bottomTrack = template.bottomTrack;
      wall.doubleEnds = !!template.doubleEnds;
      wall.wastePercent = Number(template.wastePercent) || 0;
      wall.lengthFt = c.lengthFt;
      wall.studQty = c.studQty;
      wall.trackFt = c.trackFt;
      Object.assign(wall, c);
      wall.assemblyParts = structuredClone(template.assemblyParts || []);
    }
  }

  function openWallTypeEditor(name) {
    if (!canEditWallLibrary()) return;
    if ($("wallTypePanel") && "open" in $("wallTypePanel")) $("wallTypePanel").open = true;
    const t = name ? state.wallTypes[name] : wallTemplateFromForm();
    if (!t) return;
    state.editingWallTypeOriginalName = name || "";
    $("wallTypeEditorTitle").textContent = name ? "Edit Wall Assembly" : "New Wall Assembly";
    $("deleteWallTypeEditorBtn").disabled = !name;
    $("editTypeName").value = name || "";
    $("editTypeHeight").value = String(t.height ?? 10);
    $("editTypeStudSize").value = t.studSize || '3-5/8"';
    $("editTypeGauge").value = t.gauge || "20ga";
    $("editTypeSpacing").value = String(t.spacing ?? 16);
    $("editTypeTopTrack").value = t.topTrack || "Standard";
    $("editTypeBottomTrack").value = t.bottomTrack || "Standard";
    $("editTypeDoubleEnds").checked = !!t.doubleEnds;
    $("editTypeWaste").value = Number(t.wastePercent ?? 0);
    $("editTypeUpdateExisting").checked = true;
    $("wallTypeEditorStatus").textContent = name ? `${name} is ready to edit.` : "Name your new assembly.";
    renderAssemblyParts(t.assemblyParts || []);
    refreshMaterialLibrary();
    $("partsLibraryStatus").textContent = "Choose a library part, or add a custom part and save it to your own folder. Accessory factors start at 0; enter your required quantity factor.";
    $("wallTypeEditorDialog").classList.remove("hidden");
  }

  function closeWallTypeEditor() {
    $("wallTypeEditorDialog").classList.add("hidden");
    $("wallTypeEditorStatus").textContent = "";
  }

  function editorTemplateFromFields() {
    return {
      height: Number($("editTypeHeight").value),
      studSize: $("editTypeStudSize").value,
      gauge: $("editTypeGauge").value,
      spacing: Number($("editTypeSpacing").value),
      topTrack: $("editTypeTopTrack").value,
      bottomTrack: $("editTypeBottomTrack").value,
      doubleEnds: $("editTypeDoubleEnds").checked,
      wastePercent: Number($("editTypeWaste").value) || 0,
      assemblyParts: readAssemblyParts()
    };
  }

  function saveWallTypeEditor() {
    if (!canEditWallLibrary()) return;
    const oldName = state.editingWallTypeOriginalName;
    if (oldName && !state.wallTypes[oldName]) {
      $("wallTypeEditorStatus").textContent = "That wall type is no longer available.";
      return;
    }
    const newName = $("editTypeName").value.trim();
    if (!newName) {
      $("wallTypeEditorStatus").textContent = "Enter a wall type name.";
      return;
    }
    if (newName !== oldName && state.wallTypes[newName]) {
      $("wallTypeEditorStatus").textContent = `A wall type named ${newName} already exists.`;
      return;
    }

    const template = editorTemplateFromFields();
    if (!Number.isFinite(template.wastePercent) || template.wastePercent < 0 || template.wastePercent > 30 ||
        template.assemblyParts.some(p => !p.name || !p.unit || !Number.isFinite(p.factor) || p.factor < 0 ||
          !Number.isFinite(p.wastePercent) || p.wastePercent < 0 || p.wastePercent > 100)) {
      $("wallTypeEditorStatus").textContent = "Each part needs a name, unit, a nonnegative factor, and waste between 0 and 100%.";
      return;
    }
    if (template.assemblyParts.some(part => !validPartFormula(part))) {
      $("wallTypeEditorStatus").textContent = "Coverage and spacing need a positive rate. Spacing requires a length, top/bottom track, or door perimeter base.";
      return;
    }
    if (oldName && $("editTypeUpdateExisting").checked) {
      try {
        for (const wall of state.walls.values()) {
          if (wall.wallType === oldName) AtlasQuantities.wallQuantities(wall.lengthFt, template, wall.doors || []);
        }
      } catch (err) { $("wallTypeEditorStatus").textContent = err.message; return; }
    }
    const updateExisting = $("editTypeUpdateExisting").checked;

    if (newName !== oldName) {
      delete state.wallTypes[oldName];
      if (state.hiddenWallTypes.delete(oldName)) state.hiddenWallTypes.add(newName);
    }
    state.wallTypes[newName] = template;

    if (oldName && updateExisting) {
      updateWallsUsingType(oldName, newName, template);
    } else if (oldName && newName !== oldName) {
      // A rename should still keep existing wall assignments meaningful even if
      // assembly values are not being pushed to them.
      for (const wall of state.walls.values()) {
        if ((wall.wallType || "") === oldName) wall.wallType = newName;
      }
    }

    if (!oldName || state.activeWallType === oldName) state.activeWallType = newName;
    persistWallTypes();
    markProjectDirty();
    refreshWallTypeUI();
    refreshTables();
    setActiveWallType(state.activeWallType, !!state.selectedId);
    if (state.selectedId && state.walls.has(state.selectedId)) selectSegment(state.selectedId);
    closeWallTypeEditor();
  }

  function deleteWallTypeFromEditor() {
    if (!canEditWallLibrary()) return;
    const name = state.editingWallTypeOriginalName;
    if (!name || !state.wallTypes[name]) return;
    const usedCount = [...state.walls.values()].filter(w => (w.wallType || "") === name).length;
    const note = usedCount
      ? ` ${usedCount} existing wall${usedCount === 1 ? " is" : "s are"} assigned to it; those walls will keep their current saved framing values but become Unassigned.`
      : "";
    if (!confirm(`Delete wall type ${name}?${note}`)) return;

    delete state.wallTypes[name];
    for (const wall of state.walls.values()) {
      if ((wall.wallType || "") === name) wall.wallType = "";
    }
    if (state.activeWallType === name) state.activeWallType = "";
    persistWallTypes();
    markProjectDirty();
    refreshWallTypeUI();
    refreshTables();
    closeWallTypeEditor();
  }

  function loadWallLibraryMeta() {
    try {
      const meta=JSON.parse(localStorage.getItem("atlasWallLibraryMetaV1")||"null");
      return {name:typeof meta?.name==="string"?meta.name:"Current project wall library",locked:meta?.locked!==false};
    } catch (_) {return {name:"Current project wall library",locked:true};}
  }
  function canEditWallLibrary() {
    if(!state.wallLibrary.locked)return true;
    alert("This project's wall library is locked. Press Unlock Library to change its types.");
    return false;
  }
  function refreshWallLibraryUI() {
    $("wallLibraryName").textContent=state.wallLibrary.name;
    $("wallLibraryStatus").textContent=state.wallLibrary.locked ?
      "LOCKED — type definitions protected" : "UNLOCKED — editing enabled";
    const button=$("toggleWallLibraryLockBtn");
    button.textContent=state.wallLibrary.locked?"Unlock Library":"Lock Library";
    button.setAttribute("aria-pressed",String(state.wallLibrary.locked));
    for(const id of ["newAssemblyBtn","saveWallTypeBtn","deleteWallTypeBtn","renameWallLibraryBtn",
      "saveWallTypeEditorBtn","deleteWallTypeEditorBtn"]) $(id).disabled=state.wallLibrary.locked;
  }
  $("toggleWallLibraryLockBtn").addEventListener("click",()=>{
    state.wallLibrary.locked=!state.wallLibrary.locked;
    persistWallTypes();markProjectDirty();refreshWallTypeUI();
    if(state.wallLibrary.locked)closeWallTypeEditor();
  });
  $("renameWallLibraryBtn").addEventListener("click",()=>{
    if(!canEditWallLibrary())return;
    const name=prompt("Project wall library name:",state.wallLibrary.name)?.trim();
    if(!name)return;
    state.wallLibrary.name=name.slice(0,100);
    persistWallTypes();markProjectDirty();refreshWallTypeUI();
  });
  $("newWallLibraryBtn").addEventListener("click",()=>{
    const name=prompt("Name the new project's wall library:","New project wall library")?.trim();
    if(!name)return;
    if(!confirm("Start an empty wall library? Save Project or download a backup first to keep the current project's library. Existing walls keep their saved materials and quantities; their type assignments will become Unassigned."))return;
    // Detach assignments to prevent a new designer's W1 from overwriting old W1 walls.
    pushTakeoffHistory();
    state.history[state.history.length-1].libraryBefore={
      types:structuredClone(state.wallTypes),meta:structuredClone(state.wallLibrary),
      active:state.activeWallType,hidden:[...state.hiddenWallTypes]
    };
    for(const wall of state.walls.values())wall.wallType="";
    state.wallTypes={};state.activeWallType="";
    state.wallLibrary={name:name.slice(0,100),locked:false};
    state.hiddenWallTypes.clear();
    closeWallTypeEditor();persistWallTypes();markProjectDirty();
    refreshWallTypeUI();refreshTables();draw();
  });

  function refreshWallTypeUI() {
    refreshWallLibraryUI();
    refreshWallLayers();
    const names = Object.keys(state.wallTypes).sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));
    const selects = [$("activeWallTypeSelect"), $("wallTypeSelect")];

    for (const select of selects) {
      if (!select) continue;
      const current = select.id === "activeWallTypeSelect"
        ? state.activeWallType
        : select.value;
      select.innerHTML = '<option value="">Unassigned</option>';
      for (const name of names) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      }
      select.value = names.includes(current) ? current : "";
    }

    updateCurrentTypeBadge();
    $("wallTypeCountBadge").textContent = `${names.length} type${names.length === 1 ? "" : "s"}`;
    $("editActiveWallTypeBtn").disabled = state.wallLibrary.locked || !state.activeWallType || !state.wallTypes[state.activeWallType];

    const list = $("wallTypeLibraryList");
    if (!names.length) {
      list.className = "summary-list muted";
      list.textContent = "No wall types saved yet.";
      return;
    }

    list.className = "summary-list";
    list.innerHTML = "";
    for (const name of names) {
      const t = state.wallTypes[name];
      const group = document.createElement("div");
      group.className = "summary-group type-card";
      group.innerHTML = `
        <div class="summary-title type-card-title"><span>${escapeHtml(name)}</span><button class="type-edit-btn" type="button">Edit</button></div>
        <div class="summary-item"><span>Stud</span><span>${escapeHtml(t.studSize)} ${escapeHtml(t.gauge)} @ ${t.spacing}" O.C.</span></div>
        <div class="summary-item"><span>Height</span><span>${escapeHtml(String(t.height))}'</span></div>
        <div class="summary-item"><span>Additional materials</span><span>${(t.assemblyParts || []).length} parts</span></div>
        <div class="summary-item"><span>Track</span><span>${escapeHtml(t.bottomTrack)} / ${escapeHtml(t.topTrack)}</span></div>`;
      group.addEventListener("click", (e) => {
        if (e.target.closest(".type-edit-btn")) return;
        $("wallTypeName").value = name;
        setActiveWallType(name, !!state.selectedId);
        if (state.selectedId) {
          $("wallTypeSelect").value = name;
          applyWallTemplate(t);
        }
      });
      group.querySelector(".type-edit-btn").disabled=state.wallLibrary.locked;
      group.querySelector(".type-edit-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        openWallTypeEditor(name);
      });
      list.appendChild(group);
    }
  }

  function saveWallTypeFromForm() {
    if (!canEditWallLibrary()) return;
    const name = $("wallTypeName").value.trim();
    if (!name) {
      alert("Enter a wall type name first.");
      return;
    }
    state.wallTypes[name] = { ...wallTemplateFromForm(), assemblyParts: structuredClone(state.wallTypes[name]?.assemblyParts || []) };
    persistWallTypes();
    state.activeWallType = name;
    markProjectDirty();
    refreshWallTypeUI();
    setActiveWallType(name, !!state.selectedId);
    if (state.selectedId) $("wallTypeSelect").value = name;
  }

  function deleteWallType() {
    if (!canEditWallLibrary()) return;
    const name = $("wallTypeName").value.trim() || state.activeWallType;
    if (!name || !state.wallTypes[name]) {
      alert("Choose a saved wall type first.");
      return;
    }
    if (!confirm(`Delete wall type ${name}? Existing walls keep their saved takeoff data.`)) return;
    delete state.wallTypes[name];
    markProjectDirty();
    if (state.activeWallType === name) state.activeWallType = "";
    persistWallTypes();
    $("wallTypeName").value = "";
    refreshWallTypeUI();
  }

  function nextManualSegmentId() {
    let max = 0;
    for (const s of state.segments) max = Math.max(max, Number(s.id) || 0);
    return max + 1;
  }

  function updateTraceUI() {
    const traceActive = state.toolMode === "trace";
    const traceBtn = $("traceWallsBtn");
    traceBtn.classList.toggle("active-tool", traceActive);
    traceBtn.setAttribute("aria-pressed", traceActive ? "true" : "false");
    traceBtn.textContent = traceActive ? "STOP ■" : "TRACE ▶";

    $("traceLockBtn").classList.toggle("active-tool", !!state.trace.locked);
    $("traceLockBtn").classList.toggle("trace-paused", traceActive && !state.trace.locked);
    $("traceLockBtn").setAttribute("aria-pressed", state.trace.locked ? "true" : "false");
    $("traceLockBtn").textContent = state.trace.locked ? "LOCK ✓" : "LOCK";

    $("orthoLockBtn").classList.toggle("active-tool", !!state.trace.ortho);
    $("orthoLockBtn").setAttribute("aria-pressed", state.trace.ortho ? "true" : "false");
    $("orthoLockBtn").textContent = state.trace.ortho ? "ORTHO ✓" : "ORTHO";

    syncFullscreenTools();

    const typeText = state.activeWallType ? ` • ${state.activeWallType}` : " • Unassigned";
    const orthoText = state.trace.ortho ? " • ORTHO" : "";

    if (!traceActive) return;

    if (!state.trace.lastPoint) {
      $("hintbar").textContent = `RECORDING: Tap first corner${typeText}${orthoText} • STOP ends this section`;
    } else {
      $("hintbar").textContent = `RECORDING: Tap next corner${typeText}${orthoText} • STOP ends this section`;
    }
  }

  function toggleTraceLock() {
    if (!state.segments.length) {
      alert("Open a DXF drawing first.");
      return;
    }

    state.trace.locked = !state.trace.locked;

    // LOCK OFF means: finish the current trace chain and pause.
    // Clear the last point so LOCK ON starts a brand-new chain elsewhere.
    if (!state.trace.locked) {
      state.trace.lastPoint = null;
    }

    // Remain in TRACE mode. LOCK controls recording only.
    if (state.toolMode !== "trace") {
      state.toolMode = "trace";
      state.calibration.activePoint = null;
      hideCalibrationPanel();
      closeMoreMenu();
    }

    updateToolUI();
    updateTraceUI();
    draw();
  }

  function toggleOrthoLock() {
    if (!state.segments.length) {
      alert("Open a DXF drawing first.");
      return;
    }
    state.trace.ortho = !state.trace.ortho;
    updateToolUI();
    updateTraceUI();
    draw();
  }

  function activateTraceMode() {
    state.placingDoor = false;
    updateDoorModeUI();

    if (!state.segments.length) {
      alert("Open a DXF drawing first.");
      return;
    }

    // PlanSwift-style TRACE toggle:
    // TRACE ON  = record the current wall chain.
    // TRACE OFF = finish this chain and return to normal wall selection.
    // The active wall type and ORTHO setting remain unchanged.
    if (state.toolMode === "trace") {
      const typeText = state.activeWallType ? ` • ${state.activeWallType}` : " • Unassigned";
      const orthoText = state.trace.ortho ? " • ORTHO" : "";

      activateWallMode(false);
      updateTraceUI();
      $("hintbar").textContent = `TRACE STOPPED${typeText}${orthoText} • TRACE ▶ starts a new disconnected section`;
      draw();
      return;
    }

    state.toolMode = "trace";
    state.trace.locked = true;
    state.trace.lastPoint = null;
    state.calibration.activePoint = null;

    hideCalibrationPanel();
    closeMoreMenu();
    selectSegment(null, { preserveMode: true });

    updateToolUI();
    updateCalibrationUI();
    updateTraceUI();
    draw();
  }

  function traceWallPoint(screenX, screenY) {
    if (!state.trace.locked) {
      updateTraceUI();
      return;
    }

    const point = nearestWallEndpoint(screenX, screenY);
    if (!point) {
      $("hintbar").textContent = "TRACE: No corner — tap closer to an endpoint.";
      return;
    }

    if (!state.trace.lastPoint) {
      state.trace.lastPoint = { x: point.x, y: point.y };
      updateTraceUI();
      draw();
      return;
    }

    const a = state.trace.lastPoint;
    const b = { x: point.x, y: point.y };

    // ORTHO LOCK: constrain the new wall to the dominant horizontal or
    // vertical direction from the previous trace point.
    if (state.trace.ortho) {
      const dx = Math.abs(b.x - a.x);
      const dy = Math.abs(b.y - a.y);
      if (dx >= dy) b.y = a.y;
      else b.x = a.x;
    }

    if (rawPointDistance(a, b) < 1e-9) {
      $("hintbar").textContent = "TRACE: Choose a different corner.";
      return;
    }

    pushTakeoffHistory();

    const seg = {
      id: nextManualSegmentId(),
      x1: a.x, y1: a.y,
      x2: b.x, y2: b.y,
      sourceType: "MANUAL_WALL"
    };
    state.segments.push(seg);
    state.trace.lastPoint = { x: b.x, y: b.y };

    selectSegment(seg.id, { preserveMode: true });
    if (state.activeWallType) {
      $("wallTypeSelect").value = state.activeWallType;
      applyWallTemplate(state.wallTypes[state.activeWallType]);
    } else {
      $("wallTypeSelect").value = "";
    }
    saveWallFromForm({ preserveMode: true, skipHistory: true });

    // Stay in TRACE after every wall. LOCK controls recording/pause only.
    state.toolMode = "trace";
    state.trace.lastPoint = { x: b.x, y: b.y };

    updateToolUI();
    updateTraceUI();
    draw();
  }

  function closeMoreMenu() {
    const menu = $("moreMenu");
    if (menu) menu.open = false;
  }

  function showCalibrationPanel() {
    setPanelsVisible(true);
    $("calibrationPanel").classList.remove("setup-panel-hidden");
  }

  function hideCalibrationPanel() {
    $("calibrationPanel").classList.add("setup-panel-hidden");
  }

  function updateToolUI() {
    const wallActive = state.toolMode === "wall";
    const traceActive = state.toolMode === "trace";
    $("wallModeBtn").classList.toggle("active-tool", wallActive);
    $("traceWallsBtn").classList.toggle("active-tool", traceActive);
    $("traceLockBtn").classList.toggle("active-tool", !!state.trace.locked);
    $("traceLockBtn").classList.toggle("trace-paused", traceActive && !state.trace.locked);
    $("traceLockBtn").setAttribute("aria-pressed", state.trace.locked ? "true" : "false");
    $("traceLockBtn").textContent = state.trace.locked ? "LOCK ✓" : "LOCK";
    $("orthoLockBtn").classList.toggle("active-tool", !!state.trace.ortho);
    $("orthoLockBtn").setAttribute("aria-pressed", state.trace.ortho ? "true" : "false");
    $("orthoLockBtn").textContent = state.trace.ortho ? "ORTHO ✓" : "ORTHO";
    syncFullscreenTools();
    updateTapeUI();
    $("selectedWallPanel").classList.toggle("tool-priority", wallActive || traceActive);
    $("calibrationPanel").classList.toggle("tool-priority", !wallActive);

    // Scale buttons still show their own active point state.
    if (wallActive) {
      $("scale1Btn").classList.remove("active-tool");
      $("scale2Btn").classList.remove("active-tool");
    }
  }

  function activateWallMode(scrollPanel = false) {
    state.placingDoor = false;
    updateDoorModeUI();
    state.toolMode = "wall";
    state.trace.locked = false;
    state.trace.lastPoint = null;
    state.calibration.activePoint = null;
    hideCalibrationPanel();
    closeMoreMenu();
    updateToolUI();
    updateCalibrationUI();

    if (scrollPanel && window.innerWidth <= 980) {
      $("selectedWallPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function updateCalibrationUI() {
    const cal = state.calibration;
    const status = $("calibrationStatus");
    const reset = $("resetCalibrationBtn");
    const badge = $("scaleBadge");
    const hint = $("hintbar");
    const has1 = !!cal.points[0];
    const has2 = !!cal.points[1];
    const hasBoth = has1 && has2;

    $("scale1Btn").classList.toggle("active-tool", state.toolMode === "scale" && cal.activePoint === 0);
    $("scale2Btn").classList.toggle("active-tool", state.toolMode === "scale" && cal.activePoint === 1);
    $("scale1Btn").classList.toggle("point-set", has1);
    $("scale2Btn").classList.toggle("point-set", has2);

    $("scale1Status").textContent = has1 ? "Set" : "Not set";
    $("scale2Status").textContent = has2 ? "Set" : "Not set";
    $("applyCalibrationBtn").disabled = !hasBoth;

    if (hasBoth) {
      const raw = rawPointDistance(cal.points[0], cal.points[1]);
      const measured = raw * baseFeetPerUnit();
      $("calibrationMeasured").textContent = formatFeetInches(measured);
    } else {
      $("calibrationMeasured").textContent = "—";
    }

    if (cal.activePoint === 0) {
      status.textContent = "Scale 1 is active. Tap the first point of the known dimension.";
      hint.textContent = "SCALE 1: Tap first point";
    } else if (cal.activePoint === 1) {
      status.textContent = "Scale 2 is active. Tap the second point of the known dimension.";
      hint.textContent = "SCALE 2: Tap second point";
    } else if (hasBoth) {
      status.textContent = cal.feetPerUnit
        ? "Scale 1 and Scale 2 are set. Change the known dimension or either point and Apply again if needed."
        : "Both scale points are set. Enter the known dimension and press Apply Calibration.";
      hint.textContent = "Scale set • WALL to continue";
    } else if (has1 || has2) {
      status.textContent = "One scale point is set. Activate the other Scale button and tap its point.";
      hint.textContent = "Set remaining scale point";
    } else {
      status.textContent = "Set Scale 1 and Scale 2 on a known dimension, then enter the real distance.";
      hint.textContent = "Tap wall • Drag pan • Pinch zoom";
    }

    if (cal.feetPerUnit) {
      reset.classList.remove("hidden");
      badge.textContent = "Scale: Calibrated";
      badge.classList.add("calibrated");
    } else {
      reset.classList.toggle("hidden", !(has1 || has2));
      badge.textContent = "Scale: DXF units";
      badge.classList.remove("calibrated");
    }

    updateToolUI();
    draw();
  }

  function activateScalePoint(index) {
    state.placingDoor = false;
    updateDoorModeUI();
    if (!state.segments.length) {
      alert("Open a DXF drawing first.");
      return;
    }
    state.toolMode = "scale";
    state.trace.locked = false;
    state.trace.lastPoint = null;
    showCalibrationPanel();
    closeMoreMenu();
    state.calibration.activePoint =
      state.calibration.activePoint === index ? null : index;
    selectSegment(null);
    updateCalibrationUI();
  }

  function cancelCalibration() {
    state.calibration.activePoint = null;
    updateCalibrationUI();
  }

  function applyCalibration() {
    if (!state.calibration.points[0] || !state.calibration.points[1]) {
      alert("Set both Scale 1 and Scale 2 first.");
      return;
    }
    const feet = Math.max(0, Number($("calibrationFeet").value) || 0);
    const inches = Math.max(0, Number($("calibrationInches").value) || 0);
    const actualFeet = feet + inches / 12;
    if (!(actualFeet > 0)) {
      alert("Enter an actual distance greater than zero.");
      return;
    }
    const raw = rawPointDistance(state.calibration.points[0], state.calibration.points[1]);
    if (!(raw > 0)) {
      alert("Scale 1 and Scale 2 are too close together.");
      return;
    }
    if (!validateScaleForDoors(actualFeet / raw)) return;
    markProjectDirty();
    state.calibration.feetPerUnit = actualFeet / raw;
    state.calibration.activePoint = null;
    state.toolMode = "wall";
    hideCalibrationPanel();
    recalcAllWallsForUnits();
    updateCalibrationUI();
  }

  function resetCalibration() {
    if (!validateScaleForDoors(baseFeetPerUnit())) return;
    markProjectDirty();
    state.calibration.activePoint = null;
    state.calibration.points = [null, null];
    state.calibration.feetPerUnit = null;
    state.toolMode = "wall";
    hideCalibrationPanel();
    recalcAllWallsForUnits();
    updateCalibrationUI();
  }

  function currentUnit() {
    const selected = $("unitSelect").value;
    return selected === "auto" ? (state.detectedUnits || "in") : selected;
  }

  function unitToFeetFactor(unit) {
    return {
      in: 1 / 12,
      ft: 1,
      mm: 1 / 304.8,
      cm: 1 / 30.48,
      m: 3.280839895
    }[unit] || 1 / 12;
  }

  function segmentLengthFeet(segment) {
    const raw = Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
    return raw * activeFeetPerUnit();
  }

  function formatFeetInches(feet) {
    if (!Number.isFinite(feet)) return "—";
    let totalInches = feet * 12;
    let wholeFeet = Math.floor(totalInches / 12);
    let inches = totalInches - wholeFeet * 12;
    inches = Math.round(inches * 16) / 16;
    if (inches >= 12) { wholeFeet += 1; inches = 0; }
    const wholeIn = Math.floor(inches);
    const frac = inches - wholeIn;
    const fractions = [
      [0, ""], [1/16, "1/16"], [1/8, "1/8"], [3/16, "3/16"], [1/4, "1/4"],
      [5/16, "5/16"], [3/8, "3/8"], [7/16, "7/16"], [1/2, "1/2"],
      [9/16, "9/16"], [5/8, "5/8"], [11/16, "11/16"], [3/4, "3/4"],
      [13/16, "13/16"], [7/8, "7/8"], [15/16, "15/16"]
    ];
    let fracText = "";
    for (const [v, txt] of fractions) if (Math.abs(frac - v) < 0.001) fracText = txt;
    const inchText = fracText ? `${wholeIn || ""}${wholeIn ? " " : ""}${fracText}` : `${wholeIn}`;
    return `${wholeFeet}'-${inchText}"`;
  }

  function calcWall(segment) {
    return calculateWallFromTemplate(segment, { ...wallTemplateFromForm(), doors: state.walls.get(segment.id)?.doors || [] });
  }

  function updateCalcPreview() {
    const s = state.segments.find(x => x.id === state.selectedId);
    if (!s) return;
    let c;
    try { c = calcWall(s); } catch (err) { $("calcStuds").textContent = err.message; return; }
    $("wallLength").value = formatFeetInches(c.lengthFt);
    $("calcStuds").textContent = `${c.studQty} pcs`;
    $("calcBottom").textContent = $("bottomTrack").value === "None" ? "None" : `${c.bottomTrackFt.toFixed(2)} LF`;
    $("calcTop").textContent = $("topTrack").value === "None" ? "None" : `${c.trackFt.toFixed(2)} LF`;
  }

  function nextWallNumber() {
    let max = 0;
    for (const wall of state.walls.values()) {
      const m = String(wall.wallNumber).match(/(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `W-${String(max + 1).padStart(3, "0")}`;
  }

  function selectSegment(id, options = {}) {
    state.selectedId = id;
    const seg = state.segments.find(s => s.id === id);
    if (!seg) {
      $("wallForm").classList.add("hidden");
      $("selectionEmpty").classList.remove("hidden");
      updateSelectedActionButtons();
      draw();
      return;
    }
    if (!options.preserveMode) {
      state.toolMode = "wall";
      state.trace.lastPoint = null;
      state.calibration.activePoint = null;
    }
    $("wallForm").classList.remove("hidden");
    $("selectionEmpty").classList.add("hidden");
    if ($("selectedWallPanel") && "open" in $("selectedWallPanel")) {
      $("selectedWallPanel").open = true;
    }
    updateToolUI();

    const wall = state.walls.get(id);
    if (wall) {
      $("wallNumber").value = wall.wallNumber;
      $("wallTypeSelect").value = wall.wallType || "";
      $("wallHeight").value = String(wall.height);
      $("studSize").value = wall.studSize;
      $("gauge").value = wall.gauge;
      $("spacing").value = String(wall.spacing);
      $("topTrack").value = wall.topTrack;
      $("bottomTrack").value = wall.bottomTrack;
      $("doubleEnds").checked = wall.doubleEnds;
      $("wastePercent").value = wall.wastePercent;
    } else {
      $("wallNumber").value = nextWallNumber();
      $("wallTypeSelect").value = state.activeWallType || "";
      $("wallHeight").value = "10";
      $("studSize").value = '3-5/8"';
      $("gauge").value = "20ga";
      $("spacing").value = "16";
      $("topTrack").value = "Standard";
      $("bottomTrack").value = "Standard";
      $("doubleEnds").checked = false;
      $("wastePercent").value = "0";
      if (state.activeWallType && state.wallTypes[state.activeWallType]) {
        applyWallTemplate(state.wallTypes[state.activeWallType]);
      }
    }
    updateCalcPreview();
    refreshWallDoors();
    updateSelectedActionButtons();
    draw();
    updateMarkupSelectionHighlight();
  }

  function updateSelectedActionButtons() {
    const hasSavedWall = !!state.selectedId && state.walls.has(state.selectedId);
    $("findSelectedBtn").disabled = !hasSavedWall;
    $("deleteSelectedBtn").disabled = !hasSavedWall;

    const wall = hasSavedWall ? state.walls.get(state.selectedId) : null;
    $("findSelectedBtn").title = wall ? `Find ${wall.wallNumber}` : "Select a saved wall first";
    $("deleteSelectedBtn").title = wall ? `Delete ${wall.wallNumber}` : "Select a saved wall first";
  }

  function updateMarkupSelectionHighlight() {
    document.querySelectorAll("#wallTable tbody tr").forEach(tr => {
      tr.classList.toggle("selected-markup", Number(tr.dataset.segmentId) === state.selectedId);
    });
  }

  function pointSegmentDistance(px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay;
    const apx = px - ax, apy = py - ay;
    const len2 = abx*abx + aby*aby;
    if (len2 === 0) return Math.hypot(px-ax, py-ay);
    let t = (apx*abx + apy*aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const x = ax + t*abx, y = ay + t*aby;
    return Math.hypot(px-x, py-y);
  }

  function pickSegment(screenX, screenY) {
    let best = null, bestD = 14;
    for (const s of state.segments) {
      const wall = state.walls.get(s.id);
      if (wall && state.hiddenWallTypes.has(wall.wallType || "")) continue;
      const a = worldToScreen(s.x1, s.y1), b = worldToScreen(s.x2, s.y2);
      const d = pointSegmentDistance(screenX, screenY, a.x, a.y, b.x, b.y);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (best) {
      selectSegment(best.id);
      if (window.innerWidth <= 980) {
        $("selectedWallPanel").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  function snapshotTakeoff() {
    return {
      walls: structuredClone([...state.walls.entries()]),
      manualSegments: state.segments
        .filter(s => s.sourceType === "MANUAL_WALL")
        .map(s => ({ ...s })),
      selectedId: state.selectedId
    };
  }

  function pushTakeoffHistory() {
    markProjectDirty();
    state.history.push(snapshotTakeoff());
    if (state.history.length > 50) state.history.shift();
    updateUndoButton();
  }

  function updateUndoButton() {
    const btn = $("undoLastBtn");
    if (!btn) return;
    btn.disabled = state.history.length === 0;
    btn.textContent = state.history.length ? `Undo Last (${state.history.length})` : "Undo Last";
  }

  function undoLastTakeoff() {
    markProjectDirty();
    const snap = state.history.pop();
    if (!snap) return;
    if(snap.libraryBefore) {
      state.wallTypes=snap.libraryBefore.types;
      state.wallLibrary=snap.libraryBefore.meta;
      state.activeWallType=snap.libraryBefore.active;
      state.hiddenWallTypes=new Set(snap.libraryBefore.hidden);
      persistWallTypes();refreshWallTypeUI();
    }

    state.walls = new Map(snap.walls.map(([id, wall]) => [Number(id), { ...wall }]));
    state.segments = state.segments.filter(s => s.sourceType !== "MANUAL_WALL");
    for (const s of snap.manualSegments) state.segments.push({ ...s });

    state.selectedId = null;
    state.trace.lastPoint = null;
    refreshTables();

    if (snap.selectedId && state.segments.some(s => s.id === snap.selectedId)) {
      selectSegment(snap.selectedId);
    } else {
      selectSegment(null);
    }
    updateUndoButton();
    draw();
  }

  function focusWallSegment(id) {
    const seg = state.segments.find(s => s.id === id);
    const wall = state.walls.get(id);
    if (!seg || !wall) return;
    if (state.hiddenWallTypes.delete(wall.wallType || "")) {
      markProjectDirty();
      refreshWallLayers();
      refreshMaterialSummary([...state.walls.values()]);
    }

    // Keep Trace Lock preference, but FIND itself switches interaction to WALL
    // only for the selected markup; it does not delete or alter the trace chain.
    const wasLocked = state.trace.locked;
    state.toolMode = "wall";
    state.trace.lastPoint = null;
    selectSegment(id, { preserveMode: true });
    state.trace.locked = wasLocked;

    const rect = canvas.getBoundingClientRect();
    const worldLength = Math.max(
      Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1),
      1e-9
    );

    // Put the selected wall at a useful Bluebeam-like viewing size:
    // about 55% of the viewer's smaller dimension, but never zoom out
    // below the current drawing-fit usability range unnecessarily.
    const targetPixels = Math.max(180, Math.min(rect.width, rect.height) * 0.55);
    const desiredScale = targetPixels / worldLength;

    // Allow FIND to zoom in/out, but cap extreme zoom values.
    state.view.scale = Math.max(0.00001, Math.min(1e7, desiredScale));

    const mx = (seg.x1 + seg.x2) / 2;
    const my = (seg.y1 + seg.y2) / 2;
    state.view.offsetX = rect.width / 2 - mx * state.view.scale;
    state.view.offsetY = rect.height / 2 + my * state.view.scale;

    $("hintbar").textContent = `FOUND: ${wall.wallNumber}${wall.wallType ? ` • ${wall.wallType}` : ""}`;
    updateToolUI();
    updateTraceUI();
    updateSelectedActionButtons();
    draw();
  }

  function deleteWallById(id, ask = false) {
    const wall = state.walls.get(id);
    if (!wall) return;

    if (ask && !confirm(`Delete ${wall.wallNumber}${wall.wallType ? ` (${wall.wallType})` : ""}?`)) return;

    pushTakeoffHistory();

    const seg = state.segments.find(s => s.id === id);
    state.walls.delete(id);

    if (seg && seg.sourceType === "MANUAL_WALL") {
      state.segments = state.segments.filter(s => s.id !== id);
    }

    if (state.selectedId === id) {
      state.selectedId = null;
      selectSegment(null);
    }

    refreshTables();
    updateSelectedActionButtons();
    draw();
  }

  function refreshMarkupsFilter(walls) {
    const filter = $("markupsTypeFilter");
    if (!filter) return;
    const current = filter.value;
    const types = [...new Set(walls.map(w => w.wallType || "Unassigned"))]
      .sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));

    filter.innerHTML = '<option value="">All types</option>';
    for (const type of types) {
      const opt = document.createElement("option");
      opt.value = type;
      opt.textContent = type;
      filter.appendChild(opt);
    }
    filter.value = types.includes(current) ? current : "";
  }

  function refreshTables() {
    refreshDoorTypeCounts();
    refreshDoorLayers();
    refreshWallLayers();
    const tbody = $("wallTable").querySelector("tbody");
    tbody.innerHTML = "";

    const walls = [...state.walls.values()].sort((a,b) => {
      const ta = a.wallType || "ZZZ-Unassigned";
      const tb = b.wallType || "ZZZ-Unassigned";
      return ta.localeCompare(tb, undefined, {numeric:true}) ||
        a.wallNumber.localeCompare(b.wallNumber, undefined, {numeric:true});
    });

    refreshMarkupsFilter(walls);
    const filterValue = $("markupsTypeFilter")?.value || "";
    const visibleWalls = filterValue
      ? walls.filter(w => (w.wallType || "Unassigned") === filterValue)
      : walls;

    const grouped = new Map();
    for (const wall of visibleWalls) {
      const type = wall.wallType || "Unassigned";
      if (!grouped.has(type)) grouped.set(type, []);
      grouped.get(type).push(wall);
    }

    for (const [type, groupWalls] of grouped) {
      const collapsed = state.markupCollapsedGroups.has(type);

      const groupRow = document.createElement("tr");
      groupRow.className = "markup-group-row";
      groupRow.dataset.group = type;
      groupRow.innerHTML = `
        <td colspan="7">
          <button class="markup-group-toggle" type="button" aria-expanded="${collapsed ? "false" : "true"}">
            <span class="markup-group-chevron">${collapsed ? "▶" : "▼"}</span>
            <strong>${escapeHtml(type)}</strong>
            <span>${groupWalls.length} wall${groupWalls.length === 1 ? "" : "s"}</span>
          </button>
        </td>`;

      groupRow.querySelector(".markup-group-toggle").addEventListener("click", () => {
        if (state.markupCollapsedGroups.has(type)) state.markupCollapsedGroups.delete(type);
        else state.markupCollapsedGroups.add(type);
        refreshTables();
      });

      tbody.appendChild(groupRow);

      if (collapsed) continue;

      for (const w of groupWalls) {
        const tr = document.createElement("tr");
        tr.dataset.segmentId = String(w.segmentId);
        if (w.segmentId === state.selectedId) tr.classList.add("selected-markup");

        tr.innerHTML = `
          <td><strong>${escapeHtml(w.wallNumber)}</strong></td>
          <td>${escapeHtml(w.wallType || "—")}</td>
          <td>${escapeHtml(formatFeetInches(w.lengthFt))}</td>
          <td>${escapeHtml(String(w.height))}'</td>
          <td>${escapeHtml(w.studSize)} ${escapeHtml(w.gauge)}</td>
          <td>${w.studQty}</td>
          <td class="markup-actions">
            <button class="markup-locate" type="button" title="Center wall in viewer">Find</button>
            <button class="markup-delete" type="button" title="Delete wall">Delete</button>
          </td>`;

        tr.addEventListener("click", (e) => {
          if (e.target.closest("button")) return;
          focusWallSegment(w.segmentId);
        });

        tr.querySelector(".markup-locate").addEventListener("click", (e) => {
          e.stopPropagation();
          focusWallSegment(w.segmentId);
        });

        tr.querySelector(".markup-delete").addEventListener("click", (e) => {
          e.stopPropagation();
          deleteWallById(w.segmentId, true);
        });

        tbody.appendChild(tr);
      }
    }

    $("wallCountBadge").textContent = `${walls.length} wall${walls.length === 1 ? "" : "s"}`;
    $("markupsCountBadge").textContent = filterValue
      ? `${visibleWalls.length} of ${walls.length}`
      : `${walls.length} item${walls.length === 1 ? "" : "s"}`;

    updateUndoButton();
    refreshWallTypeTotals(walls);
    refreshMaterialSummary(walls);
    refreshTemporaryAreaTotals();
  }

  function refreshWallTypeTotals(walls) {
    walls = getTemporaryAreaWalls(walls);
    const el = $("wallTypeTotals");
    if (!walls.length) {
      el.className = "summary-list muted";
      el.textContent = "No walls saved yet.";
      return;
    }

    const groups = new Map();
    for (const w of walls) {
      const name = w.wallType || "Unassigned";
      if (!groups.has(name)) {
        groups.set(name, { count: 0, lengthFt: 0, studs: 0, topFt: 0, bottomFt: 0 });
      }
      const g = groups.get(name);
      g.count += 1;
      g.lengthFt += w.lengthFt;
      g.studs += w.studQty;
      if (w.topTrack !== "None") g.topFt += w.topTrackFt ?? w.trackFt;
      if (w.bottomTrack !== "None") g.bottomFt += w.bottomTrackFt ?? w.trackFt;
    }

    el.className = "summary-list";
    el.innerHTML = "";
    const names = [...groups.keys()].sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));
    for (const name of names) {
      const g = groups.get(name);
      const group = document.createElement("div");
      group.className = "summary-group wall-type-total";
      group.innerHTML = `
        <div class="summary-title">${escapeHtml(name)}</div>
        <div class="summary-item"><span>Walls</span><span>${g.count}</span></div>
        <div class="summary-item"><span>Total wall length</span><span>${formatFeetInches(g.lengthFt)} (${g.lengthFt.toFixed(2)} LF)</span></div>
        <div class="summary-item"><span>Total studs</span><span>${g.studs} pcs</span></div>
        <div class="summary-item"><span>Top track</span><span>${g.topFt.toFixed(2)} LF</span></div>
        <div class="summary-item"><span>Bottom track</span><span>${g.bottomFt.toFixed(2)} LF</span></div>`;
      el.appendChild(group);
    }
  }

  function refreshMaterialSummary(walls) {
    walls = getTemporaryAreaWalls(walls);
    const hasAreaWalls = walls.length > 0;
    walls = walls.filter(wall => !state.hiddenWallTypes.has(wall.wallType || ""));
    const el = $("materialSummary");
    if (!walls.length) {
      el.className = "summary-list muted";
      el.textContent = hasAreaWalls
        ? "No visible walls. Turn on a wall type in LAYERS to see its materials."
        : (state.tempArea.closed ? "No saved walls in the selected area." : "No walls saved yet.");
      return;
    }
    el.className = "summary-list";
    const studs = new Map(), tracks = new Map(), assemblyMaterials = new Map(), doorMaterials = new Map();

    for (const w of walls) {
      for (const part of w.assemblyParts || []) {
        const key = JSON.stringify([part.name, part.unit]);
        const quantity = assemblyPartQuantity(part, w);
        const item = assemblyMaterials.get(key) || { name: part.name, unit: part.unit, quantity: 0 };
        item.quantity += quantity;
        assemblyMaterials.set(key, item);
      }
      const skey = `${w.studSize} ${w.gauge} × ${w.height}'`;
      studs.set(skey, (studs.get(skey) || 0) + (w.fullHeightStudQty ?? w.studQty));
      for (const group of w.crippleGroups || []) {
        const key = `${w.studSize} ${w.gauge} — Cripple ${formatFeetInches(group.heightFt)}`;
        studs.set(key, (studs.get(key) || 0) + group.quantity);
      }
      if (w.woodJambQty) {
        const key = `Wood jamb pieces — ${w.height}' high (size to specify)`;
        doorMaterials.set(key, (doorMaterials.get(key) || 0) + w.woodJambQty);
      }

      if (w.bottomTrack !== "None") {
        const key = `${w.studSize} ${w.gauge} — Bottom ${w.bottomTrack}`;
        tracks.set(key, (tracks.get(key) || 0) + (w.bottomTrackFt ?? w.trackFt));
      }
      if (w.topTrack !== "None") {
        const key = `${w.studSize} ${w.gauge} — Top ${w.topTrack}`;
        tracks.set(key, (tracks.get(key) || 0) + (w.topTrackFt ?? w.trackFt));
      }
      if (w.headerTrackFt) {
        const key = `${w.studSize} ${w.gauge} — Door header track`;
        tracks.set(key, (tracks.get(key) || 0) + w.headerTrackFt);
      }
    }

    el.innerHTML = "";
    el.appendChild(makeSummaryGroup("STUDS", [...studs.entries()].map(([k,v]) => [k, `${v} pcs`])));
    el.appendChild(makeSummaryGroup("TRACK", [...tracks.entries()].map(([k,v]) => [k, `${v.toFixed(2)} LF`])));
    if (doorMaterials.size) el.appendChild(makeSummaryGroup("WOOD JAMBS", [...doorMaterials].map(([k,v])=>[k,`${v} pcs`])));
    if (assemblyMaterials.size) el.appendChild(makeSummaryGroup("ASSEMBLY MATERIALS",
      [...assemblyMaterials.values()].map(p => [p.name, `${p.quantity.toFixed(2)} ${p.unit}`])));
  }

  function makeSummaryGroup(title, items) {
    const group = document.createElement("div");
    group.className = "summary-group";
    const head = document.createElement("div");
    head.className = "summary-title";
    head.textContent = title;
    group.appendChild(head);
    for (const [label, value] of items) {
      const row = document.createElement("div");
      row.className = "summary-item";
      const a = document.createElement("span"), b = document.createElement("span");
      a.textContent = label; b.textContent = value;
      row.append(a,b);
      group.appendChild(row);
    }
    return group;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  function saveWallFromForm(options = {}) {
    const s = state.segments.find(x => x.id === state.selectedId);
    if (!s) return;
    let c;
    try { c = calcWall(s); } catch (err) { alert(err.message); return; }
    const wallNumber = $("wallNumber").value.trim() || nextWallNumber();

    for (const [id, w] of state.walls.entries()) {
      if (id !== s.id && w.wallNumber.toLowerCase() === wallNumber.toLowerCase()) {
        alert(`Wall number ${wallNumber} is already in use.`);
        return;
      }
    }

    if (!options.skipHistory) pushTakeoffHistory();

    state.walls.set(s.id, {
      segmentId: s.id,
      doors: structuredClone(state.walls.get(s.id)?.doors || []),
      wallNumber,
      wallType: $("wallTypeSelect").value || "",
      assemblyParts: structuredClone(
        state.walls.get(s.id)?.wallType === ($("wallTypeSelect").value || "")
          ? (state.walls.get(s.id).assemblyParts || [])
          : (state.wallTypes[$("wallTypeSelect").value]?.assemblyParts || [])),
      lengthFt: c.lengthFt,
      height: Number($("wallHeight").value),
      studSize: $("studSize").value,
      gauge: $("gauge").value,
      spacing: Number($("spacing").value),
      topTrack: $("topTrack").value,
      bottomTrack: $("bottomTrack").value,
      doubleEnds: $("doubleEnds").checked,
      wastePercent: Number($("wastePercent").value) || 0,
      studQty: c.studQty,
      trackFt: c.trackFt,
      ...c
    });

    refreshTables();
    if (!options.preserveMode) state.toolMode = "wall";
    draw();
  }

  function recalcAllWallsForUnits() {
    for (const [id, wall] of state.walls.entries()) {
      const s = state.segments.find(x => x.id === id);
      if (!s) continue;
      Object.assign(wall, calculateWallFromTemplate(s, wall));
    }
    if (state.selectedId) selectSegment(state.selectedId);
    refreshTables();
    draw();
  }

  function csvEscape(value) {
    const s = String(value ?? "");
    return `"${s.replace(/"/g, '""')}"`;
  }

  function exportCSV() {
    const walls = [...state.walls.values()].sort((a,b) => a.wallNumber.localeCompare(b.wallNumber, undefined, {numeric:true}));
    if (!walls.length) {
      alert("Save at least one wall before exporting.");
      return;
    }
    const rows = [[
      "Wall Number","Wall Type","Length (ft)","Length (ft-in)","Height (ft)","Stud Size","Gauge",
      "Spacing (in OC)","Stud Qty","Top Track","Bottom Track","Track LF","Double Ends","Waste %",
      "Full-height Metal Stud Qty","Cripple Stud Qty","Top Track LF","Bottom Track LF","Header Track LF","Door Count","Wood Jamb Qty","Door Details"
    ]];
    for (const w of walls) {
      rows.push([
        w.wallNumber, w.wallType || "", w.lengthFt.toFixed(4), formatFeetInches(w.lengthFt), w.height,
        w.studSize, w.gauge, w.spacing, w.studQty, w.topTrack, w.bottomTrack,
        w.trackFt.toFixed(2), w.doubleEnds ? "Yes" : "No", w.wastePercent,
        w.fullHeightStudQty ?? w.studQty, (w.crippleGroups || []).reduce((n,g)=>n+g.quantity,0),
        w.topTrack === "None" ? 0 : (w.topTrackFt ?? w.trackFt).toFixed(2),
        w.bottomTrack === "None" ? 0 : (w.bottomTrackFt ?? w.trackFt).toFixed(2),
        (w.headerTrackFt || 0).toFixed(2), (w.doors || []).length,w.woodJambQty || 0,JSON.stringify(w.doors || [])
      ]);
    }
    const csv = rows.map(r => r.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(state.fileName || "atlas-takeoff").replace(/\.dxf$/i,"")}-wall-takeoff.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Projects are stored in IndexedDB (larger drawings than localStorage can usually handle).
  // Downloadable .atlas-takeoff.json backup is the portable, user-controlled copy.
  const PROJECT_DB_NAME = "ATLAS_Takeoff_Projects";
  const PROJECT_STORE = "projects";
  const LAST_PROJECT_KEY = "atlasTakeoffLastProjectV2";
  let projectDbPromise = null;
  let restoringProject = false;

  function markProjectDirty() {
    if (restoringProject || !state.segments.length) return;
    state.projectDirty = true;
    updateProjectTitle();
  }

  function updateProjectTitle() {
    const title = state.projectName || state.fileName || "Untitled project";
    document.title = `${state.projectDirty ? "• " : ""}${title} — ATLAS Takeoff`;
    $("saveProjectBtn").textContent = state.projectDirty ? "Save Project *" : "Save Project";
  }

  function getProjectSnapshot(name = state.projectName || state.fileName.replace(/\.dxf$/i, "") || "New Project") {
    return {
      app: "ATLAS Takeoff", version: 2,
      projectName: String(name).trim(),
      fileName: state.fileName,
      savedAt: new Date().toISOString(),
      segments: state.segments.map(s => ({ ...s })),
      walls: [...state.walls.values()].map(w => ({ ...w })),
      wallTypes: structuredClone(state.wallTypes),
      wallLibrary: structuredClone(state.wallLibrary),
      materialLibrary: structuredClone(state.materialLibrary),
      doorTypes: structuredClone(state.doorTypes),
      activeDoorType: state.activeDoorType,
      activeWallType: state.activeWallType,
      hiddenWallTypes: [...state.hiddenWallTypes],
      hiddenDoorTypes: [...state.hiddenDoorTypes],
      detectedUnits: state.detectedUnits,
      unitSelect: $("unitSelect").value,
      calibration: {
        points: state.calibration.points,
        feetPerUnit: state.calibration.feetPerUnit,
        knownFeet: $("calibrationFeet").value,
        knownInches: $("calibrationInches").value
      },
      view: { ...state.view },
      selectedId: state.selectedId,
      traceLocked: state.trace.locked,
      traceOrtho: state.trace.ortho,
      ceilings: structuredClone(state.ceilings)
    };
  }

  function assertProject(data) {
    if (!data || data.app !== "ATLAS Takeoff" || data.version !== 2 ||
        !Array.isArray(data.segments) || !Array.isArray(data.walls) ||
        !data.segments.every(s => Number.isFinite(s.x1) && Number.isFinite(s.y1) &&
            Number.isFinite(s.x2) && Number.isFinite(s.y2) && Number.isSafeInteger(s.id)) ||
        !data.walls.every(w => Number.isSafeInteger(w.segmentId) &&
            typeof w.wallNumber === "string")) {
      throw new Error("Not a valid ATLAS Takeoff v2 project backup.");
    }
    for (const wall of data.walls) {
      if (wall.doors && !Array.isArray(wall.doors)) throw new Error("Invalid door list in backup.");
      if (wall.doors?.length) AtlasQuantities.wallQuantities(wall.lengthFt, wall, wall.doors);
    }
    return data;
  }

  function projectDb() {
    if (!window.indexedDB) return Promise.reject(new Error("Saved projects are unavailable in this browser. Use Download Backup instead."));
    if (projectDbPromise) return projectDbPromise;
    projectDbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(PROJECT_DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(PROJECT_STORE))
          req.result.createObjectStore(PROJECT_STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Could not open saved-project storage."));
    }).catch(err => { projectDbPromise = null; throw err; });
    return projectDbPromise;
  }

  async function projectOperation(mode, value) {
    const db = await projectDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PROJECT_STORE, mode === "put" || mode === "delete" ? "readwrite" : "readonly");
      const store = tx.objectStore(PROJECT_STORE);
      let req;
      if (mode === "put") req = store.put(value);
      else if (mode === "delete") req = store.delete(value);
      else if (mode === "get") req = store.get(value);
      else req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Project storage request failed."));
      tx.onabort = () => reject(tx.error || new Error("Project storage failed or is full."));
    });
  }

  function setProjectStatus(message, error = false) {
    $("projectStorageStatus").textContent = message;
    $("projectStorageStatus").classList.toggle("error", error);
  }

  function projectIdFromName(name) {
    return name.trim().toLowerCase();
  }

  async function refreshSavedProjectsList() {
    const list = $("savedProjectsList");
    list.textContent = "Loading saved projects…";
    try {
      const items = await projectOperation("list");
      items.sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
      list.replaceChildren();
      if (!items.length) {
        list.textContent = "No saved projects on this device yet.";
        return;
      }
      for (const item of items) {
        const row = document.createElement("div");
        row.className = "project-saved-row";
        const info = document.createElement("div");
        const strong = document.createElement("strong");
        strong.textContent = item.projectName;
        const detail = document.createElement("small");
        detail.textContent = `${item.walls.length} walls • ${new Date(item.savedAt).toLocaleString()}`;
        info.append(strong, detail);
        const open = document.createElement("button");
        open.className = "button";
        open.type = "button";
        open.textContent = "Open";
        open.addEventListener("click", () => openSavedProject(item.id));
        const remove = document.createElement("button");
        remove.className = "button danger";
        remove.type = "button";
        remove.textContent = "Delete";
        remove.addEventListener("click", async () => {
          if (!confirm(`Delete saved project “${item.projectName}” from this device?`)) return;
          try {
            await projectOperation("delete", item.id);
            if (state.savedProjectId === item.id) {
              state.savedProjectId = null;
              state.projectDirty = true;
              updateProjectTitle();
            }
            if (localStorage.getItem(LAST_PROJECT_KEY) === item.id) localStorage.removeItem(LAST_PROJECT_KEY);
            await refreshSavedProjectsList();
          } catch (err) { setProjectStatus(err.message, true); }
        });
        row.append(info, open, remove);
        list.appendChild(row);
      }
    } catch (err) {
      list.textContent = "Local saves are unavailable; use Download Backup to keep this project.";
      setProjectStatus(err.message, true);
    }
  }

  function showProjectDialog(preferSave = false) {
    $("projectDialog").classList.remove("hidden");
    $("projectNameInput").value = state.projectName || state.fileName.replace(/\.dxf$/i, "");
    $("projectStorageStatus").textContent = "";
    refreshSavedProjectsList();
    if (preferSave) $("projectNameInput").focus();
  }

  function closeProjectDialog() { $("projectDialog").classList.add("hidden"); }

  async function saveCurrentProject() {
    if (!state.segments.length) { alert("Open a DXF before saving a project."); return; }
    const name = $("projectNameInput").value.trim();
    if (!name) { setProjectStatus("Give this project a name before saving.", true); return; }
    const id = projectIdFromName(name);
    try {
      const existing = await projectOperation("get", id);
      if (existing && state.savedProjectId !== id &&
          !confirm(`Replace the existing saved project “${existing.projectName}”?`)) return;
      const data = getProjectSnapshot(name);
      await projectOperation("put", { ...data, id });
      state.projectName = name;
      state.savedProjectId = id;
      state.projectDirty = false;
      updateProjectTitle();
      localStorage.setItem(LAST_PROJECT_KEY, id);
      setProjectStatus(`Saved “${name}” with ${data.walls.length} walls and the complete drawing.`);
      await refreshSavedProjectsList();
    } catch (err) {
      setProjectStatus(`Couldn't save locally: ${err.message} Download a backup instead.`, true);
    }
  }

  function confirmDiscardUnsaved() {
    return !state.projectDirty || !state.segments.length ||
      confirm("You have unsaved changes. Open another project and discard those changes?");
  }

  function restoreProject(data, id = null) {
    const p = assertProject(data);
    restoringProject = true;
    try {
      state.fileName = p.fileName || "Saved project";
      state.projectName = p.projectName || "Imported project";
      state.savedProjectId = id;
      state.projectDirty = false;
      state.segments = p.segments.map(s => ({ ...s }));
      state.walls = new Map(p.walls.map(w => [w.segmentId, { ...w }]));
      state.ceilings = Array.isArray(p.ceilings) ? p.ceilings.filter(c=>Array.isArray(c.points)&&c.points.length>=3&&c.points.every(pt=>Number.isFinite(pt.x)&&Number.isFinite(pt.y))).map(c=>({...c,points:c.points.map(pt=>({...pt}))})) : [];
      state.ceilingSelected = state.ceilings[0]?.id || null;
      state.ceilingDraft = [];
      state.ceilingDrawing = false;
      state.ceilingPickMode = false;state.ceilingRectMode = false;state.ceilingRectDraft=[];
      state.ceilingMoveMode = false;
      state.tape.start=null;state.tape.end=null;state.tape.preview=null;
      syncCeilingPanel();
      state.hiddenWallTypes = new Set(Array.isArray(p.hiddenWallTypes)
        ? p.hiddenWallTypes.filter(name => typeof name === "string") : []);
      state.hiddenDoorTypes = new Set(Array.isArray(p.hiddenDoorTypes)
        ? p.hiddenDoorTypes.filter(name=>typeof name==="string") : []);
      // Saved jobs own their definitions; never merge the previous job's types.
      state.wallTypes = structuredClone(p.wallTypes || {});
      state.wallLibrary = {
        name: typeof p.wallLibrary?.name==="string" ? p.wallLibrary.name : (p.projectName||"Project")+" wall library",
        locked: p.wallLibrary?.locked !== false
      };
      if (Array.isArray(p.materialLibrary)) {
        for (const part of p.materialLibrary) {
          if (!part || typeof part.name !== "string" || typeof part.folder !== "string") continue;
          const index = state.materialLibrary.findIndex(item => item.name === part.name && item.folder === part.folder);
          if (index >= 0) state.materialLibrary[index] = structuredClone(part);
          else state.materialLibrary.push(structuredClone(part));
        }
        persistMaterialLibrary();
      }
      state.doorTypes = { ...state.doorTypes, ...cleanDoorTypes(p.doorTypes) };
      state.activeDoorType = p.activeDoorType && state.doorTypes[p.activeDoorType] ? p.activeDoorType : "";
      persistDoorTypes();
      persistWallTypes();
      state.activeWallType = p.activeWallType && state.wallTypes[p.activeWallType] ? p.activeWallType : "";
      state.detectedUnits = p.detectedUnits || null;
      const validUnits = ["auto", "in", "ft", "mm", "cm", "m"];
      $("unitSelect").value = validUnits.includes(p.unitSelect) ? p.unitSelect : "auto";
      $("unitSelect").dataset.previousValue = $("unitSelect").value;
      state.calibration = {
        activePoint: null,
        points: Array.isArray(p.calibration?.points) && p.calibration.points.length === 2
          ? p.calibration.points : [null, null],
        feetPerUnit: Number.isFinite(p.calibration?.feetPerUnit) && p.calibration.feetPerUnit > 0
          ? p.calibration.feetPerUnit : null
      };
      $("calibrationFeet").value = p.calibration?.knownFeet ?? "20";
      $("calibrationInches").value = p.calibration?.knownInches ?? "0";
      state.trace = { locked: !!p.traceLocked, ortho: !!p.traceOrtho, lastPoint: null };
      for (const wall of state.walls.values()) {
        const segment = state.segments.find(s => s.id === wall.segmentId);
        if (segment) Object.assign(wall, calculateWallFromTemplate(segment, wall));
      }
      state.placingDoor = false;
      updateDoorModeUI();
      $("doorDialog").classList.add("hidden");
      state.toolMode = state.trace.locked ? "trace" : "wall";
      state.history = [];
      state.bounds = computeBounds(state.segments);
      state.selectedId = null;
      state.tempArea = {
        selecting: false,
        closed: false,
        points: [],
        wallIds: new Set()
      };
      $("emptyState").style.display = state.segments.length ? "none" : "flex";
      $("fileStatus").textContent = `${state.fileName} • ${state.segments.length.toLocaleString()} segments`;
      refreshWallTypeUI();
      setActiveWallType(state.activeWallType);
      refreshTables();
      selectSegment(null, { preserveMode: true });
      hideCalibrationPanel();
      updateCalibrationUI();
      updateToolUI();
      updateTraceUI();
      updateSelectedActionButtons();
      updateProjectTitle();
      if (p.view && Number.isFinite(p.view.scale) && p.view.scale > 0 &&
          Number.isFinite(p.view.offsetX) && Number.isFinite(p.view.offsetY)) {
        state.view = { ...p.view };
        resizeCanvas();
      } else fitDrawing();
    } finally { restoringProject = false; }
  }

  async function openSavedProject(id) {
    if (!confirmDiscardUnsaved()) return;
    try {
      const data = await projectOperation("get", id);
      if (!data) { setProjectStatus("This saved project is no longer available.", true); return; }
      restoreProject(data, id);
      localStorage.setItem(LAST_PROJECT_KEY, id);
      closeProjectDialog();
    } catch (err) { setProjectStatus(err.message, true); }
  }

  function downloadProjectBackup() {
    if (!state.segments.length) { alert("Open a DXF before downloading a project backup."); return; }
    const name = $("projectNameInput").value.trim() || state.projectName || state.fileName.replace(/\.dxf$/i, "") || "takeoff";
    const json = JSON.stringify(getProjectSnapshot(name));
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name.replace(/[^a-z0-9_-]+/gi, "-")}.atlas-takeoff.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setProjectStatus(`Downloaded backup for “${name}”. Keep it somewhere safe.`);
  }

  async function importProjectBackup(file) {
    if (!file || !confirmDiscardUnsaved()) return;
    try {
      const data = assertProject(JSON.parse(await file.text()));
      restoreProject(data, null);
      state.projectDirty = true; // Imported file still needs to be saved to local slots.
      updateProjectTitle();
      closeProjectDialog();
      alert(`Imported “${state.projectName}”. Use Save Project to keep it in this browser.`);
    } catch (err) { alert(`Could not import project: ${err.message}`); }
  }

  async function autoRestoreLastSaved() {
    let id;
    try { id = localStorage.getItem(LAST_PROJECT_KEY); } catch (_) { return; }
    if (!id || state.segments.length) return;
    try {
      const data = await projectOperation("get", id);
      if (data && !state.segments.length) restoreProject(data, id);
    } catch (_) { /* User can still open/import manually. */ }
  }

  // v2.9.2: use the browser Fullscreen API first (including the Android launcher).
  // When Android runs this page in its same-origin iframe, fullscreen the iframe
  // in the outer document, then expand this viewer inside it. This avoids being
  // trapped within the browser window by a CSS-only "fullscreen" view.
  // Unsupported browsers retain the original fixed-position fallback.
  const viewerCard = document.querySelector(".viewer-card");
  let fullscreenCenter = null;
  let fullscreenMode = "none"; // none | native-frame | native-viewer | fallback

  function parentFullscreenFrame() {
    try {
      const frame = window.frameElement;
      return frame && frame.ownerDocument?.defaultView === window.parent ? frame : null;
    } catch (_) {
      return null; // e.g. cross-origin hosting; native fullscreen may still work here.
    }
  }

  function currentNativeFullscreenMode() {
    if (document.fullscreenElement === viewerCard) return "native-viewer";
    const frame = parentFullscreenFrame();
    if (frame && frame.ownerDocument.fullscreenElement === frame) return "native-frame";
    return null;
  }

  function isViewerFullscreen() {
    return fullscreenMode !== "none" || !!currentNativeFullscreenMode();
  }

  function captureViewerCenter() {
    const rect = canvas.getBoundingClientRect();
    return rect.width && rect.height
      ? screenToWorld(rect.width / 2, rect.height / 2)
      : null;
  }

  function reflowViewerAfterModeChange() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const rect = canvas.getBoundingClientRect();
      if (fullscreenCenter && rect.width && rect.height) {
        state.view.offsetX = rect.width / 2 - fullscreenCenter.x * state.view.scale;
        state.view.offsetY = rect.height / 2 + fullscreenCenter.y * state.view.scale;
      }
      fullscreenCenter = null;
      resizeCanvas();
      syncFullscreenTools();
    }));
  }

  function syncFullscreenTools() {
    const active = isViewerFullscreen();
    $("fullscreenBtn").textContent = active ? "⛶ EXIT FULL SCREEN" : "⛶ FULL SCREEN";
    $("fullscreenBtn").setAttribute("aria-pressed", active ? "true" : "false");
    $("fsWallBtn").classList.toggle("active-tool", state.toolMode === "wall");
    const fsTraceActive = state.toolMode === "trace";
    $("fsTraceBtn").classList.toggle("active-tool", fsTraceActive);
    $("fsTraceBtn").setAttribute("aria-pressed", fsTraceActive ? "true" : "false");
    $("fsTraceBtn").textContent = fsTraceActive ? "STOP ■" : "TRACE ▶";
    $("fsTapeBtn").classList.toggle("active-tool", state.toolMode === "tape");
    $("fsLockBtn").classList.toggle("trace-on", state.trace.locked);
    $("fsLockBtn").classList.toggle("trace-paused", state.toolMode === "trace" && !state.trace.locked);
    $("fsLockBtn").textContent = state.trace.locked ? "TRACE LOCK ✓" : "TRACE LOCK";
    $("fsOrthoBtn").classList.toggle("trace-on", state.trace.ortho);
    $("fsOrthoBtn").textContent = state.trace.ortho ? "ORTHO ✓" : "ORTHO";
  }

  function applyFullscreenMode(mode) {
    fullscreenMode = mode;
    const active = mode !== "none";
    // CSS fills the child viewer only for the parent-iframe fullscreen or fallback.
    const useFallback = mode === "native-frame" || mode === "fallback";
    state.fullscreenPersistent = active;
    state.fullscreenFallback = useFallback; // retained for state compatibility
    viewerCard.classList.toggle("fullscreen-fallback", useFallback);
    document.documentElement.classList.toggle("viewer-focus-active", active);
    document.body.classList.toggle("viewer-focus-active", active);
    syncFullscreenTools();
    reflowViewerAfterModeChange();
  }

  async function toggleViewerFullscreen(forceState = null) {
    const next = forceState === null ? !isViewerFullscreen() : !!forceState;
    if (next === isViewerFullscreen()) return;
    fullscreenCenter = captureViewerCenter();
    if (!next) {
      const frame = parentFullscreenFrame();
      const nativeDoc = document.fullscreenElement === viewerCard
        ? document
        : frame?.ownerDocument.fullscreenElement === frame ? frame.ownerDocument : null;
      if (nativeDoc?.exitFullscreen) {
        try { await nativeDoc.exitFullscreen(); } catch (_) { /* still exit the local view */ }
      }
      applyFullscreenMode("none");
      return;
    }

    // The request must be called directly during the button's user gesture.
    // Fullscreen on the wrapper iframe also permits the child viewer to occupy
    // the entire physical display on Android Chrome.
    const frame = parentFullscreenFrame();
    const target = frame?.requestFullscreen ? frame : viewerCard;
    if (typeof target.requestFullscreen === "function") {
      try {
        await target.requestFullscreen();
        applyFullscreenMode(currentNativeFullscreenMode() ||
          (target === frame ? "native-frame" : "native-viewer"));
        return;
      } catch (err) {
        console.warn("ATLAS native fullscreen unavailable; using page fallback", err);
      }
    }
    applyFullscreenMode("fallback");
  }

  // Esc and browser controls can exit native fullscreen without an ATLAS button.
  // Keep the toolbar, viewer dimensions, and pan/zoom state synchronized.
  function handleNativeFullscreenChange() {
    const nativeMode = currentNativeFullscreenMode();
    if (nativeMode) {
      if (fullscreenMode !== nativeMode) {
        fullscreenCenter = captureViewerCenter();
        applyFullscreenMode(nativeMode);
      } else {
        reflowViewerAfterModeChange();
      }
    } else if (fullscreenMode === "native-viewer" || fullscreenMode === "native-frame") {
      fullscreenCenter = captureViewerCenter();
      applyFullscreenMode("none");
    }
  }
  document.addEventListener("fullscreenchange", handleNativeFullscreenChange);
  const frameForEvents = parentFullscreenFrame();
  if (frameForEvents) {
    frameForEvents.ownerDocument.addEventListener("fullscreenchange", handleNativeFullscreenChange);
  }

  function preservePersistentFullscreen() {
    if (!isViewerFullscreen()) return;
    if ((fullscreenMode === "fallback" || fullscreenMode === "native-frame") &&
        !viewerCard.classList.contains("fullscreen-fallback")) {
      viewerCard.classList.add("fullscreen-fallback");
    }
    document.documentElement.classList.add("viewer-focus-active");
    document.body.classList.add("viewer-focus-active");
    requestAnimationFrame(resizeCanvas);
  }
  window.addEventListener("resize", preservePersistentFullscreen);
  window.addEventListener("orientationchange", preservePersistentFullscreen);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) preservePersistentFullscreen();
  });

  $("fullscreenBtn").addEventListener("click", () => {
    const viewMenu = $("viewerOptionsMenu");
    if (viewMenu) viewMenu.open = false;
    toggleViewerFullscreen();
  });
  $("fsExitBtn").addEventListener("click", () => toggleViewerFullscreen(false));
  $("fsWallBtn").addEventListener("click", () => activateWallMode(false));
  $("fsTraceBtn").addEventListener("click", activateTraceMode);
  $("fsLockBtn").addEventListener("click", toggleTraceLock);
  $("fsOrthoBtn").addEventListener("click", toggleOrthoLock);
  $("fsFitBtn").addEventListener("click", fitDrawing);
  $("saveProjectBtn").addEventListener("click", () => showProjectDialog(true));
  $("openProjectBtn").addEventListener("click", () => {
    closeMoreMenu();
    showProjectDialog(false);
  });
  $("closeProjectDialogBtn").addEventListener("click", closeProjectDialog);
  $("projectDialog").addEventListener("click", e => {
    if (e.target === $("projectDialog")) closeProjectDialog();
  });
  $("confirmSaveProjectBtn").addEventListener("click", saveCurrentProject);
  $("backupProjectBtn").addEventListener("click", () => { closeMoreMenu(); showProjectDialog(true); downloadProjectBackup(); });
  $("dialogBackupProjectBtn").addEventListener("click", downloadProjectBackup);
  $("importProjectBtn").addEventListener("click", () => {
    closeMoreMenu();
    $("projectImportFile").value = "";
    $("projectImportFile").click();
  });
  $("projectImportFile").addEventListener("change", e => importProjectBackup(e.target.files?.[0]));
  window.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("projectDialog").classList.contains("hidden")) closeProjectDialog();
    if (e.key === "Escape" && state.tempArea.selecting) {
      state.tempArea.selecting = false;
      state.tempArea.points = [];
      updateTemporaryAreaUI();
      refreshTemporaryAreaTotals();
      draw();
      return;
    }
    if (e.key === "Escape" && fullscreenMode === "fallback") toggleViewerFullscreen(false);
  });
  window.addEventListener("beforeunload", e => {
    if (state.projectDirty && state.segments.length) {
      e.preventDefault();
      e.returnValue = "";
    }
  });


  function initializeCollapsiblePanelScrolling() {
    const bodies = document.querySelectorAll(".panel-scroll-body");

    bodies.forEach((body) => {
      const up = body.querySelector(".panel-scroll-up");
      const down = body.querySelector(".panel-scroll-down");

      const scrollAmount = () => Math.max(120, Math.round(body.clientHeight * 0.72));

      if (up) {
        up.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          body.scrollBy({ top: -scrollAmount(), behavior: "smooth" });
        });
      }

      if (down) {
        down.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          body.scrollBy({ top: scrollAmount(), behavior: "smooth" });
        });
      }

      // Explicit wheel handling prevents the parent options column from
      // stealing wheel movement when this panel can still scroll.
      body.addEventListener("wheel", (e) => {
        const max = body.scrollHeight - body.clientHeight;
        if (max <= 0) return;

        const movingDown = e.deltaY > 0;
        const movingUp = e.deltaY < 0;
        const canMoveDown = body.scrollTop < max - 1;
        const canMoveUp = body.scrollTop > 1;

        if ((movingDown && canMoveDown) || (movingUp && canMoveUp)) {
          e.preventDefault();
          e.stopPropagation();
          body.scrollTop += e.deltaY;
        }
      }, { passive: false });

      // Safari/iPad fallback: translate finger movement directly to scrollTop.
      let touchY = null;

      body.addEventListener("touchstart", (e) => {
        if (!e.touches || !e.touches.length) return;
        touchY = e.touches[0].clientY;
      }, { passive: true });

      body.addEventListener("touchmove", (e) => {
        if (touchY === null || !e.touches || !e.touches.length) return;

        const y = e.touches[0].clientY;
        const dy = touchY - y;
        const max = body.scrollHeight - body.clientHeight;

        if (max > 0) {
          const next = Math.max(0, Math.min(max, body.scrollTop + dy));
          if (next !== body.scrollTop) {
            e.preventDefault();
            e.stopPropagation();
            body.scrollTop = next;
          }
        }

        touchY = y;
      }, { passive: false });

      body.addEventListener("touchend", () => {
        touchY = null;
      }, { passive: true });

      body.addEventListener("touchcancel", () => {
        touchY = null;
      }, { passive: true });
    });
  }

  document.addEventListener("pointerdown", (e) => {
    const menu = $("moreMenu");
    if (menu && menu.open && !menu.contains(e.target)) {
      menu.open = false;
    }
    const viewMenu = $("viewerOptionsMenu");
    if (viewMenu && viewMenu.open && !viewMenu.contains(e.target)) {
      viewMenu.open = false;
    }
  });

  $("openDxfBtn").addEventListener("click", () => {
    const input = $("dxfFile");
    input.value = "";
    input.click();
  });

  $("dxfFile").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!/\.dxf$/i.test(file.name)) {
      alert("Please choose a DXF file. On iPhone/iPad, use Browse in the Files picker if the DXF is stored in iCloud Drive or Downloads.");
      return;
    }

    if (!confirmDiscardUnsaved()) {
      e.target.value = "";
      return;
    }
    if (state.projectDirty && state.segments.length &&
        !confirm("Open a different DXF? Unsaved takeoff changes will be lost.")) return;

    const text = await file.text();
    const parsed = parseDXF(text);

    state.fileName = file.name;
    state.projectName = file.name.replace(/\.dxf$/i, "");
    state.savedProjectId = null;
    state.projectDirty = true;
    updateProjectTitle();
    state.segments = parsed.segments;
    state.ceilings=[];state.ceilingSelected=null;state.ceilingDraft=[];state.ceilingDrawing=false;
    state.ceilingPickMode=false;state.ceilingRectMode=false;state.ceilingRectDraft=[];state.ceilingMoveMode=false;
    state.tape.start=null;state.tape.end=null;state.tape.preview=null;
    syncCeilingPanel();
    state.detectedUnits = parsed.detectedUnits;
    state.calibration = { activePoint: null, points: [null, null], feetPerUnit: null };
    state.toolMode = "wall";
    state.trace.lastPoint = null;
    state.bounds = computeBounds(parsed.segments);
    state.walls.clear();
    state.hiddenDoorTypes.clear();
    state.history = [];
    state.hiddenWallTypes.clear();
    state.placingDoor = false;
    updateDoorModeUI();
    closeDoorDialog();
    state.selectedId = null;
    state.tempArea = {
      selecting: false,
      closed: false,
      points: [],
      wallIds: new Set()
    };

    $("emptyState").style.display = parsed.segments.length ? "none" : "flex";
    $("fileStatus").textContent = parsed.segments.length
      ? `${file.name} — ${parsed.segments.length.toLocaleString()} selectable line segments${parsed.detectedUnits ? ` — units detected: ${parsed.detectedUnits}` : ""}`
      : `${file.name} — no LINE/LWPOLYLINE/POLYLINE geometry found`;

    refreshTables();
    selectSegment(null);
    updateCalibrationUI();
    fitDrawing();
  });

  $("fitBtn").addEventListener("click", () => {
    fitDrawing();
    closeMoreMenu();
  });
  $("exportCsvBtn").addEventListener("click", () => {
    exportCSV();
    closeMoreMenu();
  });
  $("unitSelect").addEventListener("change", () => {
    if (!validateScaleForDoors(baseFeetPerUnit())) {
      $("unitSelect").value = $("unitSelect").dataset.previousValue || "auto";
      return;
    }
    $("unitSelect").dataset.previousValue = $("unitSelect").value;
    markProjectDirty();
    if (state.calibration.feetPerUnit) {
      state.calibration.feetPerUnit = null;
      state.calibration.points = [null, null];
      state.calibration.activePoint = null;
    }
    recalcAllWallsForUnits();
    updateCalibrationUI();
  });

  function setAllSidePanels(open) {
    document.querySelectorAll(".side-panel details.collapsible-panel").forEach(panel => {
      panel.open = open;
    });
  }

  $("collapsePanelsBtn")?.addEventListener("click", () => setAllSidePanels(false));
  $("expandPanelsBtn")?.addEventListener("click", () => setAllSidePanels(true));

  $("areaSelectBtn").addEventListener("click", startTemporaryAreaSelection);
  $("closeAreaBtn").addEventListener("click", closeTemporaryArea);
  $("clearTempAreaBtn").addEventListener("click", clearTemporaryArea);

  $("fsAreaSelectBtn").addEventListener("click", startTemporaryAreaSelection);
  $("fsCloseAreaBtn").addEventListener("click", closeTemporaryArea);
  $("fsClearTempAreaBtn").addEventListener("click", clearTemporaryArea);

  $("findSelectedBtn").addEventListener("click", () => {
    if (state.selectedId && state.walls.has(state.selectedId)) {
      focusWallSegment(state.selectedId);
    }
    if ($("viewerOptionsMenu")) $("viewerOptionsMenu").open = false;
  });

  $("deleteSelectedBtn").addEventListener("click", () => {
    if (state.selectedId && state.walls.has(state.selectedId)) {
      deleteWallById(state.selectedId, true);
    }
    if ($("viewerOptionsMenu")) $("viewerOptionsMenu").open = false;
  });

  $("wallModeBtn").addEventListener("click", () => activateWallMode(true));
  $("traceWallsBtn").addEventListener("click", activateTraceMode);
  $("traceLockBtn").addEventListener("click", toggleTraceLock);
  $("orthoLockBtn").addEventListener("click", toggleOrthoLock);
  $("scale1Btn").addEventListener("click", () => activateScalePoint(0));
  $("scale2Btn").addEventListener("click", () => activateScalePoint(1));
  $("applyCalibrationBtn").addEventListener("click", applyCalibration);
  $("cancelCalibrationBtn").addEventListener("click", cancelCalibration);
  $("resetCalibrationBtn").addEventListener("click", resetCalibration);

  $("activeWallTypeSelect").addEventListener("change", (e) => {
    markProjectDirty();
    setActiveWallType(e.target.value, false);
    updateTraceUI();
  });

  $("wallTypeSelect").addEventListener("change", (e) => {
    const name = e.target.value;
    if (name && state.wallTypes[name]) {
      state.activeWallType = name;
      $("activeWallTypeSelect").value = name;
      updateCurrentTypeBadge();
      $("wallTypeName").value = name;
      applyWallTemplate(state.wallTypes[name]);
    }
  });

  $("saveWallTypeBtn").addEventListener("click", saveWallTypeFromForm);
  $("deleteWallTypeBtn").addEventListener("click", deleteWallType);
  $("editActiveWallTypeBtn").addEventListener("click", () => {
    if (state.activeWallType) openWallTypeEditor(state.activeWallType);
  });
  $("saveWallTypeEditorBtn").addEventListener("click", saveWallTypeEditor);
  $("deleteWallTypeEditorBtn").addEventListener("click", deleteWallTypeFromEditor);
  $("closeWallTypeEditorBtn").addEventListener("click", closeWallTypeEditor);
  $("cancelWallTypeEditorBtn").addEventListener("click", closeWallTypeEditor);
  $("wallTypeEditorDialog").addEventListener("pointerdown", (e) => {
    if (e.target === $("wallTypeEditorDialog")) closeWallTypeEditor();
  });

  $("undoLastBtn").addEventListener("click", undoLastTakeoff);
  $("markupsTypeFilter").addEventListener("change", refreshTables);

  $("collapseMarkupGroupsBtn").addEventListener("click", () => {
    const walls = [...state.walls.values()];
    for (const wall of walls) state.markupCollapsedGroups.add(wall.wallType || "Unassigned");
    refreshTables();
  });

  $("expandMarkupGroupsBtn").addEventListener("click", () => {
    state.markupCollapsedGroups.clear();
    refreshTables();
  });

  $("wallForm").addEventListener("submit", (e) => {
    e.preventDefault();
    saveWallFromForm();
  });

  for (const id of ["wallHeight","studSize","gauge","spacing","topTrack","bottomTrack","doubleEnds","wastePercent"]) {
    $(id).addEventListener("input", updateCalcPreview);
    $(id).addEventListener("change", updateCalcPreview);
  }

  $("deleteWallBtn").addEventListener("click", () => {
    if (!state.selectedId || !state.walls.has(state.selectedId)) return;
    deleteWallById(state.selectedId, true);
  });

  $("clearWallsBtn").addEventListener("click", () => {
    if (!state.walls.size) return;
    if (!confirm("Clear ALL takeoff wall markups? You can use Undo Last immediately afterward.")) return;
    pushTakeoffHistory();
    state.walls.clear();
    state.segments = state.segments.filter(s => s.sourceType !== "MANUAL_WALL");
    state.trace.lastPoint = null;
    state.selectedId = null;
    refreshTables();
    selectSegment(null);
    draw();
  });

  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select";
    if (typing) return;

    if ((e.key === "Delete" || e.key === "Backspace") &&
        state.toolMode !== 'tape' && state.selectedId && state.walls.has(state.selectedId)) {
      e.preventDefault();
      deleteWallById(state.selectedId, true);
    }
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const before = screenToWorld(mx, my);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    state.view.scale = Math.max(0.00001, Math.min(1e7, state.view.scale * factor));
    state.view.offsetX = mx - before.x * state.view.scale;
    state.view.offsetY = my + before.y * state.view.scale;
    draw();
  }, {passive:false});

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    state.pointers.set(e.pointerId, {x:e.clientX,y:e.clientY});
    if (state.pointers.size === 1) {
      state.ceilingDragStart = null;
      if (state.ceilingMoveMode && !state.ceilingDrawing && !state.ceilingPickMode && !state.ceilingRectMode) {
        const c=selectedCeiling();
        const rect=canvas.getBoundingClientRect();
        if (c && pointInPolygon(screenToWorld(e.clientX-rect.left,e.clientY-rect.top),c.points)) {
          state.ceilingDragStart={x:e.clientX,y:e.clientY,offsetX:c.offsetX||0,offsetY:c.offsetY||0,ceilingId:c.id};
        }
      }
      state.dragging = !state.ceilingDragStart;
      state.moved = false;
      state.dragStart = {x:e.clientX,y:e.clientY, ox:state.view.offsetX, oy:state.view.offsetY};
    } else if (state.pointers.size === 2) {
      state.gesturePinched = true;
      state.ceilingDragStart = null;
      const pts = [...state.pointers.values()];
      state.pinchStartDistance = Math.hypot(pts[1].x-pts[0].x, pts[1].y-pts[0].y);
      state.pinchStartScale = state.view.scale;
      const rect=canvas.getBoundingClientRect();
      state.pinchStartWorld=screenToWorld((pts[0].x+pts[1].x)/2-rect.left,(pts[0].y+pts[1].y)/2-rect.top);
      state.dragging = false;
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!state.pointers.has(e.pointerId)) {
      if (state.toolMode === 'tape' && state.tape.start && !state.tape.end) {
        const rect = canvas.getBoundingClientRect();
        state.tape.preview = tapePoint(e.clientX-rect.left,e.clientY-rect.top);
        updateTapeUI();draw();
      }
      return;
    }
    state.pointers.set(e.pointerId, {x:e.clientX,y:e.clientY});

    if (state.pointers.size === 2) {
      const pts = [...state.pointers.values()];
      const d = Math.hypot(pts[1].x-pts[0].x, pts[1].y-pts[0].y);
      if (state.pinchStartDistance && state.pinchStartScale) {
        const rect = canvas.getBoundingClientRect();
        const mx = ((pts[0].x + pts[1].x)/2) - rect.left;
        const my = ((pts[0].y + pts[1].y)/2) - rect.top;
        const before = state.pinchStartWorld || screenToWorld(mx,my);
        state.view.scale = Math.max(0.00001, Math.min(1e7, state.pinchStartScale * (d/state.pinchStartDistance)));
        state.view.offsetX = mx - before.x * state.view.scale;
        state.view.offsetY = my + before.y * state.view.scale;
        draw();
      }
      return;
    }

    if (state.ceilingDragStart && state.pointers.size===1) {
      const c=selectedCeiling(), d=state.ceilingDragStart;
      if(c && c.id===d.ceilingId){
        const dx=e.clientX-d.x,dy=e.clientY-d.y;
        if(Math.hypot(dx,dy)>3)state.moved=true;
        const ft=activeFeetPerUnit(), theta=(Number(c.angle)||0)*Math.PI/180;
        const wx=dx/state.view.scale*ft,wy=-dy/state.view.scale*ft;
        c.offsetX=Math.round((d.offsetX+wx*Math.cos(theta)+wy*Math.sin(theta))*1000)/1000;
        c.offsetY=Math.round((d.offsetY-wx*Math.sin(theta)+wy*Math.cos(theta))*1000)/1000;
        $('ceilingOffsetX').value=c.offsetX;$('ceilingOffsetY').value=c.offsetY;
        draw();
      }
      return;
    }
    if (state.dragging && state.dragStart) {
      const dx = e.clientX - state.dragStart.x;
      const dy = e.clientY - state.dragStart.y;
      if (Math.hypot(dx,dy) > 4) state.moved = true;
      state.view.offsetX = state.dragStart.ox + dx;
      state.view.offsetY = state.dragStart.oy + dy;
      draw();
    }
  });

  canvas.addEventListener("pointerup", (e) => {
    const rect = canvas.getBoundingClientRect();
    const hadOne=state.pointers.size===1;
    const wasGridDrag=!!state.ceilingDragStart;
    const wasPinch=state.gesturePinched;
    state.pointers.delete(e.pointerId);
    const sx=e.clientX-rect.left,sy=e.clientY-rect.top;

    if (wasGridDrag) {
      if (state.moved) {markProjectDirty();updateCeilingStats();}
      state.ceilingDragStart=null;
    } else if (hadOne && !state.moved && !wasPinch) {
      if (state.toolMode === 'tape') tapTapePoint(sx, sy);
      else if (state.ceilingPickMode) pickExistingCeilingOutline(sx,sy);
      else if (state.ceilingRectMode) addCeilingRectangleCorner(sx,sy);
      else if (state.ceilingDrawing) addCeilingPoint(sx,sy);
      else if (state.tempArea.selecting) addTemporaryAreaPoint(sx,sy);
      else if (state.placingDoor) pointDoorOnWall(sx,sy);
      else if (state.calibration.activePoint !== null) {
        const pointIndex=state.calibration.activePoint;
        state.calibration.points[pointIndex]=nearestCalibrationPoint(sx,sy);
        state.calibration.activePoint=null;
        recalcAllWallsForUnits();updateCalibrationUI();
      } else if (state.toolMode === "trace") traceWallPoint(sx,sy);
      else if (!$("ceilingPanel").hidden) {
        if (!selectCeilingAt(sx,sy)) pickSegment(sx,sy);
      } else pickSegment(sx,sy);
    }
    if(state.pointers.size<2){state.pinchStartDistance=null;state.pinchStartScale=null;state.pinchStartWorld=null;}
    if(state.pointers.size===0){
      state.dragging=false;state.dragStart=null;state.gesturePinched=false;state.ceilingDragStart=null;
    }
  });

  canvas.addEventListener("pointercancel", (e) => {
    state.pointers.delete(e.pointerId);
    if (!state.pointers.size) {
      state.dragging = false;
      state.dragStart = null;
      state.gesturePinched=false;state.ceilingDragStart=null;
      state.pinchStartWorld=null;
    }
  });

  function refreshWallLayers() {
    const counts = new Map(Object.keys(state.wallTypes).map(name => [name, 0]));
    for (const wall of state.walls.values()) {
      const name = wall.wallType || "";
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    const list = $("wallLayersList");
    list.replaceChildren();
    if (!counts.size) {
      list.textContent = "Create wall types or save walls to see layers here.";
      return;
    }
    for (const [name, count] of [...counts].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !state.hiddenWallTypes.has(name);
      const caption = document.createElement("span");
      caption.textContent = `${name || "Unassigned"} (${count})`;
      checkbox.addEventListener("change", () => setWallLayerVisible(name, checkbox.checked));
      label.append(checkbox, caption);
      list.append(label);
    }
  }

  function setWallLayerVisible(name, visible) {
    if (visible) state.hiddenWallTypes.delete(name);
    else state.hiddenWallTypes.add(name);
    const selected = state.walls.get(state.selectedId);
    if (!visible && selected && (selected.wallType || "") === name) {
      selectSegment(null, { preserveMode: true });
    }
    markProjectDirty();
    refreshMaterialSummary([...state.walls.values()]);
    draw();
  }

  $("showAllLayersBtn").addEventListener("click", () => {
    state.hiddenWallTypes.clear();
    markProjectDirty();
    refreshWallLayers();
    refreshMaterialSummary([...state.walls.values()]);
    draw();
  });
  $("hideAllLayersBtn").addEventListener("click", () => {
    for (const name of Object.keys(state.wallTypes)) state.hiddenWallTypes.add(name);
    for (const wall of state.walls.values()) state.hiddenWallTypes.add(wall.wallType || "");
    selectSegment(null, { preserveMode: true });
    markProjectDirty();
    refreshWallLayers();
    refreshMaterialSummary([...state.walls.values()]);
    draw();
  });

  function validPartFormula(part) {
    if (part.materialKind === "drywall" &&
        (part.unit !== "SF" || !["area","grossArea"].includes(part.basis) || (part.formula && part.formula !== "multiply") ||
         !(part.sheetWidthFt > 0) || !(part.sheetHeightFt > 0))) return false;
    if (part.formula === "coverage") return part.factor > 0;
    if (part.formula === "spacing") return part.factor > 0 && ["length", "topTrack", "bottomTrack", "doorPerimeter"].includes(part.basis);
    return !part.formula || part.formula === "multiply";
  }

  function validateScaleForDoors(feetPerUnit) {
    try {
      for (const wall of state.walls.values()) {
        if (!wall.doors?.length) continue;
        const seg = state.segments.find(s=>s.id===wall.segmentId);
        if (seg) AtlasQuantities.wallQuantities(Math.hypot(seg.x2-seg.x1,seg.y2-seg.y1)*feetPerUnit,wall,wall.doors);
      }
      return true;
    } catch (err) { alert(`Scale change would make a door invalid: ${err.message} Edit or remove that door first.`); return false; }
  }

  function refreshWallDoors() {
    const list = $("wallDoorsList");
    const wall = state.walls.get(state.selectedId);
    $("addWallDoorBtn").disabled = !wall;
    list.replaceChildren();
    if (!wall) { list.textContent = "Save the wall before adding doors."; return; }
    if (!wall.doors?.length) { list.textContent = "No doors. Use DOOR on the plan to point to an opening."; return; }
    for (const door of wall.doors) {
      const row = document.createElement("div"); row.className = "summary-group";
      const label = document.createElement("div"); label.className = "summary-title";
      label.textContent = `${door.label}: ${formatFeetInches(door.widthFt)} × ${formatFeetInches(door.heightFt)}`;
      const details = document.createElement("div"); details.className = "muted";
      details.textContent = `${door.jambsPerSide} ${door.jambMaterial} jamb(s) each side · ${door.headerRuns} header run(s)`;
      const edit = document.createElement("button"); edit.type = "button"; edit.className = "type-edit-btn"; edit.textContent = "Edit Door";
      edit.addEventListener("click",()=>openDoorDialog(wall.segmentId,door.centerT,door));
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "type-edit-btn"; remove.textContent = "Remove Door";
      remove.addEventListener("click",()=> {
        pushTakeoffHistory();
        wall.doors = wall.doors.filter(d=>d.id!==door.id);
        Object.assign(wall,AtlasQuantities.wallQuantities(wall.lengthFt,wall,wall.doors));
        refreshTables(); selectSegment(wall.segmentId); draw();
      });
      row.append(label,details,edit,remove); list.append(row);
    }
    const totals = document.createElement("div"); totals.className = "muted";
    totals.textContent = `Net one-face area: ${wall.netAreaFt2.toFixed(2)} SF · bottom track: ${wall.bottomTrackFt.toFixed(2)} LF · header track: ${wall.headerTrackFt.toFixed(2)} LF`;
    list.append(totals);
  }

  function doorLayerCounts() {
    const counts=new Map(Object.keys(state.doorTypes).map(name=>[name,0]));
    for(const wall of state.walls.values())for(const door of wall.doors||[]) {
      const name=door.doorType||"";counts.set(name,(counts.get(name)||0)+1);
    }
    return counts;
  }
  function isDoorVisible(door) { return !state.hiddenDoorTypes.has(door.doorType||""); }
  function doorLayerColor(name) {
    if(!name)return "#e6d9ff";
    let hash=0;for(const ch of name)hash=(hash*31+ch.charCodeAt(0))>>>0;
    return "hsl("+(hash%360)+", 85%, 72%)";
  }
  function setDoorLayerVisible(name,visible,only=false) {
    if(only)state.hiddenDoorTypes=new Set([...doorLayerCounts().keys()].filter(key=>key!==name));
    else if(visible)state.hiddenDoorTypes.delete(name);
    else state.hiddenDoorTypes.add(name);
    markProjectDirty();refreshDoorLayers();draw();
  }
  function refreshDoorLayers() {
    const list=$("doorLayersList");list.replaceChildren();
    const counts=doorLayerCounts();let total=0,visible=0;
    for(const [name,count] of [...counts].sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}))) {
      total+=count;if(!state.hiddenDoorTypes.has(name))visible+=count;
      const row=document.createElement("div");row.className="door-layer-row";
      const label=document.createElement("label");
      const checkbox=document.createElement("input");checkbox.type="checkbox";checkbox.checked=!state.hiddenDoorTypes.has(name);
      checkbox.addEventListener("change",()=>setDoorLayerVisible(name,checkbox.checked));
      const caption=document.createElement("span");caption.textContent=(name||"Custom / unassigned")+" ("+count+")";
      caption.style.color=doorLayerColor(name);
      label.append(checkbox,caption);
      const only=document.createElement("button");only.type="button";only.className="mini-tool-button";only.textContent="Only";
      only.setAttribute("aria-label","Show only "+(name||"custom doors"));
      only.addEventListener("click",()=>setDoorLayerVisible(name,true,true));
      row.append(label,only);list.append(row);
    }
    if(!counts.size)list.textContent="Place doors or save a door type to see layers.";
    $("doorLayerStatus").textContent=visible+" of "+total+" door marks shown";
  }
  $("showAllDoorLayersBtn").addEventListener("click",()=>{
    state.hiddenDoorTypes.clear();markProjectDirty();refreshDoorLayers();draw();
  });
  $("hideAllDoorLayersBtn").addEventListener("click",()=>{
    state.hiddenDoorTypes=new Set(doorLayerCounts().keys());markProjectDirty();refreshDoorLayers();draw();
  });

  function drawDoorOverlay(segment, wall) {
    if (!wall.doors?.length) return;
    const dx=segment.x2-segment.x1,dy=segment.y2-segment.y1;
    const screenA=worldToScreen(segment.x1,segment.y1),screenB=worldToScreen(segment.x2,segment.y2);
    const length=Math.hypot(screenB.x-screenA.x,screenB.y-screenA.y)||1;
    const nx=-(screenB.y-screenA.y)/length,ny=(screenB.x-screenA.x)/length;
    for (const door of wall.doors) {
      if(!isDoorVisible(door))continue;
      const color=doorLayerColor(door.doorType||"");
      const half=door.widthFt/wall.lengthFt/2;
      const a=worldToScreen(segment.x1+dx*(door.centerT-half),segment.y1+dy*(door.centerT-half));
      const b=worldToScreen(segment.x1+dx*(door.centerT+half),segment.y1+dy*(door.centerT+half));
      ctx.strokeStyle=color;ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      ctx.lineWidth=2;ctx.beginPath();
      for (const p of [a,b]) {ctx.moveTo(p.x-nx*9,p.y-ny*9);ctx.lineTo(p.x+nx*9,p.y+ny*9);}ctx.stroke();
      ctx.fillStyle=color;ctx.font="bold 12px system-ui";ctx.textAlign="center";
      const label=(door.doorType ? door.doorType+" · " : "Custom · ")+door.label;
      const lx=(a.x+b.x)/2+nx*18,ly=(a.y+b.y)/2+ny*18;
      ctx.save();ctx.strokeStyle=state.darkDrawing?"#090b0e":"#fafbfd";ctx.lineWidth=4;ctx.strokeText(label,lx,ly);ctx.fillText(label,lx,ly);ctx.restore();
    }
  }

  function pointDoorOnWall(sx,sy) {
    let best=null,distance=18;
    for (const wall of state.walls.values()) {
      if(state.hiddenWallTypes.has(wall.wallType||""))continue;
      const segment=state.segments.find(s=>s.id===wall.segmentId);if(!segment)continue;
      const a=worldToScreen(segment.x1,segment.y1),b=worldToScreen(segment.x2,segment.y2);
      const d=pointSegmentDistance(sx,sy,a.x,a.y,b.x,b.y);
      if(d<distance){best={wall,a,b};distance=d;}
    }
    if(!best){$("hintbar").textContent="DOOR: tap a saved, visible wall near the opening center.";return;}
    const {wall,a,b}=best;const dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((sx-a.x)*dx+(sy-a.y)*dy)/(dx*dx+dy*dy)));
    const existing=(wall.doors||[]).find(d=>Math.abs(d.centerT-t)*wall.lengthFt<=d.widthFt/2);
    selectSegment(wall.segmentId);
    openDoorDialog(wall.segmentId,t,existing);
  }

  function doorRecipe(door) {
    return Object.fromEntries(["widthFt","heightFt","jambMaterial","jambsPerSide","headerRuns","headerDepthIn"].map(key=>[key,door[key]]));
  }
  function cleanDoorTypes(raw) {
    const result = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
    for (const [name, value] of Object.entries(raw)) {
      if (!name.trim() || name.length>60 || !value) continue;
      try {
        const recipe=doorRecipe(value);
        AtlasQuantities.wallQuantities(Math.max(100,recipe.widthFt+2),
          {height:Math.max(100,recipe.heightFt+recipe.headerDepthIn/12+1),spacing:16},
          [{...recipe,centerT:0.5}]);
        Object.defineProperty(result,name,{value:recipe,enumerable:true,writable:true,configurable:true});
      } catch (_) {}
    }
    return result;
  }
  function loadDoorTypes() {
    try { return cleanDoorTypes(JSON.parse(localStorage.getItem("atlasDoorTypesV1")||"{}")); }
    catch (_) { return {}; }
  }
  function persistDoorTypes() {
    try { localStorage.setItem("atlasDoorTypesV1",JSON.stringify(state.doorTypes)); return true; }
    catch (_) { return false; }
  }
  function refreshDoorTypeSelect(selected="") {
    const select=$("doorTypeSelect");
    select.replaceChildren(new Option("Custom / unassigned",""));
    const names=new Set(Object.keys(state.doorTypes));
    if(selected) names.add(selected);
    for(const name of [...names].sort()) select.add(new Option(name,name));
    select.value=selected;
    $("doorTypeName").value=selected;
  }
  function applyDoorType(name) {
    const recipe=state.doorTypes[name];
    if(!recipe)return;
    const fields={widthFt:"doorWidthFt",heightFt:"doorHeightFt",jambMaterial:"doorJambMaterial",
      jambsPerSide:"doorJambsPerSide",headerRuns:"doorHeaderRuns",headerDepthIn:"doorHeaderDepthIn"};
    for(const [key,id] of Object.entries(fields)) $(id).value=recipe[key];
    $("doorTypeName").value=name;
  }
  $("doorTypeSelect").addEventListener("change",()=>{
    applyDoorType($("doorTypeSelect").value);
    state.activeDoorType=$("doorTypeSelect").value;
    updateDoorPreview();
  });
  for(const id of ["doorWidthFt","doorHeightFt","doorJambMaterial","doorJambsPerSide","doorHeaderRuns","doorHeaderDepthIn"]) {
    $(id).addEventListener("input",()=>{ $("doorTypeSelect").value=""; updateDoorPreview(); });
    $(id).addEventListener("change",()=>{ $("doorTypeSelect").value=""; updateDoorPreview(); });
  }
  $("saveDoorTypeBtn").addEventListener("click",()=>{
    const name=$("doorTypeName").value.trim();
    if(!name){$("doorStatus").textContent="Enter a type name.";return;}
    const recipe=doorRecipe(doorFromFields());
    if(!Object.hasOwn(cleanDoorTypes({[name]:recipe}),name)){
      $("doorStatus").textContent="Enter valid positive dimensions and jamb/header settings.";return;
    }
    Object.defineProperty(state.doorTypes,name,{value:recipe,enumerable:true,writable:true,configurable:true});
    state.activeDoorType=name;
    const stored=persistDoorTypes();
    refreshDoorTypeSelect(name);markProjectDirty();updateDoorPreview();
    $("doorStatus").textContent="Door type saved. Existing doors keep their details."+
      (stored?"":" Browser storage unavailable; download a project backup.");
  });
  function refreshDoorTypeCounts() {
    const container=$("doorTypeCounts");container.replaceChildren();
    const groups=new Map();
    for(const wall of state.walls.values()) for(const door of wall.doors||[]) {
      const name=door.doorType||"Custom / unassigned";
      const key=JSON.stringify([name,doorRecipe(door)]);
      if(!groups.has(key))groups.set(key,{name,door,count:0});
      groups.get(key).count++;
    }
    let total=0;
    for(const {name,door,count} of [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name))) {
      total+=count;
      const row=document.createElement("div");row.className="summary-group";
      const title=document.createElement("strong");title.textContent=name+" — "+count+" door(s)";
      const details=document.createElement("div");
      details.textContent=door.widthFt+" × "+door.heightFt+" ft · "+door.jambsPerSide+" "+door.jambMaterial+
        " jamb(s)/side · "+door.headerRuns+" header run(s) · "+door.headerDepthIn+" in header depth";
      row.append(title,details);container.append(row);
    }
    const footer=document.createElement("strong");footer.textContent="Total: "+total+" door(s)";container.append(footer);
  }

  function openDoorDialog(wallId,centerT,door=null) {
    const wall=state.walls.get(wallId);if(!wall)return;
    if(door) {state.hiddenDoorTypes.delete(door.doorType||"");refreshDoorLayers();draw();}
    state.editingDoor={wallId,doorId:door?.id||null};
    $("doorDialogTitle").textContent=`${door?"Edit":"Add"} Door — ${wall.wallNumber}`;
    const nextDoorNumber=Math.max(0,...(wall.doors||[]).map(d=>Number(d.label.match(/^D-(\d+)$/)?.[1])||0))+1;
    $("doorLabel").value=door?.label||`D-${nextDoorNumber}`;
    $("doorCenterFt").value=((door?.centerT??centerT)*wall.lengthFt).toFixed(4);
    $("doorWidthFt").value=door?.widthFt??3;
    $("doorHeightFt").value=door?.heightFt??7;
    $("doorJambMaterial").value=door?.jambMaterial||"metal";
    $("doorJambsPerSide").value=door?.jambsPerSide??2;
    $("doorHeaderRuns").value=door?.headerRuns??1;
    $("doorHeaderDepthIn").value=door?.headerDepthIn??0;
    refreshDoorTypeSelect(door ? door.doorType || "" : state.activeDoorType);
    if (!door && state.activeDoorType) applyDoorType(state.activeDoorType);
    $("doorStatus").textContent="";
    $("doorDialog").classList.remove("hidden");updateDoorPreview();
  }

  function doorFromFields() {
    const wall=state.walls.get(state.editingDoor.wallId);
    return { doorType:$("doorTypeSelect").value, id:state.editingDoor.doorId||crypto.randomUUID(),label:$("doorLabel").value.trim(),
      centerT:Number($("doorCenterFt").value)/wall.lengthFt,widthFt:Number($("doorWidthFt").value),heightFt:Number($("doorHeightFt").value),
      jambMaterial:$("doorJambMaterial").value,jambsPerSide:Number($("doorJambsPerSide").value),
      headerRuns:Number($("doorHeaderRuns").value),headerDepthIn:Number($("doorHeaderDepthIn").value) };
  }

  function updateDoorPreview() {
    if(!state.editingDoor)return;
    const wall=state.walls.get(state.editingDoor.wallId);const door=doorFromFields();
    try {
      const doors=[...(wall.doors||[]).filter(d=>d.id!==state.editingDoor.doorId),door];
      const q=AtlasQuantities.wallQuantities(wall.lengthFt,wall,doors);
      $("doorSketch").innerHTML=AtlasDoorSketch.render({...wall,doors},door);
      $("doorFormulaPreview").textContent=`Wall after change: ${q.fullHeightStudQty} full-height metal studs, ${q.crippleGroups.reduce((n,g)=>n+g.quantity,0)} cripple studs, ${q.woodJambQty} wood jambs, ${q.bottomTrackFt.toFixed(2)} LF bottom track, ${q.headerTrackFt.toFixed(2)} LF header track, ${q.netAreaFt2.toFixed(2)} SF net area. Framing waste included.`;
    }catch(err){
      $("doorFormulaPreview").textContent=err.message;
      $("doorSketch").textContent="Preview unavailable: "+err.message;
    }
  }

  function updateDoorModeUI() {
    $("placeDoorBtn").classList.toggle("active-tool",state.placingDoor);
    $("placeDoorBtn").setAttribute("aria-pressed",String(state.placingDoor));
    $("placeDoorBtn").textContent=state.placingDoor ? "DOOR ✓" : "DOOR";
  }
  function closeDoorDialog(){
    $("doorDialog").classList.add("hidden");state.editingDoor=null;
    if(state.placingDoor) $("hintbar").textContent="DOOR ON: tap the next opening. Press DOOR again to turn off.";
  }
  $("placeDoorBtn").addEventListener("click",()=> {
    if(!state.walls.size){alert("Save or trace a wall first, then use DOOR to point to an opening.");return;}
    if (state.toolMode === 'tape') { state.toolMode = 'wall'; state.tape.preview = null; updateToolUI(); }
    state.placingDoor=!state.placingDoor;
    state.calibration.activePoint=null;
    updateDoorModeUI();
    $("hintbar").textContent=state.placingDoor?"DOOR: tap the center of a door on a saved wall. Tap an existing door to edit it.":"Tap wall • Drag pan • Pinch zoom";
    setPanelsVisible(false);
  });
  $("addWallDoorBtn").addEventListener("click",()=>openDoorDialog(state.selectedId,0.5));
  $("closeDoorDialogBtn").addEventListener("click",closeDoorDialog);
  $("cancelDoorBtn").addEventListener("click",closeDoorDialog);
  $("doorForm").addEventListener("input",updateDoorPreview);
  $("doorForm").addEventListener("change",updateDoorPreview);
  $("doorForm").addEventListener("submit",event=> {
    event.preventDefault();const wall=state.walls.get(state.editingDoor.wallId);const door=doorFromFields();
    const doors=[...(wall.doors||[]).filter(d=>d.id!==state.editingDoor.doorId),door];
    try{
      if(!door.label)throw new Error("Enter a door label.");
      if(doors.some(d=>d.id!==door.id&&d.label.toLowerCase()===door.label.toLowerCase()))throw new Error("That door label is already in use on this wall.");
      const q=AtlasQuantities.wallQuantities(wall.lengthFt,wall,doors);
      state.activeDoorType=door.doorType;
      pushTakeoffHistory();wall.doors=doors;Object.assign(wall,q);closeDoorDialog();
      refreshTables();selectSegment(wall.segmentId);draw();
      $("hintbar").textContent=`${door.label} saved. Framing and assembly materials updated.${state.placingDoor ? " DOOR stays ON — tap the next opening." : ""}`;
    }catch(err){$("doorStatus").textContent=err.message;}
  });
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape") {closeDoorDialog();}
  });

  function assemblyPartQuantity(part, wall) {
    return AtlasQuantities.partQuantity(part, wall);
  }

  function readAssemblyParts() {
    return [...$("assemblyPartsEditor").querySelectorAll(".assembly-part")].map(row => ({
      name: row.querySelector('[data-field="name"]').value.trim(),
      folder: row.querySelector('[data-field="folder"]').value.trim() || "My materials",
      unit: row.querySelector('[data-field="unit"]').value.trim(),
      basis: row.querySelector('[data-field="basis"]').value,
      formula: row.querySelector('[data-field="formula"]').value,
      materialKind: row.querySelector('[data-field="materialKind"]').value,
      sheetWidthFt: Number(row.querySelector('[data-field="sheetWidthFt"]').value),
      sheetHeightFt: Number(row.querySelector('[data-field="sheetHeightFt"]').value),
      factor: Number(row.querySelector('[data-field="factor"]').value),
      wastePercent: Number(row.querySelector('[data-field="wastePercent"]').value),
      roundUp: row.querySelector('[data-field="roundUp"]').checked
    }));
  }

  function refreshAssemblyPreview() {
    const template = editorTemplateFromFields();
    const wall = { ...template, ...AtlasQuantities.wallQuantities(10, template), doors: [] };
    const preview = $("assemblyPreview");
    preview.replaceChildren();
    preview.appendChild(makeSummaryGroup(`Example: 10 LF wall × ${wall.height}' high`, readAssemblyParts().map(part =>
      [part.name || "Unnamed part", `${assemblyPartQuantity(part, wall).toFixed(2)} ${part.unit}`])));
    const metrics=AtlasQuantities.boardMetrics(wall);
    const note=document.createElement("div");note.className="muted";
    note.textContent=metrics.drywallArea>0?`Installed board: ${metrics.drywallArea.toFixed(2)} SF · layout joints/edges: ${metrics.tapeLf.toFixed(2)} LF (all configured faces/layers).`:
      "Add a drywall board part in SF to calculate compound, tape, and installed-area screw quantities.";
    preview.append(note);
  }

  function addAssemblyPart(part = {}) {
    const row = document.createElement("div");
    row.className = "assembly-part";
    row.innerHTML = `
      <label>Library folder (choose or type a new folder)<input data-field="folder" list="materialFolders" maxlength="80" placeholder="Screws / Stud to track"></label>
      <label>Material role<select data-field="materialKind"><option value="general">General material</option><option value="drywall">Drywall board (SF, area × faces/layers)</option></select></label>
      <div class="field-row" data-board-dimensions><label>Board width (ft)<input data-field="sheetWidthFt" type="number" min="0.1" step="any"></label><label>Board height (ft)<input data-field="sheetHeightFt" type="number" min="0.1" step="any"></label></div>
      <div class="field-row"><label>Material<input data-field="name" maxlength="100"></label>
      <label>Output unit<input data-field="unit" maxlength="20" placeholder="SF, LF, pcs, sheets"></label></div>
      <div class="field-row"><label>Calculate from<select data-field="basis">
        <option value="area">Net wall area (SF, one face)</option><option value="grossArea">Gross wall area (SF)</option><option value="length">Wall length (LF)</option>
        <option value="drywallArea">Installed drywall SF (all board parts, before waste)</option><option value="drywallSheets">Configured sheet equivalents</option>
        <option value="tapeLf">Board layout joints once + edges (LF)</option><option value="sheetEdgesLf">All sheet perimeters (LF, shared edges counted twice)</option>
        <option value="topTrack">Top track run (LF)</option><option value="bottomTrack">Bottom track runs, doors deducted (LF)</option>
        <option value="doors">Door count</option><option value="jambs">Jamb pieces (before waste)</option><option value="doorPerimeter">Door perimeter: sides + head (LF)</option>
        <option value="wall">Each wall</option><option value="studs">Stud quantity (incl. framing waste)</option>
      </select></label><label>Formula<select data-field="formula"><option value="multiply">Multiply: base × factor</option><option value="coverage">Coverage: base ÷ coverage per unit</option><option value="spacing">Spacing: inches on center + both ends</option></select></label></div>
      <label>Factor / coverage / spacing in inches<input data-field="factor" type="number" min="0" step="any"></label>
      <div class="field-row"><label>Part waste %<input data-field="wastePercent" type="number" min="0" max="100" step="any"></label>
      <label class="checkline"><input data-field="roundUp" type="checkbox">Round up per wall</label></div>
      <div class="assembly-part-actions"><button class="button compact-button save-library-part" type="button">Save / Update in Library</button>
      <button class="text-button remove-assembly-part" type="button">Remove from assembly</button></div>`;
    for (const field of ["name", "folder", "unit", "basis", "formula", "materialKind", "sheetWidthFt", "sheetHeightFt", "factor", "wastePercent"]) {
      const inferredBoard = part.unit === "SF" && (part.folder === "Drywall" || /drywall/i.test(part.name || ""));
      row.querySelector(`[data-field="${field}"]`).value = part[field] ?? ({ name: "", folder: "My materials", unit: "pcs", basis: "area", formula: "multiply", materialKind: inferredBoard ? "drywall" : "general", sheetWidthFt: 4, sheetHeightFt: 10, factor: 1, wastePercent: 0 })[field];
    }
    row.querySelector('[data-field="roundUp"]').checked = !!part.roundUp;
    const syncBoardFields=()=>row.classList.toggle("drywall-board",row.querySelector('[data-field="materialKind"]').value==="drywall");
    syncBoardFields();
    row.querySelector('[data-field="materialKind"]').addEventListener("change",syncBoardFields);
    row.addEventListener("input", refreshAssemblyPreview);
    row.addEventListener("change", refreshAssemblyPreview);
    row.querySelector(".remove-assembly-part").addEventListener("click", () => { row.remove(); refreshAssemblyPreview(); });
    row.querySelector(".save-library-part").addEventListener("click", () => {
      const rows = [...$("assemblyPartsEditor").querySelectorAll(".assembly-part")];
      const savedPart = readAssemblyParts()[rows.indexOf(row)];
      if (!savedPart.name || !savedPart.unit || !Number.isFinite(savedPart.factor) || savedPart.factor < 0 ||
          !Number.isFinite(savedPart.wastePercent) || savedPart.wastePercent < 0 || savedPart.wastePercent > 100 || !validPartFormula(savedPart)) {
        $("partsLibraryStatus").textContent = "Check name, unit, factor and waste. Coverage/spacing need positive rates; spacing requires a length base.";
        return;
      }
      const index = state.materialLibrary.findIndex(p => p.name.toLowerCase() === savedPart.name.toLowerCase() && p.folder.toLowerCase() === savedPart.folder.toLowerCase());
      if (index >= 0) state.materialLibrary[index] = savedPart;
      else state.materialLibrary.push(savedPart);
      const stored = persistMaterialLibrary();
      markProjectDirty();
      refreshMaterialLibrary();
      $("partsLibraryStatus").textContent = `Saved ${savedPart.name} in ${savedPart.folder}.${stored ? "" : " Browser storage is unavailable; download a project backup to keep this library."}`;
    });
    $("assemblyPartsEditor").appendChild(row);
    refreshAssemblyPreview();
  }

  function renderAssemblyParts(parts) {
    $("assemblyPartsEditor").replaceChildren();
    for (const part of parts) addAssemblyPart(part);
    refreshAssemblyPreview();
  }

  function loadMaterialLibrary() {
    try {
      const items = JSON.parse(localStorage.getItem("atlasMaterialLibraryV1") || "[]");
      return Array.isArray(items) ? items.filter(p => p && typeof p.name === "string" && typeof p.folder === "string") : [];
    } catch (_) { return []; }
  }

  function persistMaterialLibrary() {
    try { localStorage.setItem("atlasMaterialLibraryV1", JSON.stringify(state.materialLibrary)); return true; }
    catch (_) { return false; }
  }

  function builtinMaterialParts() {
    const parts = [];
    const add = (folder, name, unit = "pcs", basis = "length", factor = 0, roundUp = true) =>
      parts.push({ folder, name, unit, basis, factor, wastePercent: 0, roundUp });
    for (const position of ["Top", "Bottom"]) {
      for (const substrate of ["Steel beam", "Concrete", "Steel deck"]) {
        for (const fastener of ["Nails", "Screws"]) {
          add(`Track attachments / ${position} / ${substrate}`, `${position} track ${fastener.toLowerCase()} — ${substrate}`, "pcs", position === "Top" ? "topTrack" : "bottomTrack", substrate === "Concrete" && fastener === "Nails" ? 8/10 : 0);
        }
      }
    }
    for (const size of ["#8", "#10", "#12", "#14"]) add("Screws / Stud to track", `${size} stud-to-track screws`, "pcs", "studs");
    for (const point of ["Sharp point", "Self drilling"]) {
      for (const length of ['1-1/4"', '1-7/8"']) add(`Screws / Drywall / ${point}`, `${length} ${point.toLowerCase()} drywall screws`, "pcs", "drywallArea", 1);
    }
    add("Drywall", '5/8" drywall — two faces', "SF", "area", 2, false);
    add("Insulation", "Batt insulation", "SF", "area", 1, false);
    add("Finishing / Tape", "Paper joint tape", "LF", "area", 0, false);
    add("Finishing / Mud", "Drywall joint compound", "gallons", "area", 0, false);
    add("Finishing / Sanding", "Sanding sheets", "pcs", "area");
    add("Doors / Fasteners", "Door frame nails", "pcs", "doors");
    add("Doors / Fasteners", "Door jamb nails", "pcs", "jambs");
    add("Doors", "Door unit", "each", "doors", 1, false);
    parts.push(...finishRuleParts());
    return parts;
  }

  function availableMaterialParts() {
    const merged = new Map();
    for (const part of [...builtinMaterialParts(), ...state.materialLibrary]) {
      merged.set(JSON.stringify([part.folder.toLowerCase(), part.name.toLowerCase()]), part);
    }
    return [...merged.values()].sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  function refreshMaterialLibrary() {
    const select = $("assemblyLibrarySelect");
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choose a material or screw…";
    select.append(placeholder);
    const groups = new Map();
    const folders = $("materialFolders");
    folders.replaceChildren();
    for (const [index, part] of availableMaterialParts().entries()) {
      if (!groups.has(part.folder)) {
        const group = document.createElement("optgroup"); group.label = part.folder;
        groups.set(part.folder, group); select.append(group);
        const option = document.createElement("option"); option.value = part.folder; folders.append(option);
      }
      const option = document.createElement("option");
      option.value = String(index); option.textContent = part.name;
      groups.get(part.folder).append(option);
    }
  }

  $("addLibraryPartBtn").addEventListener("click", () => {
    const value = $("assemblyLibrarySelect").value;
    if (value === "") { $("partsLibraryStatus").textContent = "Choose a part from the library first."; return; }
    const part = availableMaterialParts()[Number(value)];
    if (part) {
      addAssemblyPart(structuredClone(part));
      $("partsLibraryStatus").textContent = part.factor === 0
        ? `Added ${part.name}. Set its quantity per base unit before saving the assembly.`
        : `Added ${part.name}.`;
    }
  });

  function finishRuleParts() {
    return [
      {folder:"My quantity rules / Compound",name:"Drywall compound — 5-gallon bucket",unit:"buckets",basis:"drywallArea",formula:"coverage",factor:320,wastePercent:0,roundUp:false},
      {folder:"My quantity rules / Tape",name:"Paper tape — 250 LF roll",unit:"rolls",basis:"tapeLf",formula:"coverage",factor:250,wastePercent:0,roundUp:false}
    ];
  }
  $("addFinishRulesBtn").addEventListener("click",()=>{
    const existing=readAssemblyParts();let added=0;
    for(const part of finishRuleParts()) {
      if(!existing.some(p=>p.name===part.name&&p.unit===part.unit)){addAssemblyPart(part);added++;}
    }
    $("partsLibraryStatus").textContent=added?"Added compound and tape rules. Quantities use installed board parts; fractional buckets/rolls are kept unless you select rounding per wall.":"These finishing rules are already in this assembly.";
  });
  $("newAssemblyBtn").addEventListener("click", () => openWallTypeEditor());
  $("addDrywallPartBtn").addEventListener("click", () => addAssemblyPart({ name: '5/8" drywall', unit: "SF", basis: "area", factor: 2 }));
  $("addInsulationPartBtn").addEventListener("click", () => addAssemblyPart({ name: "Batt insulation", unit: "SF", basis: "area", factor: 1 }));
  $("addCustomPartBtn").addEventListener("click", () => addAssemblyPart());
  for (const id of ["editTypeHeight", "editTypeSpacing", "editTypeDoubleEnds", "editTypeWaste"]) {
    $(id).addEventListener("input", refreshAssemblyPreview);
    $(id).addEventListener("change", refreshAssemblyPreview);
  }

  function setPanelsVisible(visible) {
    const center = captureViewerCenter();
    document.body.classList.toggle("panels-hidden", !visible);
    $("takeoffPanels").hidden = !visible;
    $("togglePanelsBtn").textContent = visible ? "TAKEOFF ▴" : "TAKEOFF ▾";
    $("togglePanelsBtn").setAttribute("aria-expanded", String(visible));
    requestAnimationFrame(() => {
      const rect = canvas.getBoundingClientRect();
      if (center) {
        state.view.offsetX = rect.width / 2 - center.x * state.view.scale;
        state.view.offsetY = rect.height / 2 + center.y * state.view.scale;
      }
      resizeCanvas();
    });
  }

  $("togglePanelsBtn").addEventListener("click", () => {
    setPanelsVisible(document.body.classList.contains("panels-hidden"));
  });
  $("closeTakeoffPanelsBtn").addEventListener("click", () => setPanelsVisible(false));
  document.addEventListener("pointerdown", (event) => {
    if (!state.ceilingDrawing && $("ceilingPanel").hidden && !$("takeoffPanels").hidden &&
        !$("takeoffPanels").contains(event.target) &&
        !$("togglePanelsBtn").contains(event.target) &&
        $("wallTypeEditorDialog").classList.contains("hidden")) {
      setPanelsVisible(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("takeoffPanels").hidden) {
      setPanelsVisible(false);
      $("togglePanelsBtn").focus();
    }
  });


  // v2.6 ACT takeoff: click pre-drawn RCP loops, use two rectangle corners, or trace.
  // Pinch zooms the drawing; a real-world 2-foot grid is NEVER resized by pinching.
  const ceilingDefaults=()=>({system:'act',tile:'2x2',waste:5,angle:0,offsetX:0,offsetY:0,
    rigidMainSpacing:4,rigidCrossSpacing:24,rigidWireSpacing:48,boardWidth:4,boardLength:8,
    boardThickness:'5/8',boardLayers:1,boardRotation:'0',boardStagger:true,
    boardOffsetX:0,boardOffsetY:0,showRigidFraming:true,showBoardLayout:true,boardDisplayMode:'hatch',showBoardNumbers:true});
  // Backward-compatible rendering for ceiling projects saved before v2.8.
  const ceilingBoardDisplay=c=>['hatch','shaded','outline','hidden'].includes(c?.boardDisplayMode)
    ?c.boardDisplayMode:(c?.showBoardLayout===false?'hidden':'hatch');
  const ceilingSystem=c=>c?.system==='rigidx'?'rigidx':'act';
  function updateCeilingSystemUI(){
    const rigid=$('ceilingSystem').value==='rigidx';
    $('rigidCeilingOptions').hidden=!rigid;
    $('actCeilingOptions').hidden=rigid;
  }
  const selectedCeiling=()=>state.ceilings.find(c=>c.id===state.ceilingSelected)||null;
  function nextCeilingNumber(){
    const nums=state.ceilings.map(c=>/^C-(\d+)$/i.exec(c.number||'')?.[1]).filter(Boolean).map(Number);
    return `C-${String((nums.length?Math.max(...nums):0)+1).padStart(3,'0')}`;
  }
  function ceilingOptions(){
    return {system:$('ceilingSystem').value,tile:$('ceilingTile').value,waste:Number($('ceilingWaste').value),
      angle:Number($('ceilingAngle').value),offsetX:Number($('ceilingOffsetX').value),offsetY:Number($('ceilingOffsetY').value),
      rigidMainSpacing:Number($('rigidMainSpacing').value),rigidCrossSpacing:Number($('rigidCrossSpacing').value),
      rigidWireSpacing:Number($('rigidWireSpacing').value),boardWidth:Number($('boardWidth').value),
      boardLength:Number($('boardLength').value),boardThickness:$('boardThickness').value,
      boardLayers:Number($('boardLayers').value),boardRotation:$('boardRotation').value,
      boardStagger:$('boardStagger').checked,boardOffsetX:Number($('boardOffsetX').value),
      boardOffsetY:Number($('boardOffsetY').value),showRigidFraming:$('showRigidFraming').checked,
      boardDisplayMode:$('boardDisplayMode').value,
      showBoardLayout:$('boardDisplayMode').value!=='hidden',showBoardNumbers:$('showBoardNumbers').checked};
  }
  function ceilingResult(c){
    return ceilingSystem(c)==='rigidx' ? AtlasDrywallCeiling.calculate(c.points,activeFeetPerUnit(),c) : AtlasCeilingGrid.calculate(c.points,activeFeetPerUnit(),c);
  }
  function normalizeCeilingNumbers(){
    const used=new Set();
    for(const c of state.ceilings){
      let n=String(c.number||'').trim();
      if(!n || used.has(n.toLowerCase())){
        let i=1;do{n=`C-${String(i++).padStart(3,'0')}`}while(used.has(n.toLowerCase()));
        c.number=n;
      }
      used.add(n.toLowerCase());
    }
  }
  function clearCeilingModes(){
    state.ceilingDrawing=false;state.ceilingDraft=[];
    state.ceilingPickMode=false;state.ceilingRectMode=false;state.ceilingRectDraft=[];
    state.ceilingMoveMode=false;state.ceilingDragStart=null;
    updateCeilingModeButtons();
  }
  function updateCeilingModeButtons(){
    for(const [id,on,onText,offText] of [
      ['ceilingPickBtn',state.ceilingPickMode,'CANCEL PICK','PICK DXF OUTLINE'],
      ['ceilingRectBtn',state.ceilingRectMode,'CANCEL CORNERS','2 CORNERS'],
      ['ceilingMoveBtn',state.ceilingMoveMode,'MOVE GRID: ON','MOVE GRID: OFF']]){
      const b=$(id);if(!b)continue;
      b.textContent=onText && on?onText:offText;
      b.classList.toggle('active-tool',on);b.setAttribute('aria-pressed',on?'true':'false');
    }
  }
  function syncCeilingPanel(){
    normalizeCeilingNumbers();
    const sel=$('ceilingSelect');if(!sel)return;
    sel.replaceChildren(new Option('Choose ceiling…',''));
    state.ceilings.forEach(c=>sel.add(new Option(`${c.number} · ${c.name||'Ceiling'}`,c.id)));
    const c=selectedCeiling();sel.value=c?.id||'';
    // When starting a second ceiling, keep the currently chosen assembly and sheet size.
    // The old version reset the form to ACT whenever a new outline was selected.
    $('ceilingNumber').value=c?.number||nextCeilingNumber();
    if(c){
      $('ceilingName').value=c.name||'Ceiling';
      $('ceilingSystem').value=ceilingSystem(c);
      $('ceilingTile').value=c.tile||'2x2';
      for(const [id,key] of [['ceilingWaste','waste'],['ceilingAngle','angle'],['ceilingOffsetX','offsetX'],['ceilingOffsetY','offsetY'],
        ['rigidMainSpacing','rigidMainSpacing'],['rigidCrossSpacing','rigidCrossSpacing'],['rigidWireSpacing','rigidWireSpacing'],
        ['boardWidth','boardWidth'],['boardLength','boardLength'],['boardThickness','boardThickness'],
        ['boardLayers','boardLayers'],['boardRotation','boardRotation'],['boardOffsetX','boardOffsetX'],
        ['boardOffsetY','boardOffsetY']])$(id).value=c[key]??ceilingDefaults()[key];
      for(const id of ['boardStagger','showRigidFraming','showBoardNumbers'])$(id).checked=c[id]??ceilingDefaults()[id];
      $('boardDisplayMode').value=ceilingBoardDisplay(c);
    }else{
      $('ceilingName').value=`${$('ceilingSystem').value==='rigidx'?'RX':'ACT'}-${state.ceilings.length+1}`;
    }
    updateCeilingSystemUI();updateCeilingModeButtons();updateCeilingStats();refreshCeilingMarkups();
  }
  function updateCeilingStats(){
    const target=$('ceilingStats');if(!target)return;
    const c=selectedCeiling();
    $('ceilingCloseBtn').disabled=!state.ceilingDrawing||state.ceilingDraft.length<3;
    $('ceilingTraceBtn').textContent=state.ceilingDrawing?`DRAWING: ${state.ceilingDraft.length} CORNERS`:'+ NEW CEILING AREA';
    if(!c){
      target.textContent=state.ceilingDrawing?'Tap at least 3 corners, then CLOSE CEILING.':
        state.ceilingPickMode?'Tap inside an outlined ceiling or near its DXF boundary.':
        state.ceilingRectMode?`Select ${state.ceilingRectDraft.length?'opposite':'first'} rectangle corner.`:
        'Pick a closed DXF outline, select two rectangle corners, or trace an irregular boundary.';
      return;
    }
    try{
      const r=ceilingResult(c),f=n=>Number(n).toFixed(1),qty=(label,n,unit='')=>`<tr><td>${label}</td><td>${n}${unit}</td></tr>`;
      if(ceilingSystem(c)==='rigidx'){
        target.innerHTML=`<strong>${escapeHtml(c.number)} · RIGID X / DRYWALL · ${f(r.areaSqFt)} SF</strong><table>
        ${qty('Framing main spacing',r.mainSpacing,' ft OC')}${qty('Cross tee spacing',r.crossSpacing*12,' in OC')}
        ${qty('12 ft mains (order incl. waste)',r.mainOrder,' pcs')}${qty('Installed mains',f(r.mainLF),' LF')}
        ${qty(`${r.crossLength} ft drywall cross tees (order)`,r.crossOrder,' pcs')}${qty('Cross tees installed',f(r.crossLF),' LF')}
        ${qty('Perimeter angle',f(r.perimeterLF),' LF')}${qty('10 ft wall angle (order)',r.wallAngle10,' pcs')}
        ${qty('Hanger locations (estimate with waste)',r.hangerOrder)}
        ${qty('Drywall size',`${r.boardWidth} × ${r.boardLength} ft · ${escapeHtml(r.boardThickness)} in · ${r.sheetLayers} layer(s)`)}
        ${qty('Full / cut board locations (layer 1)',`${r.fullBoards} / ${r.cutBoards}`)}
        ${qty('Total board SF (all layers)',f(r.boardSF),' SF')}
        ${qty('Area minimum board order (waste)',r.boardOrderMin,' sheets')}
        ${qty('Conservative board order (no cut reuse)',r.boardOrderConservative,' sheets')}
        </table><small class="muted">Drywall drawing shows first-layer sheet joints only. Verify joints land on framing, additional supports, UL details and cut reuse before ordering.</small>`;
        return;
      }
      target.innerHTML=`<strong>${escapeHtml(c.number)} · ${f(r.areaSqFt)} SF · ${c.tile==='2x4'?'2′×4′':'2′×2′'} grid</strong><table>
       ${qty('Total touched tile locations',r.tiles)}${qty('Full / cut tile locations',`${r.fullTiles} / ${r.cutTiles}`)}
       ${qty('Tile order incl. waste',r.tileOrder)}${qty('Main runners, 12′ estimated',r.mainOrder)}
       ${qty('Main runner installed',f(r.mainLF),' LF')}${qty('4′ cross tees',r.tee4Order)}
       ${qty('2′ cross tees',r.tee2Order)}${qty('Perimeter wall angle',f(r.perimeterLF),' LF')}
       ${qty('Wall angle 10′ pieces',r.wallAngle10)}${qty('Hanger wire locations',r.hangerOrder)}</table>`;
    }catch(e){target.textContent=e.message;}
  }
  function refreshCeilingMarkups(){
    const body=$('ceilingMarkupsBody');if(!body)return;
    body.replaceChildren();$('ceilingMarkupsCount').textContent=String(state.ceilings.length);
    const sorted=[...state.ceilings].sort((a,b)=>(a.number||'').localeCompare(b.number||'',undefined,{numeric:true}));
    for(const c of sorted){
      const tr=document.createElement('tr');
      if(c.id===state.ceilingSelected)tr.classList.add('selected-markup');
      let area='—';try{area=ceilingResult(c).areaSqFt.toFixed(1);}catch(_){}
      for(const value of [c.number,c.name||'Ceiling',ceilingSystem(c)==='rigidx'?`RX ${c.boardWidth||4}×${c.boardLength||8}`:(c.tile==='2x4'?'2×4':'2×2'),area]){
        const td=document.createElement('td');td.textContent=String(value);tr.appendChild(td);
      }
      const action=document.createElement('td');
      const find=document.createElement('button');find.className='ceiling-row-btn';find.textContent='Find';
      find.addEventListener('click',e=>{e.stopPropagation();state.ceilingSelected=c.id;syncCeilingPanel();focusCeiling(c);});
      const remove=document.createElement('button');remove.className='ceiling-row-btn danger';remove.textContent='×';
      remove.title=`Delete ${c.number}`;
      remove.addEventListener('click',e=>{e.stopPropagation();deleteCeiling(c);});
      action.append(find,remove);tr.appendChild(action);
      tr.addEventListener('click',e=>{if(e.target.closest('button'))return;state.ceilingSelected=c.id;syncCeilingPanel();draw();});
      body.appendChild(tr);
    }
    if(!sorted.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=5;td.className='muted';td.textContent='No ceiling markups saved yet.';tr.appendChild(td);body.appendChild(tr);}
  }
  function focusCeiling(c){
    if(!c?.points?.length)return;
    const xs=c.points.map(p=>p.x),ys=c.points.map(p=>p.y);
    const b={minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
    const rect=canvas.getBoundingClientRect(),pad=55;
    state.view.scale=Math.max(0.00001,Math.min((rect.width-pad*2)/Math.max(1e-7,b.maxX-b.minX),(rect.height-pad*2)/Math.max(1e-7,b.maxY-b.minY)));
    state.view.offsetX=rect.width/2-((b.minX+b.maxX)/2)*state.view.scale;
    state.view.offsetY=rect.height/2+((b.minY+b.maxY)/2)*state.view.scale;
    draw();
  }
  function selectCeilingAt(sx,sy){
    const p=screenToWorld(sx,sy);
    const matches=state.ceilings.filter(c=>pointInPolygon(p,c.points));
    if(!matches.length)return false;
    matches.sort((a,b)=>AtlasCeilingGrid.area(a.points)-AtlasCeilingGrid.area(b.points));
    state.ceilingSelected=matches[0].id;syncCeilingPanel();draw();return true;
  }
  function openCeilingPanel(){
    clearCeilingModes();
    state.placingDoor=false;updateDoorModeUI();state.trace.lastPoint=null;
    state.toolMode='wall';updateToolUI();
    $('ceilingPanel').hidden=false;setPanelsVisible(true);
    $('ceilingModeBtn').classList.add('active-tool');$('fsCeilingBtn').classList.add('active-tool');
    syncCeilingPanel();draw();
  }
  function activateCeilingMode(mode){
    if(!state.segments.length){alert('Open a DXF drawing first.');return;}
    const was=!!state[mode];clearCeilingModes();
    if(was){updateCeilingStats();draw();return;}
    state.tempArea.selecting=false;updateTemporaryAreaUI();
    state.placingDoor=false;updateDoorModeUI();state.toolMode='wall';state.trace.lastPoint=null;updateToolUI();
    state[mode]=true;
    if(mode!=='ceilingMoveMode'){state.ceilingSelected=null;syncCeilingPanel();}
    updateCeilingModeButtons();updateCeilingStats();draw();
    // Keep the full drawing reachable while selecting an existing RCP outline.
    if(mode==='ceilingPickMode'||mode==='ceilingRectMode')setPanelsVisible(false);
  }
  function startCeilingTrace(){
    if(!state.segments.length){alert('Open a DXF drawing first.');return;}
    clearCeilingModes();state.tempArea.selecting=false;updateTemporaryAreaUI();
    state.ceilingSelected=null;syncCeilingPanel();
    state.placingDoor=false;updateDoorModeUI();state.toolMode='wall';state.trace.lastPoint=null;updateToolUI();
    state.ceilingDrawing=true;state.ceilingDraft=[];
    $('hintbar').textContent='CEILING TRACE: tap room corners and CLOSE CEILING when done.';
    updateCeilingStats();draw();
  }
  function addCeilingPoint(sx,sy){
    if(!state.ceilingDrawing)return;
    if(state.ceilingDraft.length>=60){alert('Maximum 60 vertices per ceiling.');return;}
    state.ceilingDraft.push(nearestCalibrationPoint(sx,sy));
    $('hintbar').textContent=`CEILING TRACE: ${state.ceilingDraft.length} corners · CLOSE CEILING to finish.`;
    updateCeilingStats();draw();
  }
  function saveCeilingPoints(points){
    const number=$('ceilingNumber').value.trim()||nextCeilingNumber();
    if(state.ceilings.some(c=>(c.number||'').toLowerCase()===number.toLowerCase())){alert(`Ceiling ${number} already exists. Choose another number.`);return false;}
    const c={id:'c'+Date.now()+'-'+Math.floor(Math.random()*10000),
      number,name:$('ceilingName').value.trim()||`ACT-${state.ceilings.length+1}`,
      points:points.map(p=>({...p})),...ceilingOptions()};
    try{ceilingResult(c);}catch(e){alert(e.message);return false;}
    state.ceilings.push(c);state.ceilingSelected=c.id;
    clearCeilingModes();syncCeilingPanel();markProjectDirty();draw();
    if($('takeoffPanels').hidden)setPanelsVisible(true);
    $('hintbar').textContent=`Saved ceiling ${c.number}. Select MOVE GRID, then drag over the room to align 2′ tile lines.`;
    return true;
  }
  function finishCeilingTrace(){if(state.ceilingDraft.length>=3)saveCeilingPoints(state.ceilingDraft);}
  function addCeilingRectangleCorner(sx,sy){
    if(!state.ceilingRectMode)return;
    const p=nearestCalibrationPoint(sx,sy);
    if(!state.ceilingRectDraft.length){
      state.ceilingRectDraft=[p];
      $('hintbar').textContent='CEILING RECTANGLE: tap the opposite diagonal corner of the drawn room.';
      updateCeilingStats();draw();return;
    }
    const a=state.ceilingRectDraft[0],b=p;
    if(Math.abs(a.x-b.x)<1e-8||Math.abs(a.y-b.y)<1e-8){alert('Choose opposite diagonal corners. For rotated rooms, use TRACE instead.');return;}
    saveCeilingPoints([{x:a.x,y:a.y},{x:b.x,y:a.y},{x:b.x,y:b.y},{x:a.x,y:b.y}]);
  }
  function extractDXFLoops(){
    const groups=new Map(),candidates=[];
    const raw=s=>({x:s.x1,y:s.y1});
    for(const s of state.segments){
      if(s.loopId&&s.loopClosed){if(!groups.has(s.loopId))groups.set(s.loopId,[]);groups.get(s.loopId).push(s);}
    }
    for(const parts of groups.values()){
      if(parts.length<3)continue;
      const pts=parts.map(raw),first=pts[0],last=parts.at(-1);
      if(Math.hypot(last.x2-first.x,last.y2-first.y)>1e-5)continue;
      if(AtlasCeilingGrid.area(pts)>1e-9)candidates.push(pts);
    }
    // Older DXFs and imported saved projects may only contain individual LINE entities.
    // Walk closed chains whose vertices have exactly two incident segments. Branching
    // architectural/RCP lines are deliberately NOT guessed into a ceiling boundary.
    const edges=state.segments.filter(s=>!s.loopId&&s.sourceType!=='MANUAL_WALL');
    const k=p=>`${Math.round(p.x*10000)},${Math.round(p.y*10000)}`;
    const adjacency=new Map(),vertices=new Map();
    for(let i=0;i<edges.length;i++){
      const s=edges[i],a={x:s.x1,y:s.y1},b={x:s.x2,y:s.y2};
      for(const [key,point] of [[k(a),a],[k(b),b]]){
        if(!adjacency.has(key))adjacency.set(key,[]);
        adjacency.get(key).push(i);vertices.set(key,point);
      }
    }
    const done=new Set();
    for(let i=0;i<edges.length;i++){
      if(done.has(i))continue;
      const first=edges[i],start=k(raw(first));
      if(adjacency.get(start)?.length!==2)continue;
      const path=[],used=new Set();let cursor=start,edgeId=i,valid=false;
      for(let n=0;n<400;n++){
        if(used.has(edgeId))break;
        const edgesHere=adjacency.get(cursor)||[];
        if(edgesHere.length!==2)break;
        path.push(vertices.get(cursor));used.add(edgeId);
        const s=edges[edgeId],ka=k({x:s.x1,y:s.y1}),kb=k({x:s.x2,y:s.y2});
        cursor=ka===cursor?kb:kb===cursor?ka:null;
        if(!cursor)break;
        if(cursor===start){valid=path.length>=3;break;}
        const next=(adjacency.get(cursor)||[]).find(id=>id!==edgeId);
        if(next==null)break;
        edgeId=next;
      }
      if(valid&&AtlasCeilingGrid.area(path)>1e-9){candidates.push(path);for(const id of used)done.add(id);}
    }
    return candidates;
  }
  function pickExistingCeilingOutline(sx,sy){
    if(!state.ceilingPickMode)return;
    const point=screenToWorld(sx,sy),loops=extractDXFLoops();
    const areaFt=p=>AtlasCeilingGrid.area(p)*activeFeetPerUnit()**2;
    const viable=loops.filter(p=>areaFt(p)>=9 && p.length<=400);
    let matches=viable.filter(p=>pointInPolygon(point,p));
    // Near-border picks work for room shapes with many nested loops.
    if(!matches.length){
      const screenDist=pts=>Math.min(...pts.map((p,i)=>{
        const a=worldToScreen(p.x,p.y),q=pts[(i+1)%pts.length],b=worldToScreen(q.x,q.y);
        const abx=b.x-a.x,aby=b.y-a.y,t=Math.max(0,Math.min(1,((sx-a.x)*abx+(sy-a.y)*aby)/(abx*abx+aby*aby||1)));
        return Math.hypot(a.x+t*abx-sx,a.y+t*aby-sy);
      }));
      matches=viable.filter(p=>screenDist(p)<15);
    }
    matches.sort((a,b)=>areaFt(a)-areaFt(b));
    if(!matches.length){
      $('hintbar').textContent='No closed DXF room outline found here. Use 2 CORNERS for a rectangle, or TRACE for an irregular ceiling.';
      updateCeilingStats();return;
    }
    saveCeilingPoints(matches[0]);
  }
  function changeCeilingInputs(){
    const c=selectedCeiling();if(!c){updateCeilingSystemUI();updateCeilingStats();return;}
    const number=$('ceilingNumber').value.trim();
    if(number){
      const duplicate=state.ceilings.some(x=>x!==c&&(x.number||'').toLowerCase()===number.toLowerCase());
      if(duplicate){alert(`Ceiling number ${number} is already used.`);$('ceilingNumber').value=c.number;}
      else c.number=number;
    }
    Object.assign(c,ceilingOptions(),{name:$('ceilingName').value.trim()||c.name});
    updateCeilingSystemUI();
    const option=$('ceilingSelect').selectedOptions[0];if(option)option.textContent=`${c.number} · ${c.name}`;
    markProjectDirty();updateCeilingStats();refreshCeilingMarkups();draw();
  }
  function deleteCeiling(c){
    if(!c||!confirm(`Delete ceiling ${c.number} (${c.name})?`))return;
    state.ceilings=state.ceilings.filter(x=>x.id!==c.id);
    if(state.ceilingSelected===c.id)state.ceilingSelected=state.ceilings[0]?.id||null;
    clearCeilingModes();syncCeilingPanel();markProjectDirty();draw();
  }
  let gypsumCutHatchDark=null, gypsumCutHatchLight=null;
  function getGypsumCutHatch(){
    const light=!state.darkDrawing;
    if(light && gypsumCutHatchLight)return gypsumCutHatchLight;
    if(!light && gypsumCutHatchDark)return gypsumCutHatchDark;
    const tile=document.createElement('canvas');tile.width=12;tile.height=12;
    const p=tile.getContext('2d');
    p.strokeStyle=light?'rgba(100,50,159,.46)':'rgba(230,210,255,.40)';p.lineWidth=.85;
    p.beginPath();
    for(let x=-12;x<24;x+=12){p.moveTo(x,12);p.lineTo(x+12,0);}
    p.stroke();
    const pattern=ctx.createPattern(tile,'repeat');
    if(light)gypsumCutHatchLight=pattern;else gypsumCutHatchDark=pattern;
    return pattern;
  }
  function gypsumSheetCentroid(poly){
    // Area-weighted centroid stays inside most clipped board footprints.
    let twiceArea=0,cx=0,cy=0;
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],cross=a.x*b.y-b.x*a.y;
      twiceArea+=cross;cx+=(a.x+b.x)*cross;cy+=(a.y+b.y)*cross;
    }
    if(Math.abs(twiceArea)>1e-7){
      const mid={x:cx/(3*twiceArea),y:cy/(3*twiceArea)};
      if(pointInPolygon(mid,poly))return mid;
    }
    // An irregular room can clip a sheet into a concave shape whose centroid
    // falls outside. Search a small grid for a safe interior label position.
    const xs=poly.map(p=>p.x),ys=poly.map(p=>p.y);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    let best=null,bestClearance=-1;
    for(let iy=1;iy<=7;iy++)for(let ix=1;ix<=7;ix++){
      const q={x:minX+(maxX-minX)*ix/8,y:minY+(maxY-minY)*iy/8};
      if(!pointInPolygon(q,poly))continue;
      let clearance=Infinity;
      for(let i=0;i<poly.length;i++){
        const a=poly[i],b=poly[(i+1)%poly.length],dx=b.x-a.x,dy=b.y-a.y;
        const t=Math.max(0,Math.min(1,((q.x-a.x)*dx+(q.y-a.y)*dy)/(dx*dx+dy*dy||1)));
        clearance=Math.min(clearance,Math.hypot(q.x-a.x-t*dx,q.y-a.y-t*dy));
      }
      if(clearance>bestClearance){best=q;bestClearance=clearance;}
    }
    return best||poly[0];
  }
  function drawCeilingsOverlay(){
    if(!$('ceilingShowGrid')?.checked)return;
    const factor=activeFeetPerUnit();
    const list=[...state.ceilings];
    if(state.ceilingDraft.length)list.push({points:state.ceilingDraft,...ceilingOptions(),id:'draft'});
    if(state.ceilingRectDraft.length)list.push({points:state.ceilingRectDraft,id:'rect'});
    for(const c of list){
      if(c.points.length<2)continue;
      const active=c.id===state.ceilingSelected||c.id==='draft'||c.id==='rect';
      ctx.save();ctx.beginPath();
      c.points.forEach((p,i)=>{const s=worldToScreen(p.x,p.y);i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y);});
      if(c.points.length>=3)ctx.closePath();
      ctx.fillStyle=active?'rgba(37,194,175,.10)':'rgba(37,194,175,.025)';
      if(c.points.length>=3)ctx.fill();
      ctx.strokeStyle=active?(state.darkDrawing?'#51eacb':'#087c6b'):(state.darkDrawing?'#328d85':'#4b8982');ctx.lineWidth=active?2.8:1.7;ctx.stroke();
      if(c.points.length>=3){
        try{
          const r=ceilingResult(c);ctx.clip();
          const base=c.points[0],rad=(Number(c.angle)||0)*Math.PI/180,cs=Math.cos(rad),sn=Math.sin(rad);
          const toScreen=(x,y)=>worldToScreen(base.x+(x*cs-y*sn)/factor,base.y+(x*sn+y*cs)/factor);
          const drawRuns=(runs,axis,color,width)=>{
            ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=width;
            for(const line of runs)for(const [a,b] of line.parts){
              const p=axis==='x'?toScreen(line.at,a):toScreen(a,line.at);
              const q=axis==='x'?toScreen(line.at,b):toScreen(b,line.at);
              ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);
            }
            ctx.stroke();
          };
          if(ceilingSystem(c)==='rigidx'){
            const boardMode=ceilingBoardDisplay(c);
            const showBoards=boardMode!=='hidden'&&r.sheets.length<12000;
            if(showBoards){
              // Render individual clipped drywall footprints; cut pieces use a lighter hatch.
              // Paint FIRST so amber mains and cyan tees remain visible ABOVE the sheet fill.
              ctx.save();
              for(const sheet of r.sheets){
                if(sheet.polygon.length<3)continue;
                ctx.beginPath();
                sheet.polygon.forEach((v,i)=>{const q=toScreen(v.x,v.y);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});
                ctx.closePath();
                if(boardMode==='hatch'){
                  ctx.fillStyle=sheet.full?'rgba(155,97,236,.23)':'rgba(174,117,241,.105)';
                  ctx.fill();
                  if(!sheet.full){ctx.fillStyle=getGypsumCutHatch();ctx.fill();}
                }else if(boardMode==='shaded'){
                  ctx.fillStyle=sheet.full?'rgba(155,97,236,.26)':'rgba(187,138,244,.19)';
                  ctx.fill();
                }
                ctx.strokeStyle=state.darkDrawing?(sheet.full?'rgba(212,175,255,.87)':'rgba(213,172,250,.73)'):(sheet.full?'rgba(120,65,177,.85)':'rgba(144,98,181,.85)');
                ctx.lineWidth=sheet.full?1.2:1.05;
                ctx.setLineDash(sheet.full?[]:[3,2]);
                ctx.stroke();
              }
              ctx.restore();
            }
            if(c.showRigidFraming!==false){
              drawRuns(r.main,'x',state.darkDrawing?'#fcbd58':'#a26800',1.9);
              drawRuns(r.cross,'y',state.darkDrawing?'#6fd4ec':'#126c87',1.35);
            }
            if(showBoards&&c.showBoardNumbers!==false&&r.sheets.length<=1500){
              ctx.save();ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
              for(const sheet of r.sheets){
                const screenPoly=sheet.polygon.map(p=>toScreen(p.x,p.y));
                const w=Math.max(...screenPoly.map(p=>p.x))-Math.min(...screenPoly.map(p=>p.x));
                const h=Math.max(...screenPoly.map(p=>p.y))-Math.min(...screenPoly.map(p=>p.y));
                // Don't crowd a sliver with unreadable text; IDs remain in the material count.
                if(w<23||h<17)continue;
                const mid=gypsumSheetCentroid(sheet.polygon),pos=toScreen(mid.x,mid.y),label='G'+sheet.index;
                ctx.lineWidth=3;ctx.strokeStyle=state.darkDrawing?'rgba(20,13,30,.88)':'rgba(255,255,255,.9)';ctx.strokeText(label,pos.x,pos.y);
                ctx.fillStyle=state.darkDrawing?(sheet.full?'#f1ddff':'#faedff'):'#542481';ctx.fillText(label,pos.x,pos.y);
              }
              ctx.restore();
            }
          }else{
            drawRuns(r.main,'x',state.darkDrawing?'#fcbd58':'#a26800',1.8);
            drawRuns(r.cross4,'y',state.darkDrawing?'#6fd4ec':'#126c87',1.15);
            drawRuns(r.cross2,'x',state.darkDrawing?'#6fd4ec':'#126c87',1.15);
          }
          if(active && (ceilingSystem(c)!=='rigidx'||c.showRigidFraming!==false) && r.hangerPoints.length<3000){ctx.fillStyle=state.darkDrawing?'#f5a5e6':'#ac2877';for(const h of r.hangerPoints){const p=toScreen(h.x,h.y);ctx.beginPath();ctx.arc(p.x,p.y,7.5,0,Math.PI*2);ctx.fill();}}
        }catch(_){/* Uncalibrated or incomplete draft; drawing stays accessible. */}
      }
      ctx.restore();
      if(c.id!=='draft'&&c.id!=='rect'){
        // Wall-like takeoff markup is always drawn over the grid, not clipped.
        const cx=c.points.reduce((n,p)=>n+p.x,0)/c.points.length;
        const cy=c.points.reduce((n,p)=>n+p.y,0)/c.points.length;
        const center=pointInPolygon({x:cx,y:cy},c.points)?{x:cx,y:cy}:c.points[0];
        const s=worldToScreen(center.x,center.y);
        ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 13px system-ui';
        const label=c.number||'C-???',w=ctx.measureText(label).width+18;
        ctx.fillStyle=active?'#0b4644':'#15272e';ctx.strokeStyle=active?'#7af6d8':'#4b9f96';ctx.lineWidth=1.4;
        ctx.fillRect(s.x-w/2,s.y-12,w,24);ctx.strokeRect(s.x-w/2,s.y-12,w,24);
        ctx.fillStyle=active?'#ddfff6':'#a5f1e6';ctx.fillText(label,s.x,s.y);
        ctx.restore();
      }
    }
    if(state.ceilingDraft.length){ctx.save();for(const p of state.ceilingDraft){const s=worldToScreen(p.x,p.y);ctx.fillStyle='#66ffe7';ctx.fillRect(s.x-4,s.y-4,8,8);}ctx.restore();}
    if(state.ceilingRectDraft.length){const s=worldToScreen(state.ceilingRectDraft[0].x,state.ceilingRectDraft[0].y);ctx.save();ctx.fillStyle='#ffe7a6';ctx.beginPath();ctx.arc(s.x,s.y,6,0,2*Math.PI);ctx.fill();ctx.restore();}
  }
  function exportCeilingCSV(){
    if(!state.ceilings.length){alert('There are no ceiling areas yet.');return;}
    const rows=[['Ceiling #','Area','System','ACT Tile','SF','Perimeter LF','Main spacing FT','Cross spacing IN','12ft main pieces','Main installed LF','Cross tee FT length','Cross tee pieces','Cross installed LF','ACT 2ft tees','ACT tiles','Wall angle 10ft pieces','Hanger locations','Gypsum sheet W FT','Gypsum sheet L FT','Thickness IN','Layers','Full sheet locations','Cut sheet locations','Area-minimum sheet order','Conservative sheet order','Board SF']];
    for(const c of state.ceilings){
      try{
        const r=ceilingResult(c);
        if(ceilingSystem(c)==='rigidx')rows.push([c.number,c.name,'Rigid X','',r.areaSqFt.toFixed(2),r.perimeterLF.toFixed(2),r.mainSpacing,r.crossSpacing*12,r.mainOrder,r.mainLF.toFixed(2),r.crossLength,r.crossOrder,r.crossLF.toFixed(2),'','',r.wallAngle10,r.hangerOrder,r.boardWidth,r.boardLength,r.boardThickness,r.sheetLayers,r.fullBoards,r.cutBoards,r.boardOrderMin,r.boardOrderConservative,r.boardSF.toFixed(2)]);
        else rows.push([c.number,c.name,'ACT',c.tile,r.areaSqFt.toFixed(2),r.perimeterLF.toFixed(2),4,24,r.mainOrder,r.mainLF.toFixed(2),4,r.tee4Order,r.tee4LF?.toFixed(2)||'',r.tee2Order,r.tileOrder,r.wallAngle10,r.hangerOrder,'','','','','','','','','']);
      }catch(_){/* Skip invalid area but preserve other saved ceilings. */}
    }
    const csv=rows.map(row=>row.map(csvEscape).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='ATLAS-Ceiling-Takeoff.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  function exportMaterialPDF(ceilingsOnly=false){
    if(ceilingsOnly && !state.ceilings.length){alert('Save at least one ceiling before exporting a ceiling PDF.');return;}
    if(!state.walls.size && !state.ceilings.length){alert('Save some wall or ceiling takeoff items before exporting.');return;}
    const sections=[];
    if(!ceilingsOnly){
      const groups=[...$('materialSummary').querySelectorAll('.summary-group')];
      for(const group of groups){
        const title=group.querySelector('.summary-title')?.textContent||'WALL MATERIALS';
        const rows=[...group.querySelectorAll('.summary-item')].map(item=>{
          const spans=item.querySelectorAll('span');return [spans[0]?.textContent||'',spans[1]?.textContent||''];
        });
        if(rows.length)sections.push({title:`Wall materials / ${title}`,rows});
      }
      if(!groups.length && state.walls.size){sections.push({title:'Wall material visibility',rows:[['Current view','No visible wall takeoff materials']]});}
    }
    const byTile=new Map(),byRigid=new Map(),schedule=[];
    for(const c of [...state.ceilings].sort((a,b)=>(a.number||'').localeCompare(b.number||'',undefined,{numeric:true}))){
      try{
        const r=ceilingResult(c);
        schedule.push([`${c.number} / ${c.name||'Ceiling'} / ${ceilingSystem(c)==='rigidx'?'RIGID X':c.tile} / perimeter ${r.perimeterLF.toFixed(1)} LF`,`${r.areaSqFt.toFixed(1)} SF`]);
        if(ceilingSystem(c)==='rigidx'){
          const key=`${r.mainSpacing}ft mains / ${r.crossSpacing*12}in tees / ${r.boardWidth}x${r.boardLength}x${r.boardThickness}in gypsum / ${r.sheetLayers} layer(s)`;
          const t=byRigid.get(key)||{count:0,sf:0,main:0,mainLF:0,cross:0,crossLF:0,angle:0,angleLF:0,wires:0,boardSF:0,full:0,cut:0,min:0,conservative:0};
          t.count++;t.sf+=r.areaSqFt;t.main+=r.mainOrder;t.mainLF+=r.mainLF;t.cross+=r.crossOrder;t.crossLF+=r.crossLF;
          t.angle+=r.wallAngle10;t.angleLF+=r.perimeterLF;t.wires+=r.hangerOrder;
          t.boardSF+=r.boardSF;t.full+=r.fullBoards;t.cut+=r.cutBoards;t.min+=r.boardOrderMin;t.conservative+=r.boardOrderConservative;
          byRigid.set(key,t);continue;
        }
        const t=byTile.get(c.tile)||{count:0,sf:0,full:0,cut:0,tiles:0,mains:0,mainLF:0,tee4:0,tee2:0,angle:0,angleLF:0,wires:0};
        t.count++;t.sf+=r.areaSqFt;t.full+=r.fullTiles;t.cut+=r.cutTiles;t.tiles+=r.tileOrder;
        t.mains+=r.mainOrder;t.mainLF+=r.mainLF;t.tee4+=r.tee4Order;t.tee2+=r.tee2Order;
        t.angle+=r.wallAngle10;t.angleLF+=r.perimeterLF;t.wires+=r.hangerOrder;
        byTile.set(c.tile,t);
      }catch(e){schedule.push([`${c.number} / ${c.name}`,'Review calibration / boundary']);}
    }
    if(schedule.length)sections.push({title:'Ceiling markup schedule',rows:schedule});
    for(const [tile,t] of [...byTile.entries()].sort()){
      sections.push({title:`ACT ceiling materials - ${tile==='2x4'?'2 ft x 4 ft':'2 ft x 2 ft'}`,rows:[
        ['Ceiling areas / installed SF',`${t.count} / ${t.sf.toFixed(1)} SF`],
        ['Full / cut tile positions',`${t.full} / ${t.cut}`],
        ['Tiles to order (waste already applied per ceiling)',`${t.tiles} pcs`],
        ['Main runners - estimated 12 ft pieces',`${t.mains} pcs`],
        ['Main runner installed length',`${t.mainLF.toFixed(1)} LF`],
        ['4 ft cross tees',`${t.tee4} pcs`],
        ['2 ft cross tees',`${t.tee2} pcs`],
        ['Wall angle - estimated 10 ft pieces',`${t.angle} pcs`],
        ['Wall angle perimeter length',`${t.angleLF.toFixed(1)} LF`],
        ['Hanger wire estimated support points',`${t.wires} points`]
      ]});
    }
    for(const [key,t] of [...byRigid.entries()].sort()){
      sections.push({title:`RIGID X drywall ceiling - ${key}`,rows:[
        ['Ceiling areas / installed SF',`${t.count} / ${t.sf.toFixed(1)} SF`],
        ['Main tees - estimated 12ft pieces with waste',`${t.main} pcs`],
        ['Main tees installed',`${t.mainLF.toFixed(1)} LF`],
        ['Drywall cross tees - estimated pcs with waste',`${t.cross} pcs`],
        ['Cross tees installed',`${t.crossLF.toFixed(1)} LF`],
        ['Perimeter wall angle - estimated 10ft pieces',`${t.angle} pcs`],
        ['Perimeter angle installed',`${t.angleLF.toFixed(1)} LF`],
        ['Hanger wire support locations with waste',`${t.wires} points`],
        ['Gypsum board full / cut positions (first layer)',`${t.full} / ${t.cut}`],
        ['Gypsum board coverage - all specified layers',`${t.boardSF.toFixed(1)} SF`],
        ['Gypsum sheets - area minimum incl. waste',`${t.min} sheets`],
        ['Gypsum sheets - conservative no offcut reuse',`${t.conservative} sheets`]
      ]});
    }
    const notes=[
      'Rigid X layout estimates selectable 4 ft or 6 ft main/cross spans, 16 or 24 in cross spacing, and selected wire spacing. Check manufacturer compatibility, span/load and tested assembly design.',
      'Purple drywall sheet joints are first-layer location marks only. Joint backing, perimeter support, staggering of a second layer, screw patterns, assemblies and openings must be field-verified.',
      'Drywall sheet orders show an area minimum and a conservative one-sheet-per-touched-location estimate; actual cutting and offcut reuse determine real purchase quantities.',
      'ACT ceiling grids assume 4 ft on-center main runners, 4 ft cross tees every 2 ft, and 2 ft infill tees for 2x2 layouts.',
      'Grid location and material counts are based on the ceiling boundary, calibrated DXF units, and each saved offset/rotation.',
      'Cut tile positions are counted individually; offcut reuse, lights, ducts, columns, breaks and special borders are not optimized.',
      'Main runners, tee stock, hangers and perimeter angle are preliminary quantities. Check actual manufacturer installation details and job specifications.',
      'Wall totals (when included) reflect currently visible wall layers and any closed wall AREA SELECT filter. Ceiling totals include all saved ACT and Rigid X ceiling areas.'
    ];
    const project=state.projectName||state.fileName||'New Project';
    AtlasPdfReport.download({title:ceilingsOnly?'Ceiling material takeoff':'Material summary - Walls + Ceilings',project,sections,notes},
      `${project.replace(/[^a-z0-9_-]+/gi,'-').slice(0,50)}-${ceilingsOnly?'Ceiling':'Materials'}-Summary.pdf`);
  }

  $('ceilingModeBtn').addEventListener('click',openCeilingPanel);
  $('fsCeilingBtn').addEventListener('click',openCeilingPanel);
  $('ceilingHideBtn').addEventListener('click',()=>{
    $('ceilingPanel').hidden=true;clearCeilingModes();
    $('ceilingModeBtn').classList.remove('active-tool');$('fsCeilingBtn').classList.remove('active-tool');draw();
  });
  $('ceilingTraceBtn').addEventListener('click',startCeilingTrace);
  $('ceilingCloseBtn').addEventListener('click',finishCeilingTrace);
  $('ceilingPickBtn').addEventListener('click',()=>activateCeilingMode('ceilingPickMode'));
  $('ceilingRectBtn').addEventListener('click',()=>activateCeilingMode('ceilingRectMode'));
  $('ceilingMoveBtn').addEventListener('click',()=>{
    if(!selectedCeiling()){alert('Select or create a ceiling area before moving its grid.');return;}
    const enable=!state.ceilingMoveMode;clearCeilingModes();state.ceilingMoveMode=enable;updateCeilingModeButtons();
    $('hintbar').textContent=enable?'MOVE GRID: drag inside the selected ceiling. Pinch to zoom; the 2-foot module stays true-size. Tap CEILING again to see controls.':'MOVE GRID OFF: drag pans the drawing.';
    if(enable)setPanelsVisible(false);
  });
  $('ceilingSelect').addEventListener('change',()=>{state.ceilingSelected=$('ceilingSelect').value||null;clearCeilingModes();syncCeilingPanel();draw();});
  for(const id of ['ceilingNumber','ceilingName','ceilingSystem','ceilingTile','ceilingWaste','ceilingAngle','ceilingOffsetX','ceilingOffsetY',
    'rigidMainSpacing','rigidCrossSpacing','rigidWireSpacing','boardWidth','boardLength','boardThickness','boardLayers','boardRotation',
    'boardStagger','boardOffsetX','boardOffsetY','showRigidFraming','boardDisplayMode','showBoardNumbers']){
    $(id).addEventListener('change',changeCeilingInputs);
    if(id!=='ceilingNumber')$(id).addEventListener('input',changeCeilingInputs);
  }
  for(const [id,field,delta] of [['ceilingShiftLeft','ceilingOffsetX',-.5],['ceilingShiftRight','ceilingOffsetX',.5],['ceilingShiftDown','ceilingOffsetY',-.5],['ceilingShiftUp','ceilingOffsetY',.5]]){
    $(id).addEventListener('click',()=>{$(field).value=(Number($(field).value)||0)+delta;changeCeilingInputs();});
  }
  $('ceilingShowGrid').addEventListener('change',draw);
  $('ceilingDelete').addEventListener('click',()=>deleteCeiling(selectedCeiling()));
  $('ceilingExport').addEventListener('click',exportCeilingCSV);
  $('ceilingExportPdf').addEventListener('click',()=>exportMaterialPDF(true));
  $('exportMaterialPdfBtn').addEventListener('click',()=>exportMaterialPDF(false));
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape' && state.toolMode==='tape') { activateTapeMode(); return; }
    if(e.key==='Escape'&&(state.ceilingDrawing||state.ceilingPickMode||state.ceilingRectMode||state.ceilingMoveMode)){
      clearCeilingModes();updateCeilingStats();draw();
    }
  });
  syncCeilingPanel();
  applyDrawingTheme();

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  refreshWallTypeUI();
  initializeCollapsiblePanelScrolling();
  refreshTables();
  updateCalibrationUI();
  updateTraceUI();
  updateSelectedActionButtons();
  updateTemporaryAreaUI();
  refreshTemporaryAreaTotals();
  updateCurrentTypeBadge();
  updateProjectTitle();
  syncFullscreenTools();
  autoRestoreLastSaved();
})();
