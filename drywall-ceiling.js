/* ATLAS Rigid X / gypsum board suspended ceiling preliminary takeoff.
   Geometry in calibrated feet, matching AtlasCeilingGrid's transformed coordinate system.
   This is an estimator, not a verified attachment/structural/suspension design. */
(function(root){
'use strict';
const CG=root.AtlasCeilingGrid, EPS=1e-6;
function bounds(poly){return {minX:Math.min(...poly.map(p=>p.x)),maxX:Math.max(...poly.map(p=>p.x)),minY:Math.min(...poly.map(p=>p.y)),maxY:Math.max(...poly.map(p=>p.y))};}
function finite(v, fallback){const n=Number(v);return Number.isFinite(n)?n:fallback;}
function range(low,high,origin,step){return [Math.floor((low-origin)/step)-1,Math.ceil((high-origin)/step)+1];}
function runs(poly,axis,start,end,origin,step){
 const result=[];
 for(let i=start;i<=end;i++){
   const at=origin+i*step,parts=CG.lineParts(poly,axis,at);
   if(parts.length)result.push({at,parts});
 }
 return result;
}
function tally(lines,stockLength){
 let lf=0,pieces=0;
 for(const line of lines)for(const [a,b] of line.parts){
   const l=b-a;if(l<=EPS)continue;
   lf+=l;pieces+=Math.ceil((l-EPS)/stockLength);
 }
 return {lf,pieces};
}
function estimate(points,feetPerUnit,opt={}){
 if(!Array.isArray(points)||points.length<3||!(feetPerUnit>0))throw Error('Ceiling requires a valid polygon and a calibrated drawing.');
 const angle=finite(opt.angle,0),offX=finite(opt.offsetX,0),offY=finite(opt.offsetY,0);
 const mainSpacing=finite(opt.rigidMainSpacing,4),crossSpacing=finite(opt.rigidCrossSpacing,24)/12;
 const wireSpacing=finite(opt.rigidWireSpacing,48)/12;
 const sheetWidth=finite(opt.boardWidth,4),sheetLength=finite(opt.boardLength,8);
 const sheetRotation=opt.boardRotation==='90'?'90':'0',stagger=opt.boardStagger!==false;
 const boardOffsetX=finite(opt.boardOffsetX,0),boardOffsetY=finite(opt.boardOffsetY,0);
 const sheetLayers=Math.round(finite(opt.boardLayers,1)),waste=Math.max(0,finite(opt.waste,5))/100;
 if(![4,6].includes(mainSpacing)||![16/12,2].some(v=>Math.abs(v-crossSpacing)<EPS) || wireSpacing<=0 || wireSpacing>8 || sheetWidth<2||sheetWidth>6||sheetLength<4||sheetLength>20||![1,2].includes(sheetLayers)||waste>1)
    throw Error('Check framing spacings, drywall sheet dimensions, layers and waste percent.');
 const poly=CG.transform(points,feetPerUnit,angle),b=bounds(poly),areaSqFt=CG.area(poly);
 if(!(areaSqFt>EPS))throw Error('Ceiling outline has no area.');
 const perimeterLF=poly.reduce((s,p,i)=>s+Math.hypot(p.x-poly[(i+1)%poly.length].x,p.y-poly[(i+1)%poly.length].y),0);
 const [mainLow,mainHigh]=range(b.minX,b.maxX,offX,mainSpacing);
 const [crossLow,crossHigh]=range(b.minY,b.maxY,offY,crossSpacing);
 if((mainHigh-mainLow)+(crossHigh-crossLow)>4000)throw Error('Ceiling is too large: check drawing calibration.');
 const main=runs(poly,'x',mainLow,mainHigh,offX,mainSpacing),cross=runs(poly,'y',crossLow,crossHigh,offY,crossSpacing);
 const mainTotals=tally(main,12),crossTotals=tally(cross,mainSpacing);
 const hangerPoints=[];
 for(const line of main)for(const [a,z] of line.parts){
   const n=Math.max(1,Math.ceil((z-a)/wireSpacing));
   for(let j=0;j<=n;j++)hangerPoints.push({x:line.at,y:a+(z-a)*j/n});
 }
 const cellX=sheetRotation==='90'?sheetWidth:sheetLength;
 const cellY=sheetRotation==='90'?sheetLength:sheetWidth;
 const baseX=offX+boardOffsetX,baseY=offY+boardOffsetY;
 const sheets=[];let fullBoards=0,cutBoards=0,coveredSF=0;
 function addBoard(x,y){
   const polygon=CG.clipRect(poly,x,y,x+cellX,y+cellY);
   const covered=polygon.length>=3?CG.area(polygon):0;
   if(covered<=EPS)return;
   const full=covered>=cellX*cellY-EPS;
   sheets.push({x,y,width:cellX,height:cellY,polygon,full,areaSqFt:covered,index:sheets.length+1});
   coveredSF+=covered;
   if(full)fullBoards++;else cutBoards++;
 }
 if(sheetRotation==='90'){
   // Long board dimension is Y; stagger the Y-joints between adjacent X columns.
   const [colLow,colHigh]=range(b.minX,b.maxX,baseX,cellX);
   if(colHigh-colLow>500)throw Error('Too many gypsum board columns: check drawing calibration.');
   for(let col=colLow;col<colHigh;col++){
     const x=baseX+col*cellX,shift=stagger&&Math.abs(col%2)===1?cellY/2:0;
     const [rowLow,rowHigh]=range(b.minY,b.maxY,baseY+shift,cellY);
     if((colHigh-colLow)*(rowHigh-rowLow)>60000)throw Error('Too many board cells: check drawing calibration.');
     for(let row=rowLow;row<rowHigh;row++)addBoard(x,baseY+shift+row*cellY);
   }
 }else{
   // Long board dimension is X; stagger X-joints between adjacent Y rows.
   const [rowLow,rowHigh]=range(b.minY,b.maxY,baseY,cellY);
   if(rowHigh-rowLow>500)throw Error('Too many gypsum board rows: check drawing calibration.');
   for(let row=rowLow;row<rowHigh;row++){
     const y=baseY+row*cellY,shift=stagger&&Math.abs(row%2)===1?cellX/2:0;
     const [colLow,colHigh]=range(b.minX,b.maxX,baseX+shift,cellX);
     if((rowHigh-rowLow)*(colHigh-colLow)>60000)throw Error('Too many board cells: check drawing calibration.');
     for(let col=colLow;col<colHigh;col++)addBoard(baseX+shift+col*cellX,y);
   }
 }
 const boardPositions=fullBoards+cutBoards;
 const minBoards=Math.ceil(areaSqFt*sheetLayers/(sheetWidth*sheetLength)*(1+waste));
 const conservativeBoards=Math.ceil(boardPositions*sheetLayers*(1+waste));
 return {
   type:'rigidx',poly,b,areaSqFt,perimeterLF,offX,offY,main,cross,hangerPoints,
   mainSpacing,crossSpacing,wireSpacing,mainLF:mainTotals.lf,mainPieces:mainTotals.pieces,
   mainOrder:Math.ceil(mainTotals.pieces*(1+waste)),crossLF:crossTotals.lf,
   crossPieces:crossTotals.pieces,crossOrder:Math.ceil(crossTotals.pieces*(1+waste)),
   crossLength:mainSpacing,wallAngle10:Math.ceil(perimeterLF*(1+waste)/10),
   hangerOrder:Math.ceil(hangerPoints.length*(1+waste)),
   boardWidth:sheetWidth,boardLength:sheetLength,boardThickness:opt.boardThickness||'5/8',
   sheetRotation,stagger,sheetLayers,boardPositions,fullBoards,cutBoards,
   boardOrderMin:minBoards,boardOrderConservative:conservativeBoards,
   boardSF:areaSqFt*sheetLayers,sheets,coveredSF
 };
}
root.AtlasDrywallCeiling={calculate:estimate};
})(typeof globalThis!=='undefined'?globalThis:this);
