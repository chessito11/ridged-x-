/* ATLAS suspended ceiling estimation geometry; dimensions in feet. */
(function(root){
"use strict";
const EPS=1e-7;
function area(poly){return Math.abs(poly.reduce((s,p,i)=>{const q=poly[(i+1)%poly.length];return s+p.x*q.y-q.x*p.y},0))/2}
function perimeter(poly){return poly.reduce((s,p,i)=>s+Math.hypot(p.x-poly[(i+1)%poly.length].x,p.y-poly[(i+1)%poly.length].y),0)}
function transform(points,feetPerUnit,angle=0){const o=points[0], c=Math.cos(angle*Math.PI/180),s=Math.sin(angle*Math.PI/180);return points.map(p=>{const x=(p.x-o.x)*feetPerUnit,y=(p.y-o.y)*feetPerUnit;return {x:x*c+y*s,y:-x*s+y*c}})}
function bounding(poly){return {minX:Math.min(...poly.map(p=>p.x)),maxX:Math.max(...poly.map(p=>p.x)),minY:Math.min(...poly.map(p=>p.y)),maxY:Math.max(...poly.map(p=>p.y))}}
function clipRect(poly,x0,y0,x1,y1){let p=poly;
 const edges=[{inside:q=>q.x>=x0-EPS,inter:(a,b)=>({x:x0,y:a.y+(b.y-a.y)*(x0-a.x)/(b.x-a.x)})},{inside:q=>q.x<=x1+EPS,inter:(a,b)=>({x:x1,y:a.y+(b.y-a.y)*(x1-a.x)/(b.x-a.x)})},{inside:q=>q.y>=y0-EPS,inter:(a,b)=>({y:y0,x:a.x+(b.x-a.x)*(y0-a.y)/(b.y-a.y)})},{inside:q=>q.y<=y1+EPS,inter:(a,b)=>({y:y1,x:a.x+(b.x-a.x)*(y1-a.y)/(b.y-a.y)})}];
 for(const e of edges){const old=p;p=[];for(let i=0;i<old.length;i++){const a=old[i],b=old[(i+1)%old.length],ia=e.inside(a),ib=e.inside(b);if(ia&&ib)p.push(b);else if(ia&&!ib)p.push(e.inter(a,b));else if(!ia&&ib){p.push(e.inter(a,b));p.push(b)}}if(!p.length)break}return p}
function lineParts(poly,axis,coordinate){const vals=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],u=a[axis],v=b[axis];if(Math.abs(u-v)<EPS)continue;if((u<=coordinate&&coordinate<v)||(v<=coordinate&&coordinate<u)){const t=(coordinate-u)/(v-u),other=axis==='x'?'y':'x';vals.push(a[other]+t*(b[other]-a[other]))}}vals.sort((a,b)=>a-b);let parts=[];for(let i=0;i+1<vals.length;i+=2){if(vals[i+1]-vals[i]>EPS)parts.push([vals[i],vals[i+1]])}return parts}
function uniquePieces(poly,axis,position,origin,interval,pieceLength){let length=0,pieces=0,spans=lineParts(poly,axis,position);for(const [a,b] of spans){length+=b-a; // each stock segment crossing a room edge must be cut
 const left=Math.floor((a-origin+EPS)/pieceLength),right=Math.ceil((b-origin-EPS)/pieceLength);pieces+=Math.max(1,right-left);
 }return {length,pieces,spans}}
function calculate(points,feetPerUnit,options={}){
 if(points.length<3||!(feetPerUnit>0))throw Error('Select at least three corners and calibrate the drawing.');
 const width=options.tile==='2x4'?4:2,height=2,angle=Number(options.angle)||0,offX=Number(options.offsetX)||0,offY=Number(options.offsetY)||0;
 const poly=transform(points,feetPerUnit,angle),b=bounding(poly),sqft=area(poly);if(!(sqft>EPS))throw Error('Ceiling outline has no area.');
 const countSpan=(low,high,offset,step)=>[Math.floor((low-offset)/step)-1,Math.ceil((high-offset)/step)+1];
 const [xlo,xhi]=countSpan(b.minX,b.maxX,offX,width),[ylo,yhi]=countSpan(b.minY,b.maxY,offY,height);
 if((xhi-xlo)*(yhi-ylo)>60000)throw Error('Grid too large. Check DXF units or calibrated scale.');
 let fullTiles=0,cutTiles=0;
 for(let ix=xlo;ix<xhi;ix++)for(let iy=ylo;iy<yhi;iy++){
   const x=offX+ix*width,y=offY+iy*height,p=clipRect(poly,x,y,x+width,y+height),covered=p.length>=3?area(p):0;
   if(covered>0.00001){if(covered>=width*height-0.00001)fullTiles++;else cutTiles++}
 }
 // Conventional exposed tee assumption: main at 4' OC, 4' tees at 2' OC; 2' infills for 2x2 only.
 const main=[],cross4=[],cross2=[];
 const [mlo,mhi]=countSpan(b.minX,b.maxX,offX,4),[clo,chi]=countSpan(b.minY,b.maxY,offY,2);
 for(let i=mlo;i<=mhi;i++){const x=offX+i*4,parts=lineParts(poly,'x',x);if(parts.length)main.push({at:x,parts});}
 for(let j=clo;j<=chi;j++){
   const y=offY+j*2,parts=lineParts(poly,'y',y);if(parts.length)cross4.push({at:y,parts});
 }
 if(width===2)for(let i=mlo;i<mhi;i++){const x=offX+i*4+2,parts=lineParts(poly,'x',x);if(parts.length)cross2.push({at:x,parts});}
 const tally=(lines,along,step)=>{let lf=0,pieces=0;for(const line of lines)for(const [a,b] of line.parts){lf+=b-a;pieces+=Math.ceil((b-a-EPS)/step)}return {lf,pieces}};
 // Main runner stock/tee pieces are *estimates*; cross tees need end cuts at nonrectangular perimeter.
 const mainQty=tally(main,'y',12),cross4Qty=tally(cross4,'x',4),cross2Qty=tally(cross2,'y',2);
 // Hanger points near the ends of each clipped main run, max 4 feet on centre.
 let hangerPoints=[];for(const line of main)for(const [a,b] of line.parts){const n=Math.max(1,Math.ceil((b-a)/4));for(let k=0;k<=n;k++)hangerPoints.push({x:line.at,y:a+(b-a)*k/n})}
 const waste=Math.max(0,Number(options.waste)||0)/100;
 return {poly,b,width,height,areaSqFt:sqft,perimeterLF:perimeter(poly),fullTiles,cutTiles,tiles:fullTiles+cutTiles,
  tileOrder:Math.ceil((fullTiles+cutTiles)*(1+waste)),mainLF:mainQty.lf,mainPieces:mainQty.pieces,mainOrder:Math.ceil(mainQty.pieces*(1+waste)),
  tee4LF:cross4Qty.lf,tee4Pieces:cross4Qty.pieces,tee4Order:Math.ceil(cross4Qty.pieces*(1+waste)),
  tee2LF:cross2Qty.lf,tee2Pieces:cross2Qty.pieces,tee2Order:Math.ceil(cross2Qty.pieces*(1+waste)),
  wallAngle10:Math.ceil(perimeter(poly)*(1+waste)/10),hangerPoints,hangerOrder:Math.ceil(hangerPoints.length*(1+waste)),
  main,cross4,cross2,offX,offY};
}
root.AtlasCeilingGrid={calculate,transform,area,clipRect,lineParts};
})(typeof globalThis!=='undefined'?globalThis:this);
