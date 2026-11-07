/* ATLAS PDF material summary: dependency-free, works offline in Android Chrome. */
(function(root){
  'use strict';
  const PAGE_W=612,PAGE_H=792,LEFT=44,RIGHT=568;
  function ascii(v){return String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[\u2010-\u2015]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[\u00d7]/g,'x').replace(/[\u00b2]/g,'2').replace(/[\u2032]/g,"'").replace(/[\u2033]/g,'"').replace(/[^\x20-\x7e]/g,'?');}
  function quoted(v){return '('+ascii(v).replace(/[\\()]/g,'\\$&')+')';}
  function wrap(v,maxChars=77){
    const words=ascii(v).split(/\s+/),lines=[];let line='';
    for(const word of words){
      if(!word)continue;
      if((line+' '+word).trim().length<=maxChars)line=(line+' '+word).trim();
      else{if(line)lines.push(line);if(word.length>maxChars){for(let i=0;i<word.length;i+=maxChars)lines.push(word.slice(i,i+maxChars));line='';}else line=word;}
    }
    if(line)lines.push(line);return lines.length?lines:[''];
  }
  function makePdf(report){
    const pages=[];let commands=[],y=0;
    function line(x1,top1,x2,top2,w=0.5,rgb='0.78 0.83 0.87'){
      commands.push(`${rgb} RG ${w} w ${x1.toFixed(2)} ${(PAGE_H-top1).toFixed(2)} m ${x2.toFixed(2)} ${(PAGE_H-top2).toFixed(2)} l S`);
    }
    function fillRect(x,top,w,h,rgb){commands.push(`${rgb} rg ${x.toFixed(2)} ${(PAGE_H-top-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);}
    function text(str,x,top,size=10,bold=false,rgb='0.12 0.17 0.24'){
      commands.push(`${rgb} rg BT /${bold?'F2':'F1'} ${size} Tf ${x.toFixed(2)} ${(PAGE_H-top-size).toFixed(2)} Td ${quoted(str)} Tj ET`);
    }
    function page(){
      if(commands.length)pages.push(commands.join('\n')+'\n');
      commands=[];y=140;
      fillRect(0,0,PAGE_W,86,'0.08 0.14 0.22');
      fillRect(44,28,34,34,'0.19 0.38 0.59');text('A',55,34,20,true,'1 1 1');
      text('ATLAS',88,26,18,true,'0.90 0.95 1');
      text('FIELD ESTIMATING  /  MATERIAL TAKEOFF',89,50,8,false,'0.66 0.80 0.92');
      text(ascii(report.title||'Material summary'),LEFT,101,16,true);
      line(LEFT,126,RIGHT,126,1,'0.30 0.48 0.66');
    }
    function ensure(space){if(y+space>735)page();}
    function section(title){
      ensure(46);fillRect(LEFT,y,RIGHT-LEFT,24,'0.88 0.93 0.97');
      text(title.toUpperCase(),LEFT+9,y+6,10,true,'0.11 0.27 0.43');y+=34;
    }
    function row(label,value){
      const leftLines=wrap(label,58);
      const h=Math.max(1,leftLines.length)*13+8;
      ensure(h);
      for(let i=0;i<leftLines.length;i++)text(leftLines[i],LEFT+7,y+2+i*13,9,false);
      const val=ascii(value);const x=Math.max(430,RIGHT-9-Math.min(125,val.length*5.2));
      text(val,x,y+2,9,true,'0.08 0.29 0.40');
      line(LEFT+5,y+h-2,RIGHT-5,y+h-2,0.35,'0.88 0.91 0.93');y+=h;
    }
    function paragraph(str){
      const lines=wrap(str,100);ensure(lines.length*13+14);
      for(const l of lines){text(l,LEFT+5,y,8,false,'0.34 0.41 0.49');y+=13;}
      y+=7;
    }
    page();
    paragraph(`Project: ${report.project||'Untitled'}   |   Generated: ${new Date().toLocaleString()}`);
    for(const sec of report.sections||[]){
      if(!sec.rows?.length)continue;
      section(sec.title||'Section');
      for(const rowData of sec.rows)row(rowData[0],rowData[1]);
      y+=7;
    }
    if(report.notes?.length){section('Estimator notes / verification');for(const note of report.notes)paragraph('- '+note);}
    if(commands.length)pages.push(commands.join('\n')+'\n');
    // Re-assemble pages with page numbers and fixed-ASCII PDF objects.
    const objects=[null,
      '<< /Type /Catalog /Pages 2 0 R >>',
      `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${5+i*2} 0 R`).join(' ')}] >>`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
    for(let i=0;i<pages.length;i++){
      const pageId=5+i*2,contentId=pageId+1;
      let content=pages[i];
      content+=`0.38 0.44 0.53 rg BT /F1 8 Tf ${LEFT} 25 Td ${quoted('ATLAS Estimating - Preliminary takeoff / verify before purchasing')} Tj ET\n`;
      content+=`0.38 0.44 0.53 rg BT /F1 8 Tf 524 25 Td ${quoted(`${i+1} / ${pages.length}`)} Tj ET\n`;
      objects[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId]=`<< /Length ${content.length} >>\nstream\n${content}endstream`;
    }
    let out='%PDF-1.4\n',offsets=[0];
    for(let i=1;i<objects.length;i++){
      offsets[i]=out.length;
      out+=`${i} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xref=out.length;
    out+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for(let i=1;i<objects.length;i++)out+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
    out+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([out],{type:'application/pdf'});
  }
  function download(report,filename='ATLAS-Material-Summary.pdf'){
    const pdf=makePdf(report),url=URL.createObjectURL(pdf),a=document.createElement('a');
    a.href=url;a.download=filename;a.style.display='none';document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  root.AtlasPdfReport={makePdf,download};
})(typeof globalThis!=='undefined'?globalThis:this);
