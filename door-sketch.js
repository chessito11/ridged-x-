(function(root){
  "use strict";
  const escape = value => String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function render(wall,door) {
    const start=door.centerT*wall.lengthFt-door.widthFt/2,end=start+door.widthFt;
    const left=Math.max(0,start-2),right=Math.min(wall.lengthFt,end+2);
    const scale=Math.min(450/(right-left),245/wall.height);
    const x=ft=>55+(ft-left)*scale,y=ft=>295-ft*scale;
    const parts=[];
    const line=(x1,y1,x2,y2,color,width=3,dash="")=>parts.push('<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+color+'" stroke-width="'+width+'"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/>');
    const text=(xx,yy,label,color="#dce7f4",size=12)=>parts.push('<text x="'+xx+'" y="'+yy+'" fill="'+color+'" font-size="'+size+'" text-anchor="middle">'+escape(label)+'</text>');
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 370" role="img" aria-label="Live door framing elevation"><rect width="560" height="370" rx="8" fill="#0c121c"/>');
    const top=y(wall.height),bottom=y(0),openingTop=y(door.heightFt),headerTop=y(door.heightFt+door.headerDepthIn/12);
    parts.push('<rect x="'+x(start)+'" y="'+openingTop+'" width="'+(door.widthFt*scale)+'" height="'+(door.heightFt*scale)+'" fill="#1e2b3e" stroke="#8c9bb0" stroke-dasharray="5 4"/>');
    const all=wall.doors||[];
    for(const mark of root.AtlasQuantities.studPositions(wall)){
      if(mark.at<left||mark.at>right)continue;
      if(!["stud","end","cripple"].includes(mark.kind))continue;
      const atDoor=all.find(d=>Math.abs(mark.at-d.centerT*wall.lengthFt)<d.widthFt/2);
      const low=mark.kind==="cripple"&&atDoor ? atDoor.heightFt+atDoor.headerDepthIn/12 : 0;
      line(x(mark.at)+(mark.kind==="end"?5:0),top,x(mark.at)+(mark.kind==="end"?5:0),y(low),mark.kind==="cripple"?"#71dfb3":"#7eb9ef",3);
    }
    if(wall.topTrack!=="None")line(x(left),top,x(right),top,"#b7c5d7",5);
    if(wall.bottomTrack!=="None") {
      let cursor=left;
      for(const d of [...all].sort((a,b)=>a.centerT-b.centerT)){
        const a=d.centerT*wall.lengthFt-d.widthFt/2,b=a+d.widthFt;
        if(b<=left||a>=right)continue;
        if(a>cursor)line(x(cursor),bottom,x(Math.min(a,right)),bottom,"#b7c5d7",5);
        cursor=Math.max(cursor,b);
      }
      if(cursor<right)line(x(cursor),bottom,x(right),bottom,"#b7c5d7",5);
    }
    const jambColor=door.jambMaterial==="wood"?"#ffb45c":"#e9a7ff";
    for(let i=0;i<door.jambsPerSide;i++) {
      line(x(start)-i*5,top,x(start)-i*5,bottom,jambColor,3);
      line(x(end)+i*5,top,x(end)+i*5,bottom,jambColor,3);
    }
    if(door.headerRuns>0) {
      parts.push('<rect x="'+x(start)+'" y="'+headerTop+'" width="'+door.widthFt*scale+'" height="'+Math.max(2,openingTop-headerTop)+'" fill="#f6ca6330" stroke="#f6ca63"/>');
      for(let i=0;i<door.headerRuns;i++) {
        const yy=door.headerRuns===1?openingTop:openingTop-i*Math.max(4,openingTop-headerTop)/(door.headerRuns-1);
        line(x(start),yy,x(end),yy,"#f6ca63",3);
      }
    }
    text(280,22,"Door framing · "+(door.doorType||"Custom")+" · "+door.label);
    text(280,43,"Wall "+wall.height+" ft · "+wall.spacing+' in O.C. · '+(wall.studSize||"")+" "+(wall.gauge||""));
    line(x(start),318,x(end),318,"#96a8bd",1);
    for(const at of [start,end])line(x(at),313,x(at),323,"#96a8bd",1);
    text((x(start)+x(end))/2,338,door.widthFt+" ft rough width");
    text((x(start)+x(end))/2,(openingTop+bottom)/2,door.heightFt+" ft high","#c8d7eb");
    text(280,358,door.jambsPerSide+" "+door.jambMaterial+" jamb(s)/side · "+door.headerRuns+" header track run(s) · "+door.headerDepthIn+" in depth");
    parts.push("</svg>");
    return parts.join("");
  }
  root.AtlasDoorSketch={render};
})(typeof globalThis!=="undefined"?globalThis:this);
