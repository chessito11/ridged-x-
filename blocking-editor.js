/* ATLAS Blocking Editor v3.1 – clickable blocking placement and live dimensions.
   Works offline; uses the saved wall's actual length, height, spacing and openings.
   A run is a horizontal BLOCKING ZONE: each stud bay yields its own cut piece.
   Internal elevFt stays at the bottom AFF for backward compatibility. Display reference is configurable. */
(function(root){
'use strict';
const $=id=>document.getElementById(id), EPS=1e-5;
const SIZES={'2x4':3.5,'2x6':5.5,'2x8':7.25,'2x10':9.25,'2x12':11.25};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const number=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
function ftIn(feet){
  if(!Number.isFinite(feet))return '—';
  let total=Math.round(Math.abs(feet)*12*16),ft=Math.floor(total/192); total-=ft*192;
  let inches=Math.floor(total/16),fraction=total%16;
  const gcd=(a,b)=>b?gcd(b,a%b):a;
  let frac='';if(fraction){const div=gcd(fraction,16);frac=` ${fraction/div}/${16/div}`;}
  return `${feet<0?'-':''}${ft}′-${inches}${frac}″`;
}
const AFF_REFS={bottom:'BOTTOM',center:'CENTER',top:'TOP'};
const UNITS_KEY='atlasBlockingUnitsV31';
let displayUnit='ft',pendingAffReference='bottom';
function inchesValue(feet){
 const v=Math.round(Math.abs(feet)*12*16),whole=Math.floor(v/16),rem=v%16;
 const gcd=(a,b)=>b?gcd(b,a%b):a;
 return `${feet<0?'-':''}${whole}${rem?` ${rem/gcd(rem,16)}/${16/gcd(rem,16)}`:''}″`;
}
const showDim=feet=>displayUnit==='in'?inchesValue(feet):ftIn(feet);
const showNumber=feet=>(feet*(displayUnit==='in'?12:1)).toFixed(displayUnit==='in'?2:3).replace(/\.?0+$/,'');
const parseNumber=text=>{
 if(typeof text!=='string'||!text.trim())return NaN;
 const value=Number(text.trim());
 return Number.isFinite(value)&&value>=0?value/(displayUnit==='in'?12:1):NaN;
};
const affReference=run=>AFF_REFS[run?.affReference]?run.affReference:'bottom';
const refOffset=run=>{const h=(SIZES[run.size]||5.5)/12;return affReference(run)==='top'?h:affReference(run)==='center'?h/2:0;};
const affValue=run=>number(run.elevFt)+refOffset(run);
function affString(run,format=ftIn){return `${format(affValue(run))} ${AFF_REFS[affReference(run)]} AFF`;}
function nextLabel(){return `B-${String(Math.max(0,...draft.map(r=>Number(String(r.label||'').match(/^B-(\d+)$/)?.[1])||0))+1).padStart(3,'0')}`;}
function cancelPlacement(){placement=null;placementTouch=null;updatePlaceButton();if(wall)render();}
function updatePlaceButton(){const btn=$('placeBlockingEndsBtn');if(!btn)return;
 const active=!!placement;btn.classList.toggle('blocking-placing',active);btn.setAttribute('aria-pressed',String(active));
 btn.textContent=!active?'📍 TAP START → END':placement.stage==='first'?'CANCEL PLACEMENT · TAP START':'CANCEL PLACEMENT · TAP END';
}
function centers(wall){
 const length=number(wall.lengthFt),step=Math.max(1,number(wall.spacing,16))/12;
 const result=[0];for(let p=step;p<length-EPS&&result.length<10000;p+=step)result.push(p);
 if(length>EPS)result.push(length);return result;
}
function cleanRun(run,wall){
 if(!run || typeof run!=='object')return null;
 const length=number(wall.lengthFt),height=number(wall.height),size=SIZES[run.size]?run.size:'2x6';
 const h=SIZES[size]/12;
 if(!(length>0&&height>0)||!Number.isFinite(Number(run.startFt))||!Number.isFinite(Number(run.lengthFt))||!Number.isFinite(Number(run.elevFt)))return null;
 let start=clamp(Number(run.startFt),0,length),end=clamp(start+Math.max(0,Number(run.lengthFt)),start,length);
 if(end-start<0.01)return null;
 let elev=clamp(Number(run.elevFt),0,Math.max(0,height-h));
 return {id:String(run.id||('B-'+Date.now())),label:String(run.label||'').slice(0,32),size,startFt:start,lengthFt:end-start,elevFt:elev,affReference:affReference(run),stockFt:[8,10,12,16].includes(number(run.stockFt))?number(run.stockFt):10};
}
function compute(wall,options={}){
 const runs=(options.runs??wall.blockingRuns??[]).map(r=>cleanRun(r,wall)).filter(Boolean);
 const faceIn=clamp(number(options.faceIn??wall.blockingFaceIn,1.5),0,4);
 const allowance=faceIn/24; const studs=centers(wall),pieces=[];let omittedDoorBays=0;
 for(const run of runs){
  let runCount=0,runLF=0,omitted=0;
  for(let i=0;i<studs.length-1;i++){
   const a=Math.max(run.startFt,studs[i]+allowance),b=Math.min(run.startFt+run.lengthFt,studs[i+1]-allowance);
   if(b-a<0.02)continue;
   // Door rough openings have no regular stud bays at and below their heights.
   // Do not silently count unsupported pieces inside the rough opening.
   const hitsDoor=(wall.doors||[]).some(door=>{
    const x0=number(door.centerT)*number(wall.lengthFt)-number(door.widthFt)/2;
    const x1=x0+number(door.widthFt);
    return run.elevFt< number(door.heightFt)-EPS && b>x0+EPS && a<x1-EPS;
   });
   if(hitsDoor){omittedDoorBays++;omitted++;continue;}
   const p={runId:run.id,label:run.label,size:run.size,stockFt:run.stockFt,x0:a,x1:b,elevFt:run.elevFt,heightFt:SIZES[run.size]/12,lengthFt:b-a,bay:i+1};
   pieces.push(p);runLF+=b-a;runCount++;
  }
  run.cutPieces=runCount;run.cutLF=runLF;run.omittedBays=omitted;
 }
 const types=new Map();
 for(const p of pieces){const key=p.size+'|'+p.stockFt;let t=types.get(key);
   if(!t){t={size:p.size,stockFt:p.stockFt,pieces:0,installedLF:0,lengths:[]};types.set(key,t);}
   t.pieces++;t.installedLF+=p.lengthFt;t.lengths.push(p.lengthFt);
 }
 for(const t of types.values()){
   // First-fit-decreasing estimate of stock needed; NOT an installation cutting plan.
   const remaining=[];
   for(const l of t.lengths.sort((a,b)=>b-a)){
    let found=remaining.findIndex(r=>r>=l-EPS);
    if(found<0){remaining.push(t.stockFt-l);}
    else remaining[found]-=l;
   }
   t.stockMinimum=remaining.length;t.stockWith5Percent=Math.max(remaining.length,Math.ceil(t.installedLF*1.05/t.stockFt));
   delete t.lengths;
 }
 return {runs,pieces,groups:[...types.values()],totalPieces:pieces.length,installedLF:pieces.reduce((s,p)=>s+p.lengthFt,0),omittedDoorBays,faceIn};
}
function summarize(walls){
 const m=new Map();let pieces=0,lf=0,excluded=0;
 for(const wall of walls){const c=compute(wall);pieces+=c.totalPieces;lf+=c.installedLF;excluded+=c.omittedDoorBays;
  for(const t of c.groups){const key=t.size+'|'+t.stockFt;let g=m.get(key);if(!g){g={...t,stockMinimum:0,stockWith5Percent:0,installedLF:0,pieces:0};m.set(key,g);}
   g.pieces+=t.pieces;g.installedLF+=t.installedLF;g.stockMinimum+=t.stockMinimum;g.stockWith5Percent+=t.stockWith5Percent;
  }
 }
 return {groups:[...m.values()],pieces,lf,excluded};
}
let host=null,wallId=null,wall=null,draft=[],face=1.5,selected=null,dirty=false,gesture=null,layout=null,placement=null,placementTouch=null;
const clone=o=>JSON.parse(JSON.stringify(o));
const genId=()=>`B-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
function bind(handlers){host=handlers;
 $('openBlockingBtn').addEventListener('click',()=>open(handlers.currentWallId()));
 $('closeBlockingBtn').addEventListener('click',close);
 $('cancelBlockingBtn').addEventListener('click',close);
 $('saveBlockingBtn').addEventListener('click',save);
 $('addBlockingRunBtn').addEventListener('click',()=>{
  if(draft.length>=100){alert('This wall has reached 100 blocking zones.');return;}
  const size='2x6',h=SIZES[size]/12;
  const run={id:genId(),label:nextLabel(),size,startFt:0,lengthFt:Math.min(8,number(wall.lengthFt)),elevFt:clamp(4,0,Math.max(0,number(wall.height)-h)),stockFt:10,affReference:pendingAffReference};
  draft.push(run);selected=run.id;dirty=true;placement=null;updatePlaceButton();render();
 });
 $('removeBlockingRunBtn').addEventListener('click',()=>{
  if(!selected)return;draft=draft.filter(r=>r.id!==selected);selected=draft[0]?.id??null;dirty=true;cancelPlacement();
 });
 $('blockingStudFace').addEventListener('input',()=>{face=clamp(number($('blockingStudFace').value,1.5),0,4);dirty=true;render(false);});
 $('placeBlockingEndsBtn').addEventListener('click',()=>{
  if(!wall)return;
  if(placement){cancelPlacement();return;}
  if(draft.length>=100){alert('This wall has reached 100 blocking zones.');return;}
  gesture=null;placementTouch=null;placement={stage:'first',first:null,preview:null};updatePlaceButton();render();
 });
 $('blockingUnits').addEventListener('change',()=>{
  displayUnit=$('blockingUnits').value==='in'?'in':'ft';
  try{root.localStorage.setItem(UNITS_KEY,displayUnit);}catch(_){/* storage optional */}
  render();
 });
 $('blockingAffReference').addEventListener('change',()=>{
  pendingAffReference=$('blockingAffReference').value;
  const r=selectedRun();if(r&&!placement){r.affReference=pendingAffReference;dirty=true;}
  render();
 });
 for(const [id,key] of [['blockingName','label'],['blockingSize','size'],['blockingStart','startFt'],['blockingLength','lengthFt'],['blockingElevation','elevFt'],['blockingStock','stockFt']]){
  $(id).addEventListener('change',()=>{
   const r=selectedRun();if(!r)return;
   const raw=$(id).value;
   if(key==='label'||key==='size')r[key]=raw;
   else if(key==='stockFt')r[key]=number(raw);
   else{
    const ft=parseNumber(raw);
    if(!Number.isFinite(ft)){alert('Enter a non-negative number in the selected unit.');render();return;}
    if(key==='elevFt')r.elevFt=ft-refOffset(r);
    else r[key]=ft;
   }
   const clean=cleanRun(r,wall);if(clean)Object.assign(r,clean);
   dirty=true;render();
  });
 }
 const c=$('blockingCanvas');c.addEventListener('pointerdown',onDown);
 c.addEventListener('pointermove',onMove);c.addEventListener('pointerup',onUp);c.addEventListener('pointercancel',onUp);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('blockingDialog').classList.contains('hidden')){if(placement)cancelPlacement();else close();}});
 window.addEventListener('resize',()=>{if(wall)paint();});
}
function open(id){
 if(!host)return;const found=host.getWall(id);
 if(!found){alert('Save a wall first, then select it and open BLOCKING ELEVATION.');return;}
 wallId=id;wall=found;draft=clone(Array.isArray(wall.blockingRuns)?wall.blockingRuns:[]).map(x=>cleanRun(x,wall)).filter(Boolean);
 face=clamp(number(wall.blockingFaceIn,1.5),0,4);selected=draft[0]?.id??null;pendingAffReference=affReference(draft[0]);dirty=false;gesture=null;placement=null;placementTouch=null;
 try{displayUnit=root.localStorage.getItem(UNITS_KEY)==='in'?'in':'ft';}catch(_){displayUnit='ft';}
 $('blockingDialog').classList.remove('hidden');$('blockingWallName').textContent=`${wall.wallNumber} · ${ftIn(wall.lengthFt)} × ${ftIn(wall.height)} · ${wall.spacing}″ O.C.`;
 $('blockingStudFace').value=face;$('blockingUnits').value=displayUnit;updatePlaceButton();render();
}
function close(){if(!wall)return;if(dirty&&!confirm('Discard the unsaved blocking changes?'))return;
 $('blockingDialog').classList.add('hidden');wall=null;wallId=null;gesture=null;placement=null;placementTouch=null;dirty=false;
}
function save(){if(!wall||!host)return;
 const runs=draft.map(r=>cleanRun(r,wall)).filter(Boolean);
 if(runs.length!==draft.length){alert('One or more blocking runs have invalid dimensions. Please correct or remove them.');return;}
 host.commit(wallId,runs,face);dirty=false;$('blockingDialog').classList.add('hidden');wall=null;wallId=null;gesture=null;placement=null;placementTouch=null;
}
function selectedRun(){return draft.find(x=>x.id===selected)||null;}
function render(refreshInputs=true){if(!wall)return;
 const r=selectedRun();$('blockingFields').hidden=!r;$('removeBlockingRunBtn').disabled=!r;
 $('blockingUnits').value=displayUnit;
 for(const id of ['blockingStart','blockingLength','blockingElevation']){
  const el=$(id);const label=el.closest('label');if(label){const unit=displayUnit==='in'?'in':'ft';
   const title=id==='blockingStart'?'Start from wall left':id==='blockingLength'?'Zone length':`${AFF_REFS[affReference(r||{affReference:pendingAffReference})]} elevation AFF`;
   label.firstChild.textContent=`${title} (${unit})`;
  }
 }
 if(refreshInputs){
  $('blockingStudFace').value=face;
  if(r){for(const [id,key] of [['blockingName','label'],['blockingSize','size'],['blockingStart','startFt'],['blockingLength','lengthFt'],['blockingElevation','elevFt'],['blockingStock','stockFt']]){
    $(id).value=key==='elevFt'?showNumber(affValue(r)):(['startFt','lengthFt'].includes(key)?showNumber(r[key]):r[key]);
   }
   if(!placement)pendingAffReference=affReference(r);$('blockingAffReference').value=pendingAffReference;
  }
 }
 if(!r)$('blockingAffReference').value=pendingAffReference;
 const result=compute(wall,{runs:draft,faceIn:face});const list=$('blockingRunList');list.replaceChildren();
 for(const run of result.runs){const row=document.createElement('button');row.type='button';row.className='blocking-run-item'+(run.id===selected?' selected':'');
  row.textContent=`${run.label||'BLOCK'} · ${run.size} · ${showDim(run.lengthFt)} zone · ${affString(run,showDim)} · ${run.cutPieces} cuts`;
  row.addEventListener('click',()=>{selected=run.id;pendingAffReference=affReference(run);render();});list.appendChild(row);
 }
 const summary=$('blockingMaterialStats');summary.replaceChildren();
 const intro=document.createElement('div');intro.textContent=`${result.totalPieces} between-stud pieces · ${result.installedLF.toFixed(2)} installed LF`;summary.appendChild(intro);
 for(const t of result.groups){const line=document.createElement('div');line.textContent=`${t.size}: ${t.pieces} cut pieces · ${t.installedLF.toFixed(2)} LF · approx. ${t.stockMinimum} × ${t.stockFt}′ stock (before waste)`;summary.appendChild(line);}
 if(result.omittedDoorBays){const warn=document.createElement('div');warn.className='blocking-warning';warn.textContent=`${result.omittedDoorBays} bay location(s) overlap door openings and were excluded. Verify jamb-adjacent blocking separately.`;summary.appendChild(warn);}
 $('blockingStatus').textContent=placement?(placement.stage==='first'?'Placement: tap the START point (including its AFF height) on the elevation.':'Placement: tap the END point. The second tap sets horizontal length; AFF stays at your first tap.'):(dirty?'Unsaved changes — press SAVE BLOCKING to keep them.':'Changes are saved only when you press SAVE BLOCKING.');
 updatePlaceButton();paint();
}
function coord(evt){const rect=$('blockingCanvas').getBoundingClientRect();return {x:(evt.clientX-rect.left),y:(evt.clientY-rect.top)};}
function hitTest(p){if(!layout)return null;const {left,top,sx,sy,H}=layout;
 for(const r of [...draft].reverse()){
  const start=left+r.startFt*sx,end=left+(r.startFt+r.lengthFt)*sx;
  const cy=top+(H-r.elevFt-SIZES[r.size]/12)*sy;
  const ht=Math.max(7,SIZES[r.size]/12*sy);
  if(p.y<cy-11||p.y>cy+ht+11||p.x<start-12||p.x>end+12)continue;
  const kind=Math.abs(p.x-start)<13?'left':Math.abs(p.x-end)<13?'right':'move';return {id:r.id,kind};
 }
 return null;
}
function nearestStud(x){const studs=centers(wall),lim=12/Math.max(layout?.sx||1,1e-6);
 let out=x,dist=lim;for(const s of studs){const d=Math.abs(x-s);if(d<dist){dist=d;out=s;}}return out;
}
function pointToWall(p){return {x:clamp((p.x-layout.left)/layout.sx,0,number(wall.lengthFt)),aff:clamp(number(wall.height)-(p.y-layout.top)/layout.sy,0,number(wall.height))};}
function placementPoint(p){const loc=pointToWall(p);if($('blockingSnap').checked)loc.x=nearestStud(loc.x);return loc;}
function finishPlacement(p){
 const loc=placementPoint(p);
 if(placement.stage==='first'){placement.first=loc;placement.stage='second';placement.preview=loc;render();return;}
 const first=placement.first,start=Math.min(first.x,loc.x),length=Math.abs(first.x-loc.x);
 if(length<.09){$('blockingStatus').textContent='Choose a different end point; the blocking zone needs a positive length.';paint();return;}
 const style=selectedRun();const size=style?.size||'2x6';const reference=pendingAffReference;
 const candidate={id:genId(),label:nextLabel(),size,affReference:reference,startFt:start,lengthFt:length,elevFt:first.aff-(reference==='top'?SIZES[size]/12:reference==='center'?SIZES[size]/24:0),stockFt:style?.stockFt||10};
 const clean=cleanRun(candidate,wall);
 if(!clean){$('blockingStatus').textContent='This blocking run does not fit the wall. Select two other points.';return;}
 draft.push(clean);selected=clean.id;placement=null;placementTouch=null;dirty=true;render();
}
function onDown(evt){if(!wall||evt.button>0)return;
 const point=coord(evt);
 if(placement){placementTouch={pointerId:evt.pointerId,down:point,moved:false};$('blockingCanvas').setPointerCapture(evt.pointerId);evt.preventDefault();return;}
 const h=hitTest(point);if(!h)return;
 const r=draft.find(r=>r.id===h.id);selected=h.id;pendingAffReference=affReference(r);gesture={pointerId:evt.pointerId,kind:h.kind,start:point,origin:clone(r)};
 $('blockingCanvas').setPointerCapture(evt.pointerId);render();evt.preventDefault();
}
function onMove(evt){if(!wall||!layout)return;
 if(placement){
  if(placementTouch&&evt.pointerId===placementTouch.pointerId&&Math.hypot(coord(evt).x-placementTouch.down.x,coord(evt).y-placementTouch.down.y)>9)placementTouch.moved=true;
  if(placement.stage==='second'){placement.preview=placementPoint(coord(evt));paint();}
  return;
 }
 if(!gesture||evt.pointerId!==gesture.pointerId)return;
 const r=selectedRun();if(!r)return;const p=coord(evt),dx=(p.x-gesture.start.x)/layout.sx,dy=(p.y-gesture.start.y)/layout.sy;
 const max=number(wall.lengthFt),height=number(wall.height),o=gesture.origin;
 if(gesture.kind==='left'){
  let x=clamp(o.startFt+dx,0,o.startFt+o.lengthFt-.1);if($('blockingSnap').checked)x=nearestStud(x);
  r.startFt=x;r.lengthFt=o.startFt+o.lengthFt-x;
 }else if(gesture.kind==='right'){
  let x=clamp(o.startFt+o.lengthFt+dx,o.startFt+.1,max);if($('blockingSnap').checked)x=nearestStud(x);
  r.lengthFt=x-o.startFt;
 }else{
  let x=clamp(o.startFt+dx,0,Math.max(0,max-o.lengthFt));if($('blockingSnap').checked)x=clamp(nearestStud(x),0,Math.max(0,max-o.lengthFt));
  r.startFt=x;r.elevFt=clamp(o.elevFt-dy,0,Math.max(0,height-SIZES[r.size]/12));
 }
 dirty=true;render();evt.preventDefault();
}
function onUp(evt){
 if(placementTouch&&evt.pointerId===placementTouch.pointerId){const touch=placementTouch;placementTouch=null;
  if(evt.type!=='pointercancel'&&!touch.moved&&placement)finishPlacement(coord(evt));return;
 }
 if(gesture&&gesture.pointerId===evt.pointerId){gesture=null;render();}
}
function lineDimension(ctx,x1,y1,x2,y2,label,color='#b7e4ff'){
 ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1.2;ctx.setLineDash([]);
 ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
 const horizontal=Math.abs(y1-y2)<2;
 if(horizontal){for(const x of [x1,x2]){ctx.beginPath();ctx.moveTo(x-3,y1-5);ctx.lineTo(x+3,y1+5);ctx.stroke();}}
 else{for(const y of [y1,y2]){ctx.beginPath();ctx.moveTo(x1-5,y);ctx.lineTo(x1+5,y);ctx.stroke();}}
 ctx.font='bold 11px system-ui';ctx.textBaseline='middle';ctx.textAlign='center';
 if(horizontal){const xx=(x1+x2)/2;const width=ctx.measureText(label).width+10;ctx.fillStyle='#101b27';ctx.fillRect(xx-width/2,y1-17,width,13);ctx.fillStyle=color;ctx.fillText(label,xx,y1-10);}
 else{ctx.translate(x1-9,(y1+y2)/2);ctx.rotate(-Math.PI/2);const width=ctx.measureText(label).width+10;ctx.fillStyle='#101b27';ctx.fillRect(-width/2,-7,width,14);ctx.fillStyle=color;ctx.fillText(label,0,0);}
 ctx.restore();
}
function paint(){if(!wall)return;
 const canvas=$('blockingCanvas'),rect=canvas.getBoundingClientRect();if(!rect.width)return;
 const dpr=Math.min(2,root.devicePixelRatio||1),w=Math.max(200,rect.width),h=Math.max(250,rect.height);
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.fillStyle='#101c29';ctx.fillRect(0,0,w,h);
 const left=48,top=25,right=w-22,bottom=h-35,W=right-left,H=bottom-top;
 const sx=W/number(wall.lengthFt,1),sy=H/number(wall.height,1);
 layout={left,top,sx,sy,W,H};
 ctx.fillStyle='#182b3d';ctx.fillRect(left,top,W,H);ctx.strokeStyle='#7c91a8';ctx.lineWidth=1.5;ctx.strokeRect(left,top,W,H);
 const stud=centers(wall);for(const x of stud){const xp=left+x*sx;ctx.lineWidth=2.5;ctx.strokeStyle='#5d92b8';ctx.beginPath();ctx.moveTo(xp,top);ctx.lineTo(xp,bottom);ctx.stroke();}
 for(const door of wall.doors||[]){const x0=number(door.centerT)*number(wall.lengthFt)-number(door.widthFt)/2;
  const x=left+x0*sx,y=top+(number(wall.height)-number(door.heightFt))*sy;
  ctx.fillStyle='rgba(12,17,24,.87)';ctx.fillRect(x,y,number(door.widthFt)*sx,bottom-y);
  ctx.strokeStyle='#b1a7a0';ctx.setLineDash([5,4]);ctx.strokeRect(x,y,number(door.widthFt)*sx,bottom-y);ctx.setLineDash([]);
 }
 const c=compute(wall,{runs:draft,faceIn:face});
 // Draw each actual cut piece inside its nominal stud bay.
 for(const p of c.pieces){const x=left+p.x0*sx, y=top+(number(wall.height)-p.elevFt-p.heightFt)*sy;
  ctx.fillStyle=p.runId===selected?'#f7be72':'#c98c43';ctx.strokeStyle='#ffddac';ctx.lineWidth=.8;
  ctx.fillRect(x,y,Math.max(1,p.lengthFt*sx),Math.max(3,p.heightFt*sy));ctx.strokeRect(x,y,Math.max(1,p.lengthFt*sx),Math.max(3,p.heightFt*sy));
 }
 // Outline the editable horizontal blocking zones; anchor handles allow resize.
 for(const r of draft){const y=top+(number(wall.height)-r.elevFt-SIZES[r.size]/12)*sy;
  const x=left+r.startFt*sx,width=r.lengthFt*sx,hh=Math.max(7,SIZES[r.size]/12*sy);
  ctx.strokeStyle=r.id===selected?'#ffedc3':'#e7a95d';ctx.lineWidth=r.id===selected?2.2:1;ctx.setLineDash([6,3]);ctx.strokeRect(x,y,width,hh);ctx.setLineDash([]);
  if(r.id===selected){ctx.fillStyle='#ffffff';for(const xx of [x,x+width]){ctx.fillRect(xx-4,y+hh/2-6,8,12);}}
  const label=r.label||'BLOCK';if(width>55){ctx.textAlign='center';ctx.textBaseline='bottom';ctx.font='bold 11px system-ui';ctx.strokeStyle='#121e2c';ctx.lineWidth=3;ctx.strokeText(label,x+width/2,y-3);ctx.fillStyle='#ffd39e';ctx.fillText(label,x+width/2,y-3);}
 }
 // Dimension annotations are linked to the selected blocking zone, in actual wall feet.
 const active=selectedRun();if(active){
  const x0=left+active.startFt*sx,x1=left+(active.startFt+active.lengthFt)*sx;
  const blockHeight=SIZES[active.size]/12;
  const yTop=top+(number(wall.height)-active.elevFt-blockHeight)*sy;
  const yRef=top+(number(wall.height)-affValue(active))*sy;
  const dimY=clamp(yTop-17,top+15,bottom-12);
  ctx.save();ctx.strokeStyle='rgba(206,230,249,.8)';ctx.setLineDash([3,4]);ctx.lineWidth=.8;
  for(const x of [x0,x1]){ctx.beginPath();ctx.moveTo(x,yTop);ctx.lineTo(x,dimY);ctx.stroke();}
  ctx.restore();
  lineDimension(ctx,x0,dimY,x1,dimY,showDim(active.lengthFt),'#fff0ce');
  // Independent wall-left offset and AFF dimension (bottom/center/top selected in the editor).
  if(active.startFt>.1&&x0-left>44){lineDimension(ctx,left,bottom+13,x0,bottom+13,showDim(active.startFt),'#9ccce9');}
  lineDimension(ctx,left-17,bottom,left-17,yRef,showDim(affValue(active)),'#b9e6fc');
  ctx.save();ctx.setLineDash([3,4]);ctx.strokeStyle='#b9e6fc';ctx.beginPath();ctx.moveTo(left-11,yRef);ctx.lineTo(Math.max(left+8,x0),yRef);ctx.stroke();ctx.restore();
  ctx.font='bold 10px system-ui';ctx.textAlign='right';ctx.textBaseline='top';ctx.fillStyle='#fff0ce';
  const hud=`${active.label||'BLOCK'} | ${AFF_REFS[affReference(active)]} AFF ${showDim(affValue(active))}`;
  ctx.fillText(hud,right,3,Math.max(100,W));
 }
 // Two tap placement guides: first tap determines both start X and the chosen AFF reference.
 if(placement?.first){const first=placement.first,second=placement.preview||first;
  const x0=left+first.x*sx,x1=left+second.x*sx,y0=top+(number(wall.height)-first.aff)*sy;
  ctx.save();ctx.strokeStyle='#61f0c2';ctx.fillStyle='#61f0c2';ctx.lineWidth=2;ctx.setLineDash([6,4]);
  ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y0);ctx.stroke();ctx.setLineDash([]);
  for(const x of [x0,x1]){ctx.beginPath();ctx.arc(x,y0,5,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#c1ffe8';ctx.textAlign='center';ctx.font='bold 11px system-ui';
  ctx.fillText(showDim(Math.abs(second.x-first.x)),(x0+x1)/2,clamp(y0-11,top+10,bottom-10));ctx.restore();
 }
 ctx.fillStyle='#b4cce0';ctx.font='11px system-ui';ctx.textAlign='center';ctx.fillText(`${ftIn(number(wall.lengthFt))} WALL`,left+W/2,h-9);
 ctx.save();ctx.translate(15,top+H/2);ctx.rotate(-Math.PI/2);ctx.fillText(`${ftIn(number(wall.height))} HEIGHT`,0,0);ctx.restore();
 if(w>580){ctx.font='10px system-ui';ctx.textAlign='left';ctx.fillStyle='#aac1d6';ctx.fillText('Blue: studs   Orange: blocking   Dashed: editable zone   Gray: door opening',left,15);}
}
root.AtlasBlocking={bind,open,compute,summarize,ftIn,affValue,affString};
})(typeof globalThis!=='undefined'?globalThis:this);
