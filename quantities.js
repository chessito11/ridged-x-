(function (root) {
  "use strict";
  const EPS = 1e-7;
  function wallQuantities(lengthFt, template, doors = []) {
    const height = Number(template.height);
    const step = Math.max(1, Number(template.spacing) || 16) / 12;
    const waste = 1 + Math.max(0, Number(template.wastePercent) || 0) / 100;
    if (!Number.isFinite(lengthFt) || lengthFt <= 0 || !Number.isFinite(height) || height <= 0) throw new Error("Wall length and height must be positive.");
    const gridCount = Math.ceil(lengthFt / step);
    const countPositions = (start, end, strict = false) => {
      const low = Math.max(0,Math.ceil((start+(strict?EPS:-EPS))/step));
      const high = Math.min(gridCount-1,Math.floor((end+(strict?-EPS:EPS))/step));
      const last = strict ? lengthFt > start+EPS && lengthFt < end-EPS : lengthFt >= start-EPS && lengthFt <= end+EPS;
      return Math.max(0,high-low+1)+(last?1:0);
    };
    const openings = doors.map(d => ({ ...d, start: d.centerT * lengthFt - d.widthFt / 2,
      end: d.centerT * lengthFt + d.widthFt / 2 })).sort((a,b) => a.start - b.start);
    const valid = openings.every((d,i) => Number.isFinite(d.start) && Number.isFinite(d.end) &&
      d.start >= -EPS && d.end <= lengthFt + EPS && d.widthFt > 0 && d.heightFt > 0 &&
      d.heightFt + d.headerDepthIn / 12 <= height + EPS &&
      Number.isInteger(d.jambsPerSide) && d.jambsPerSide > 0 &&
      (d.jambMaterial === "metal" || d.jambMaterial === "wood") &&
      Number.isInteger(d.headerRuns) && d.headerRuns >= 0 && d.headerDepthIn >= 0 &&
      (!i || d.start > openings[i-1].end + EPS));
    if (!valid) throw new Error("Doors must fit within the wall, cannot overlap, and need valid jamb/header settings.");
    let regular = gridCount + 1 - openings.reduce((n,d)=>n+countPositions(d.start,d.end),0);
    regular += template.doubleEnds ? 2 : 0;
    let metalJambs = 0, woodJambs = 0, openingArea = 0, headerFt = 0;
    const crippleGroups = new Map();
    for (const d of openings) {
      if (d.jambMaterial === "metal") metalJambs += 2 * d.jambsPerSide;
      else woodJambs += 2 * d.jambsPerSide;
      openingArea += d.widthFt * d.heightFt;
      headerFt += d.widthFt * d.headerRuns;
      const shortHeight = height - d.heightFt - d.headerDepthIn / 12;
      const count = shortHeight > EPS ? countPositions(d.start,d.end,true) : 0;
      if (count) crippleGroups.set(shortHeight, (crippleGroups.get(shortHeight) || 0) + count);
    }
    const bottomRuns = [];
    let end = 0;
    for (const d of openings) { if (d.start > end + EPS) bottomRuns.push(d.start-end); end = d.end; }
    if (lengthFt > end + EPS) bottomRuns.push(lengthFt-end);
    const cripples = [...crippleGroups].map(([heightFt,quantity]) => ({heightFt,quantity:Math.ceil(quantity*waste)}));
    const fullHeightStudQty = Math.ceil((regular+metalJambs)*waste);
    return { lengthFt, fullHeightStudQty, studQty: fullHeightStudQty + cripples.reduce((n,g)=>n+g.quantity,0),
      crippleGroups: cripples, woodJambQty: Math.ceil(woodJambs*waste), metalJambQty: metalJambs,
      doorCount: doors.length, doorJambQty: metalJambs+woodJambs,
      openingAreaFt2: openingArea, netAreaFt2: Math.max(0,lengthFt*height-openingArea),
      trackFt: lengthFt*waste, topTrackFt: lengthFt*waste,
      bottomTrackFt: bottomRuns.reduce((n,x)=>n+x,0)*waste, bottomRuns,
      headerTrackFt: headerFt*waste,
      doorPerimeterFt: openings.reduce((n,d)=>n+2*d.heightFt+d.widthFt,0) };
  }
  // Physical layout only: purchasing waste never adds marks to the plan.
  function studPositions(wall) {
    const length = Number(wall.lengthFt);
    if (!(length > 0) || !Number.isFinite(length)) return [];
    const step = Math.max(1, Number(wall.spacing) || 16) / 12;
    const openings = (wall.doors || []).map(d => ({
      ...d, start: d.centerT * length - d.widthFt / 2,
      end: d.centerT * length + d.widthFt / 2
    }));
    const marks = [];
    const count = Math.ceil(length / step);
    for (let i = 0; i <= count; i++) {
      const at = i === count ? length : i * step;
      const door = openings.find(d => at >= d.start - EPS && at <= d.end + EPS);
      if (!door) marks.push({ at, kind: "stud", count: 1 });
      else if (at > door.start + EPS && at < door.end - EPS &&
        Number(wall.height) - door.heightFt - door.headerDepthIn / 12 > EPS) {
        marks.push({ at, kind: "cripple", count: 1 });
      }
    }
    if (wall.doubleEnds) {
      marks.push({ at: 0, kind: "end", count: 1 }, { at: length, kind: "end", count: 1 });
    }
    for (const d of openings) {
      for (const at of [d.start, d.end]) marks.push({
        at, kind: d.jambMaterial === "wood" ? "wood" : "jamb", count: d.jambsPerSide
      });
    }
    return marks.sort((a,b) => a.at-b.at);
  }
  function boardMetrics(wall) {
    const net = wall.netAreaFt2 ?? wall.lengthFt*wall.height;
    let area = 0, sheets = 0, tapeLf = 0, sheetEdgesLf = 0;
    for (const board of wall.assemblyParts || []) {
      const isBoard = board.materialKind === "drywall" || (!board.materialKind && board.unit === "SF" &&
        (board.folder === "Drywall" || /drywall/i.test(board.name || "")));
      if (!isBoard || board.unit !== "SF" || (board.formula && board.formula !== "multiply") || !["area","grossArea"].includes(board.basis)) continue;
      const faces = Number(board.factor) || 0;
      const width = Number(board.sheetWidthFt) || 4, height = Number(board.sheetHeightFt) || 10;
      const boardArea = (board.basis === "grossArea" ? wall.lengthFt*wall.height : net)*faces;
      area += boardArea; sheets += boardArea/(width*height);
      sheetEdgesLf += boardArea/(width*height)*2*(width+height);
      const verticalCount = Math.max(0,Math.ceil(wall.lengthFt/width)-1);
      const horizontalCount = Math.max(0,Math.ceil(wall.height/height)-1);
      let seams = verticalCount*wall.height+horizontalCount*wall.lengthFt;
      let perimeter = 2*(wall.lengthFt+wall.height);
      for (const d of wall.doors || []) {
        const a=d.centerT*wall.lengthFt-d.widthFt/2,b=a+d.widthFt;
        const low=Math.max(1,Math.ceil((a-EPS)/width)),high=Math.min(verticalCount,Math.floor((b+EPS)/width));
        seams -= Math.max(0,high-low+1)*d.heightFt;
        seams -= Math.min(horizontalCount,Math.max(0,Math.ceil(d.heightFt/height)-1))*d.widthFt;
        perimeter += 2*d.heightFt;
      }
      tapeLf += Math.max(0,seams+perimeter)*faces;
    }
    return { drywallArea:area, drywallSheets:sheets, tapeLf, sheetEdgesLf };
  }
  function partQuantity(part, wall) {
    const doors = wall.doors || [];
    const gross = wall.lengthFt * wall.height;
    const net = wall.netAreaFt2 ?? Math.max(0,gross-doors.reduce((n,d)=>n+d.widthFt*d.heightFt,0));
    const bases = { ...boardMetrics(wall), length: wall.lengthFt, area: net, grossArea: gross, wall: 1, studs: wall.studQty,
      doors: doors.length, jambs: wall.doorJambQty || 0, doorPerimeter: wall.doorPerimeterFt || 0,
      topTrack: wall.topTrack === "None" ? 0 : wall.lengthFt,
      bottomTrack: wall.bottomTrack === "None" ? 0 : (wall.bottomRuns || [wall.lengthFt]).reduce((n,x)=>n+x,0) };
    const base = bases[part.basis] ?? 0;
    const factor = Number(part.factor);
    if (!Number.isFinite(factor) || factor < 0) return 0;
    let quantity = base * factor;
    if (part.formula === "coverage") quantity = factor > 0 ? base/factor : 0;
    if (part.formula === "spacing") {
      const runs = part.basis === "bottomTrack" ? (wall.bottomTrack === "None" ? [] : wall.bottomRuns || [wall.lengthFt]) : (base > 0 ? [base] : []);
      quantity = factor > 0 ? runs.reduce((n,length)=>n+Math.ceil(length*12/factor)+1,0) : 0;
    }
    quantity *= 1 + Number(part.wastePercent || 0)/100;
    return part.roundUp ? Math.ceil(quantity - EPS) : quantity;
  }
  root.AtlasQuantities = { wallQuantities, partQuantity, boardMetrics, studPositions };
})(typeof globalThis !== "undefined" ? globalThis : this);
