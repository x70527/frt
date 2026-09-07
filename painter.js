(()=>{'use strict';
const $=id=>document.getElementById(id);
const X=3.725290298461914e-8,KEY='FootRigRegionPainter-v1';
const R=[
['None','#7d8792'],['Hallux Proximal','#ff6b6b'],['Hallux Distal','#ff9f43'],
['Index Proximal','#feca57'],['Index Middle','#d4d957'],['Index Distal','#a4d957'],
['Middle Proximal','#48db7d'],['Middle Middle','#1dd1a1'],['Middle Distal','#00a8a8'],
['Ring Proximal','#54a0ff'],['Ring Middle','#2e86de'],['Ring Distal','#5f5fff'],
['Pinky Proximal','#a55eea'],['Pinky Middle','#8854d0'],['Pinky Distal','#6c3ec7'],
['Forefoot / Ball','#f8c291'],['Instep / Top Midfoot','#e58e26'],['Sole / Arch','#78e08f'],
['Heel','#60a3bc'],['Ankle','#82ccdd'],['Lower Leg','#b8e994'],['Toenails','#f368e0']];
let targets=[],undo=[],redo=[],painting=false,last=0,stroke=null,ray=null,ndc=null,tmp=null,tmp2=null,hitNormal=null,matState=new Map();

function addUI(){
 const panel=$('panel'),d=document.createElement('div');d.id='paintPanel';
 d.innerHTML='<hr><div class="nudgeHead"><b>Vertex Region Painter</b><label><input id="paintMode" type="checkbox"> Paint mode</label></div>'+
 '<div class="row"><label>Region <select id="region"></select></label><label>Brush <input id="brush" type="range" min="0.0015" max="0.025" step="0.0005" value="0.006"></label><span id="brushVal">0.0060</span></div>'+
 '<div class="row"><label><input id="mirrorPaint" type="checkbox" checked> Mirror paint</label><label><input id="paintColors" type="checkbox" checked> Show labels</label><button id="paintUndo">Undo</button><button id="paintRedo">Redo</button><button id="paintClear">Clear labels</button></div>'+
 '<div class="row"><button id="paintCopy">Copy JSON</button><button id="paintSave">Save now</button><button id="paintLoad">Load JSON</button><input id="paintImport" type="file" accept=".json,application/json" hidden></div>'+
 '<div id="paintStatus">Load the model, then enable Paint mode. Painting is saved automatically on-device.</div>'+
 '<p>Paint anatomical regions directly onto vertices. Mirror paint reflects each brush stroke across the foot center plane. These labels are data for the next skin-weight pass; they do not alter the mesh or weights yet.</p>';
 panel.appendChild(d);
 const sel=$('region');R.forEach((r,i)=>{let o=document.createElement('option');o.value=i;o.textContent=(i?'':'Eraser / ')+r[0];sel.appendChild(o)});
 $('brush').oninput=()=>{$('brushVal').textContent=(+$('brush').value).toFixed(4)};
 $('paintMode').onchange=togglePaint;$('mirrorPaint').onchange=()=>{};
 $('paintColors').onchange=showColors;$('paintUndo').onclick=doUndo;$('paintRedo').onclick=doRedo;$('paintClear').onclick=clearAll;
 $('paintCopy').onclick=copyJSON;$('paintSave').onclick=saveLocal;$('paintLoad').onclick=()=>$('paintImport').click();$('paintImport').onchange=importJSON;
}
function buildTargets(){
 targets=[];const lab=window.FootRigLab;if(!lab)return;
 for(const mesh of lab.getMeshes()){if(!mesh.geometry||!mesh.geometry.attributes.position)continue;const n=mesh.geometry.attributes.position.count;
  const t={mesh,labels:new Uint8Array(n),color:null,base:[]};targets.push(t);
  const ms=Array.isArray(mesh.material)?mesh.material:[mesh.material];t.base=ms.map(x=>({m:x,vertexColors:x.vertexColors,side:x.side,color:x.color&&x.color.clone()}));
 }
 undo=[];redo=[];restoreLocal();showColors();$('paintStatus').textContent='Painter ready: '+targets.length+' mesh(es), '+targets.reduce((a,t)=>a+t.labels.length,0)+' vertices.';
}
function togglePaint(){
 const on=$('paintMode').checked,lab=window.FootRigLab;if(!lab)return;
 if(on){$('wiggle').checked=false;$('reset').click();lab.controls.enabled=true;targets.forEach(t=>t.base.forEach(s=>s.m.side=THREE.DoubleSide));$('paintStatus').textContent='Paint mode active. Drag directly on the mesh.'}
 else {targets.forEach(t=>t.base.forEach(s=>s.m.side=s.side));$('paintStatus').textContent='Paint mode off.'}
 lab.draw();
}
function col(i){return new THREE.Color(R[i][1])}
function ensureColor(t){
 const g=t.mesh.geometry,n=t.labels.length;if(!g.attributes.color){t.color=new THREE.Float32BufferAttribute(new Float32Array(n*3),3);t.color.setUsage(THREE.DynamicDrawUsage);g.setAttribute('color',t.color)}else t.color=g.attributes.color;
 const ms=Array.isArray(t.mesh.material)?t.mesh.material:[t.mesh.material];ms.forEach(x=>{x.vertexColors=true;x.needsUpdate=true});
}
function showColors(){
 if(!targets.length)return;const on=$('paintColors').checked;
 for(const t of targets){if(!on){t.base.forEach(s=>{s.m.vertexColors=s.vertexColors;s.m.needsUpdate=true});continue}ensureColor(t);const a=t.color.array;
  for(let i=0;i<t.labels.length;i++){let c=col(t.labels[i]);a[i*3]=c.r;a[i*3+1]=c.g;a[i*3+2]=c.b}t.color.needsUpdate=true;
 }
 window.FootRigLab.draw();
}
function evtNDC(e){
 const rect=window.FootRigLab.renderer.domElement.getBoundingClientRect();ndc.set(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1);
}
function hit(e){
 if(!targets.length)return null;evtNDC(e);ray.setFromCamera(ndc,window.FootRigLab.camera);
 const xs=ray.intersectObjects(targets.map(t=>t.mesh),false);return xs[0]||null;
}
function paintAt(p,normal){
 const rad=+$('brush').value,rad2=rad*rad,id=+$('region').value,mir=$('mirrorPaint').checked;
 const centers=[p];if(mir)centers.push(new THREE.Vector3(2*X-p.x,p.y,p.z));
 for(let ti=0;ti<targets.length;ti++){const t=targets[ti],m=t.mesh,g=m.geometry,pa=g.attributes.position,na=g.attributes.normal;
  for(const center of centers){for(let i=0;i<pa.count;i++){
   if(m.isSkinnedMesh&&m.getVertexPosition)m.getVertexPosition(i,tmp);else tmp.fromBufferAttribute(pa,i);tmp.applyMatrix4(m.matrixWorld);
   if(tmp.distanceToSquared(center)>rad2)continue;
   if(normal&&na){tmp2.fromBufferAttribute(na,i).transformDirection(m.matrixWorld);if(tmp2.dot(normal)<-0.05)continue}
   const old=t.labels[i];if(old===id)continue;if(!stroke)stroke=new Map();const k=ti+':'+i;if(!stroke.has(k))stroke.set(k,{ti,i,old,neu:id});else stroke.get(k).neu=id;t.labels[i]=id;
  }}
 }
 showColors();
}
function finishStroke(){
 if(!stroke||!stroke.size)return;undo.push([...stroke.values()]);if(undo.length>30)undo.shift();redo=[];stroke=null;saveLocal();
}
function doUndo(){const a=undo.pop();if(!a)return;for(const x of a)targets[x.ti].labels[x.i]=x.old;redo.push(a);showColors();saveLocal()}
function doRedo(){const a=redo.pop();if(!a)return;for(const x of a)targets[x.ti].labels[x.i]=x.neu;undo.push(a);showColors();saveLocal()}
function clearAll(){if(!confirm('Clear all painted region labels?'))return;for(const t of targets)t.labels.fill(0);undo=[];redo=[];showColors();saveLocal()}
function sig(){return targets.map(t=>({name:t.mesh.name||'',count:t.labels.length}))}
function bytes64(a){let s='',step=32768;for(let i=0;i<a.length;i+=step)s+=String.fromCharCode.apply(null,a.subarray(i,i+step));return btoa(s)}
function from64(s){const z=atob(s),a=new Uint8Array(z.length);for(let i=0;i<z.length;i++)a[i]=z.charCodeAt(i);return a}
function payload(){return {format:'FootRigRegionPainter-v1',mirrorPlaneX:X,regions:R.map((r,i)=>({id:i,name:r[0],color:r[1]})),meshes:targets.map(t=>({name:t.mesh.name||'',vertexCount:t.labels.length,labelsBase64:bytes64(t.labels)}))}}
function saveLocal(){if(!targets.length)return;try{localStorage.setItem(KEY,JSON.stringify(payload()));$('paintStatus').textContent='Saved locally. '+targets.reduce((a,t)=>a+t.labels.length,0)+' vertices tracked.'}catch(e){$('paintStatus').textContent='Local save failed: '+e.message}}
function applyPayload(p){if(!p||p.format!=='FootRigRegionPainter-v1'||!Array.isArray(p.meshes))throw Error('Not a FootRigRegionPainter-v1 file.');let n=0;
 for(let i=0;i<targets.length;i++){const src=p.meshes[i],t=targets[i];if(!src||src.vertexCount!==t.labels.length)throw Error('Mesh '+i+' vertex count does not match.');const a=from64(src.labelsBase64);if(a.length!==t.labels.length)throw Error('Invalid label data.');t.labels.set(a);n+=a.length}showColors();saveLocal();$('paintStatus').textContent='Loaded region map for '+n+' vertices.';
}
function restoreLocal(){try{const s=localStorage.getItem(KEY);if(!s)return;applyPayload(JSON.parse(s));$('paintStatus').textContent='Restored saved labels from this device.'}catch(e){$('paintStatus').textContent='Saved labels ignored: '+e.message}}
async function copyJSON(){if(!targets.length)return;const s=JSON.stringify(payload(),null,2);try{await navigator.clipboard.writeText(s);$('paintStatus').textContent='Region JSON copied to clipboard.'}catch(e){const ta=document.createElement('textarea');ta.value=s;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();$('paintStatus').textContent='Region JSON copied.'}}
function importJSON(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{applyPayload(JSON.parse(r.result))}catch(x){$('paintStatus').textContent='Import failed: '+x.message}};r.readAsText(f);e.target.value=''}
function onDown(e){if(!$('paintMode').checked||e.pointerType==='mouse'&&e.button!==0)return;const h=hit(e);if(!h)return;painting=true;stroke=new Map();window.FootRigLab.controls.enabled=false;hitNormal=h.face&&h.face.normal?h.face.normal.clone().transformDirection(h.object.matrixWorld):null;paintAt(h.point,hitNormal);e.preventDefault()}
function onMove(e){if(!painting)return;const now=performance.now();if(now-last<28)return;last=now;const h=hit(e);if(!h)return;const n=h.face&&h.face.normal?h.face.normal.clone().transformDirection(h.object.matrixWorld):null;paintAt(h.point,n);e.preventDefault()}
function onUp(){if(!painting)return;painting=false;window.FootRigLab.controls.enabled=true;finishStroke()}
function init(){if(!window.FootRigLab||!window.THREE){setTimeout(init,100);return}ray=new THREE.Raycaster();ndc=new THREE.Vector2();tmp=new THREE.Vector3();tmp2=new THREE.Vector3();addUI();const c=window.FootRigLab.renderer.domElement;c.addEventListener('pointerdown',onDown,{passive:false});c.addEventListener('pointermove',onMove,{passive:false});addEventListener('pointerup',onUp);addEventListener('pointercancel',onUp);addEventListener('footrigloaded',buildTargets)}
init();
})();