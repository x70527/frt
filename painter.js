(()=>{'use strict';
const $=id=>document.getElementById(id);
const X=3.725290298461914e-8,KEY='FootRigRegionPainter-v1';
const R=[
['None','#000000'],['Hallux Proximal','#ff6b6b'],['Hallux Distal','#ff9f43'],
['Index Proximal','#feca57'],['Index Middle','#d4d957'],['Index Distal','#a4d957'],
['Middle Proximal','#48db7d'],['Middle Middle','#1dd1a1'],['Middle Distal','#00a8a8'],
['Ring Proximal','#54a0ff'],['Ring Middle','#2e86de'],['Ring Distal','#5f5fff'],
['Pinky Proximal','#a55eea'],['Pinky Middle','#8854d0'],['Pinky Distal','#6c3ec7'],
['Forefoot / Ball','#f8c291'],['Instep / Top Midfoot','#e58e26'],['Sole / Arch','#78e08f'],
['Heel','#60a3bc'],['Ankle','#82ccdd'],['Lower Leg','#b8e994'],['Toenails','#f368e0']];
let targets=[],undo=[],redo=[],painting=false,stroke=null,ray=null,ndc=null,tmp=null,tmp2=null,pointerId=null,lastPoint=null;
let mirrorMap=null,mirrorOffsets=[],mirrorRecords=[],mirrorStats={matched:0,total:0};
let mirrorMap=null,mirrorOffsets=[],mirrorRecords=[],mirrorStats={matched:0,total:0};

function addUI(){
 const panel=$('panel'),d=document.createElement('div');d.id='paintPanel';
 d.innerHTML='<hr><div class="nudgeHead"><b>Vertex Region Painter</b><label><input id="paintMode" type="checkbox"> Paint mode</label></div>'+
 '<div class="row"><label>Region <select id="region"></select></label><label>Brush <input id="brush" type="range" min="0" max="0.025" step="0.0005" value="0.006"></label><span id="brushVal">0.0060</span></div>'+'<div class="row"><label><input id="faceTap" type="checkbox" checked> Precise triangle tap</label></div>'+
 '<div class="row"><label><input id="mirrorPaint" type="checkbox" checked> Mirror paint</label><label><input id="paintColors" type="checkbox" checked> Show painted faces</label><button id="paintUndo">Undo</button><button id="paintRedo">Redo</button><button id="paintClear">Clear labels</button></div><div class="row"><button id="mirrorRL">Mirror Right → Left now</button><button id="mirrorLR">Mirror Left → Right now</button></div><div class="row"><button id="mirrorRL">Mirror Right → Left now</button><button id="mirrorLR">Mirror Left → Right now</button></div>'+
 '<div class="row"><button id="paintCopy">Copy JSON</button><button id="paintSave">Save now</button><button id="paintLoad">Load JSON</button><input id="paintImport" type="file" accept=".json,application/json" hidden></div>'+
 '<div id="paintStatus">Load the model, then enable Paint mode. Painting is saved automatically on-device.</div>'+
 '<p>Painting still stores anatomical labels per vertex. The visualizer displays those labels as crisp, discrete mesh triangles with no soft blending. A triangle is shown only when at least two of its three vertices agree on the same painted region, preventing one shared vertex from visually bleeding into surrounding triangles. Each complete drag is one undo step.</p>';
 panel.appendChild(d);
 const sel=$('region');R.forEach((r,i)=>{let o=document.createElement('option');o.value=i;o.textContent=(i?'':'Eraser / ')+r[0];sel.appendChild(o)});
 $('brush').oninput=()=>{$('brushVal').textContent=(+$('brush').value).toFixed(4)};
 $('paintMode').onchange=togglePaint;$('paintColors').onchange=showLabels;$('paintUndo').onclick=doUndo;$('paintRedo').onclick=doRedo;$('paintClear').onclick=clearAll;
 $('paintCopy').onclick=copyJSON;$('paintSave').onclick=saveLocal;$('paintLoad').onclick=()=>$('paintImport').click();$('paintImport').onchange=importJSON;$('mirrorRL').onclick=()=>syncMirror('Right');$('mirrorLR').onclick=()=>syncMirror('Left');$('mirrorRL').onclick=()=>syncMirror('Right');$('mirrorLR').onclick=()=>syncMirror('Left');
}
function buildTargets(){
 targets=[];const lab=window.FootRigLab;if(!lab)return;
 for(const mesh of lab.getMeshes()){
  if(!mesh.geometry||!mesh.geometry.attributes.position)continue;
  const n=mesh.geometry.attributes.position.count,t={mesh,labels:new Uint8Array(n),overlay:null,overlayColor:null,base:[]};
  targets.push(t);const ms=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  t.base=ms.map(x=>({m:x,side:x.side}));
 }
 undo=[];redo=[];buildMirrorMap();restoreLocal();showLabels();
 $('paintStatus').textContent='Painter ready: '+targets.length+' mesh(es), '+targets.reduce((a,t)=>a+t.labels.length,0)+' vertices. Exact mirror map: '+mirrorStats.matched+'/'+mirrorStats.total+' vertices.';
}
function buildMirrorMap(){
 mirrorOffsets=[];mirrorRecords=[];mirrorStats={matched:0,total:0};
 let total=0;for(const t of targets){mirrorOffsets.push(total);total+=t.labels.length}
 mirrorOffsets.push(total);mirrorMap=new Int32Array(total);mirrorMap.fill(-1);
 const left=new Map(),right=new Map(),cell=.00075;
 const key=(x,y,z)=>Math.round(x/cell)+','+Math.round(y/cell)+','+Math.round(z/cell);
 for(let ti=0;ti<targets.length;ti++){
  const t=targets[ti],pa=t.mesh.geometry.attributes.position;
  for(let i=0;i<pa.count;i++){
   const v=new THREE.Vector3();
   if(t.mesh.isSkinnedMesh&&t.mesh.getVertexPosition)t.mesh.getVertexPosition(i,v);else v.fromBufferAttribute(pa,i);
   v.applyMatrix4(t.mesh.matrixWorld);
   const gi=mirrorOffsets[ti]+i,rec={ti,i,gi,x:v.x,y:v.y,z:v.z};
   mirrorRecords[gi]=rec;
   const map=v.x<X?left:right;
   const k=key(v.x,v.y,v.z);let a=map.get(k);if(!a)map.set(k,a=[]);a.push(rec);
  }
 }
 const link=(from,to)=>{
  for(const rec of from.values())for(const a of rec){
   const tx=2*X-a.x,ty=a.y,tz=a.z;
   let best=null,bd=Infinity,cx=Math.round(tx/cell),cy=Math.round(ty/cell),cz=Math.round(tz/cell);
   for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
    const arr=to.get((cx+dx)+','+(cy+dy)+','+(cz+dz));if(!arr)continue;
    for(const q of arr){const d=(q.x-tx)**2+(q.y-ty)**2+(q.z-tz)**2;if(d<bd){bd=d;best=q}}
   }
   // Never guess across a toe gap. Only accept a genuinely coincident mirror.
   if(best&&bd<=cell*cell*2.25){mirrorMap[a.gi]=best.gi;mirrorMap[best.gi]=a.gi;}
  }
 };
 link(left,right);
 mirrorStats.total=total;mirrorStats.matched=Array.from(mirrorMap).filter(v=>v>=0).length;
}
function mirrorOf(ti,i){
 if(!mirrorMap)return null;const gi=mirrorOffsets[ti]+i,mg=mirrorMap[gi];return mg<0?null:mirrorRecords[mg];
}
function recordLabel(ti,i,id){
 const t=targets[ti],old=t.labels[i];if(old===id)return false;
 if(!stroke)stroke=new Map();const k=ti+':'+i;
 if(!stroke.has(k))stroke.set(k,{ti,i,old,neu:id});else stroke.get(k).neu=id;
 t.labels[i]=id;return true;
}
function recordMirrored(ti,i,id){
 recordLabel(ti,i,id);
 if(!$('mirrorPaint').checked)return;
 const m=mirrorOf(ti,i);if(m)recordLabel(m.ti,m.i,id);
}
function syncMirror(fromSide){
 if(!targets.length||!mirrorMap){$('paintStatus').textContent='Mirror map is not ready.';return}
 finishStroke();let changed=0;
 for(let gi=0;gi<mirrorRecords.length;gi++){
  const a=mirrorRecords[gi];if(!a||((a.x<X)?'Left':'Right')!==fromSide)continue;
  const mg=mirrorMap[gi];if(mg<0)continue;const z=mirrorRecords[mg],id=targets[a.ti].labels[a.i];
  if(targets[z.ti].labels[z.i]!==id){targets[z.ti].labels[z.i]=id;changed++}
 }
 undo=[];redo=[];showLabels();saveLocal();
 $('paintStatus').textContent='Mirrored '+fromSide+' foot labels exactly to the opposite foot ('+changed+' vertices updated).';
}
function buildMirrorMap(){
 mirrorOffsets=[];mirrorRecords=[];mirrorStats={matched:0,total:0};
 let total=0;for(const t of targets){mirrorOffsets.push(total);total+=t.labels.length}mirrorOffsets.push(total);
 mirrorMap=new Int32Array(total);mirrorMap.fill(-1);
 const left=new Map(),right=new Map(),cell=.00075,key=(x,y,z)=>Math.round(x/cell)+','+Math.round(y/cell)+','+Math.round(z/cell);
 for(let ti=0;ti<targets.length;ti++){const t=targets[ti],pa=t.mesh.geometry.attributes.position;
  for(let i=0;i<pa.count;i++){const v=new THREE.Vector3();if(t.mesh.isSkinnedMesh&&t.mesh.getVertexPosition)t.mesh.getVertexPosition(i,v);else v.fromBufferAttribute(pa,i);v.applyMatrix4(t.mesh.matrixWorld);
   const gi=mirrorOffsets[ti]+i,rec={ti,i,gi,x:v.x,y:v.y,z:v.z};mirrorRecords[gi]=rec;const map=v.x<X?left:right,k=key(v.x,v.y,v.z);let ar=map.get(k);if(!ar)map.set(k,ar=[]);ar.push(rec);
  }
 }
 const link=(from,to)=>{for(const ar of from.values())for(const a of ar){const tx=2*X-a.x,ty=a.y,tz=a.z,cx=Math.round(tx/cell),cy=Math.round(ty/cell),cz=Math.round(tz/cell);let best=null,bd=Infinity;
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){const aa=to.get((cx+dx)+','+(cy+dy)+','+(cz+dz));if(!aa)continue;for(const q of aa){const d=(q.x-tx)**2+(q.y-ty)**2+(q.z-tz)**2;if(d<bd){bd=d;best=q}}}
  if(best&&bd<=cell*cell*2.25){mirrorMap[a.gi]=best.gi;mirrorMap[best.gi]=a.gi;}
 }};link(left,right);mirrorStats.total=total;for(const v of mirrorMap)if(v>=0)mirrorStats.matched++;
}
function mirrorOf(ti,i){if(!mirrorMap)return null;const mg=mirrorMap[mirrorOffsets[ti]+i];return mg<0?null:mirrorRecords[mg]}
function recordLabel(ti,i,id){const t=targets[ti],old=t.labels[i];if(old===id)return false;if(!stroke)stroke=new Map();const k=ti+':'+i;if(!stroke.has(k))stroke.set(k,{ti,i,old,neu:id});else stroke.get(k).neu=id;t.labels[i]=id;return true}
function recordMirrored(ti,i,id){recordLabel(ti,i,id);if(!$('mirrorPaint').checked)return;const m=mirrorOf(ti,i);if(m)recordLabel(m.ti,m.i,id)}
function syncMirror(fromSide){if(!targets.length||!mirrorMap){$('paintStatus').textContent='Mirror map is not ready.';return}finishStroke();let changed=0;for(let gi=0;gi<mirrorRecords.length;gi++){const a=mirrorRecords[gi];if(!a||((a.x<X)?'Left':'Right')!==fromSide)continue;const mg=mirrorMap[gi];if(mg<0)continue;const z=mirrorRecords[mg],id=targets[a.ti].labels[a.i];if(targets[z.ti].labels[z.i]!==id){targets[z.ti].labels[z.i]=id;changed++}}undo=[];redo=[];showLabels();saveLocal();$('paintStatus').textContent='Mirrored '+fromSide+' foot labels exactly to the opposite foot ('+changed+' vertices updated).'}
function ensureOverlay(t){
 if(t.overlay)return;
 const src=t.mesh.geometry,idx=src.index?src.index.array:null,count=idx?idx.length:src.attributes.position.count;
 const og=new THREE.BufferGeometry();
 // Duplicate each triangle's vertices so every face can have one flat color.
 for(const name in src.attributes){
  const a=src.attributes[name],arr=new a.array.constructor(count*a.itemSize);
  for(let i=0;i<count;i++){const si=idx?idx[i]:i;for(let k=0;k<a.itemSize;k++)arr[i*a.itemSize+k]=a.array[si*a.itemSize+k]}
  og.setAttribute(name,new THREE.BufferAttribute(arr,a.itemSize,a.normalized));
 }
 t.faceMap=new Uint32Array(count);for(let i=0;i<count;i++)t.faceMap[i]=idx?idx[i]:i;
 t.overlayColor=new THREE.Float32BufferAttribute(new Float32Array(count*3),3);t.overlayColor.setUsage(THREE.DynamicDrawUsage);og.setAttribute('color',t.overlayColor);
 t.overlayVisible=new THREE.Float32BufferAttribute(new Float32Array(count),1);t.overlayVisible.setUsage(THREE.DynamicDrawUsage);og.setAttribute('labelVisible',t.overlayVisible);
 // This mesh is attached to the source mesh and copies skin attributes, so it follows the rig exactly.
 const mat=new THREE.ShaderMaterial({
  transparent:true,depthTest:true,depthWrite:false,skinning:t.mesh.isSkinnedMesh,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
  vertexShader:`attribute vec3 color; attribute float labelVisible; varying vec3 vColor; varying float vVisible;
#include <common>
#include <uv_pars_vertex>
#include <uv2_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main(){vColor=color;vVisible=labelVisible;
#include <uv_vertex>
#include <uv2_vertex>
#include <color_vertex>
#include <beginnormal_vertex>
#include <morphnormal_vertex>
#include <skinbase_vertex>
#include <skinnormal_vertex>
#include <defaultnormal_vertex>
#include <begin_vertex>
#include <morphtarget_vertex>
#include <skinning_vertex>
#include <project_vertex>
#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
#include <worldpos_vertex>
#include <fog_vertex>
}`,
  fragmentShader:`precision mediump float; varying vec3 vColor; varying float vVisible; void main(){if(vVisible<0.5) discard; gl_FragColor=vec4(vColor,0.82);}`
 });
 t.overlay=t.mesh.isSkinnedMesh?new THREE.SkinnedMesh(og,mat):new THREE.Mesh(og,mat);if(t.mesh.isSkinnedMesh)t.overlay.bind(t.mesh.skeleton,t.mesh.bindMatrix);t.overlay.name='PaintedFaceOverlay';t.overlay.frustumCulled=false;t.overlay.renderOrder=1000;t.mesh.add(t.overlay);
}
function faceRegion(a,b,c){
 // Require a 2/3 majority. A single shared vertex therefore cannot make
 // all surrounding triangles appear painted.
 if(a===b&&a!==0)return a;
 if(a===c&&a!==0)return a;
 if(b===c&&b!==0)return b;
 return 0;
}
function updateOverlay(t){
 ensureOverlay(t);const c=t.overlayColor.array,v=t.overlayVisible.array,map=t.faceMap;
 for(let i=0;i<map.length;i+=3){
  const id=faceRegion(t.labels[map[i]],t.labels[map[i+1]],t.labels[map[i+2]]),cc=new THREE.Color(R[id][1]);
  for(let j=0;j<3;j++){const k=i+j;c[k*3]=cc.r;c[k*3+1]=cc.g;c[k*3+2]=cc.b;v[k]=id?1:0}
 }
 t.overlayColor.needsUpdate=true;t.overlayVisible.needsUpdate=true;
}
function showLabels(){
 const show=$('paintColors')&&$('paintColors').checked,paint=$('paintMode')&&$('paintMode').checked;
 for(const t of targets){updateOverlay(t);t.overlay.visible=!!(show&&paint)}
 if(window.FootRigLab)window.FootRigLab.draw();
}
function togglePaint(){
 const on=$('paintMode').checked,lab=window.FootRigLab;if(!lab)return;
 finishStroke();
 if(on){$('wiggle').checked=false;$('reset').click();lab.controls.enabled=true;targets.forEach(t=>t.base.forEach(s=>s.m.side=THREE.DoubleSide));$('paintStatus').textContent='Paint mode active. Painted regions are displayed as crisp triangles.'}
 else {targets.forEach(t=>t.base.forEach(s=>s.m.side=s.side));$('paintStatus').textContent='Paint mode off.'}
 showLabels();
}
function evtNDC(e){const rect=window.FootRigLab.renderer.domElement.getBoundingClientRect();ndc.set(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1)}
function hit(e){if(!targets.length)return null;evtNDC(e);ray.setFromCamera(ndc,window.FootRigLab.camera);const xs=ray.intersectObjects(targets.map(t=>t.mesh),false);return xs[0]||null}
function paintFace(h,id){
 const t=targets.find(x=>x.mesh===h.object);if(!t||!h.face)return;
 const idx=h.object.geometry.index?h.object.geometry.index.array:null;
 const raw=[h.face.a,h.face.b,h.face.c];
 for(const i of raw){const vi=idx?idx[i]:i;recordMirrored(targets.indexOf(t),vi,id);}
}
function paintCenter(center,normal,id,rad2){
 for(let ti=0;ti<targets.length;ti++){const t=targets[ti],m=t.mesh,pa=m.geometry.attributes.position,na=m.geometry.attributes.normal;
  for(let i=0;i<pa.count;i++){
   if(m.isSkinnedMesh&&m.getVertexPosition)m.getVertexPosition(i,tmp);else tmp.fromBufferAttribute(pa,i);tmp.applyMatrix4(m.matrixWorld);
   if(tmp.distanceToSquared(center)>rad2)continue;
   if(normal&&na){tmp2.fromBufferAttribute(na,i).transformDirection(m.matrixWorld);if(tmp2.dot(normal)<-0.05)continue}
   recordMirrored(ti,i,id);
  }
 }
}
function paintAt(p,normal,refresh=true){
 const rad=+$('brush').value,rad2=rad*rad,id=+$('region').value;
 paintCenter(p,normal,id,rad2);
 if(refresh)showLabels();
}
function paintSegment(a,b,normal){
 const rad=+$('brush').value,dist=a.distanceTo(b),steps=Math.max(1,Math.ceil(dist/Math.max(rad*.45,.00075)));
 for(let i=1;i<=steps;i++){const p=a.clone().lerp(b,i/steps);paintAt(p,normal,false)}
 showLabels();
}
function finishStroke(){
 if(!stroke||!stroke.size){stroke=null;lastPoint=null;return}
 undo.push([...stroke.values()]);if(undo.length>60)undo.shift();redo=[];stroke=null;lastPoint=null;saveLocal();
}
function doUndo(){finishStroke();const a=undo.pop();if(!a)return;for(const x of a)targets[x.ti].labels[x.i]=x.old;redo.push(a);showLabels();saveLocal();$('paintStatus').textContent='Undid '+a.length+' vertex change(s).'}
function doRedo(){finishStroke();const a=redo.pop();if(!a)return;for(const x of a)targets[x.ti].labels[x.i]=x.neu;undo.push(a);showLabels();saveLocal();$('paintStatus').textContent='Redid '+a.length+' vertex change(s).'}
function clearAll(){finishStroke();if(!confirm('Clear all painted region labels?'))return;for(const t of targets)t.labels.fill(0);undo=[];redo=[];showLabels();saveLocal()}
function bytes64(a){let s='',step=32768;for(let i=0;i<a.length;i+=step)s+=String.fromCharCode.apply(null,a.subarray(i,i+step));return btoa(s)}
function from64(s){const z=atob(s),a=new Uint8Array(z.length);for(let i=0;i<z.length;i++)a[i]=z.charCodeAt(i);return a}
function payload(){return {format:'FootRigRegionPainter-v1',mirrorPlaneX:X,regions:R.map((r,i)=>({id:i,name:r[0],color:r[1]})),meshes:targets.map(t=>({name:t.mesh.name||'',vertexCount:t.labels.length,labelsBase64:bytes64(t.labels)}))}}
function saveLocal(){if(!targets.length)return;try{localStorage.setItem(KEY,JSON.stringify(payload()));$('paintStatus').textContent='Saved locally. '+targets.reduce((a,t)=>a+t.labels.length,0)+' vertices tracked.'}catch(e){$('paintStatus').textContent='Local save failed: '+e.message}}
function applyPayload(p){if(!p||p.format!=='FootRigRegionPainter-v1'||!Array.isArray(p.meshes))throw Error('Not a FootRigRegionPainter-v1 file.');let n=0;
 for(let i=0;i<targets.length;i++){const src=p.meshes[i],t=targets[i];if(!src||src.vertexCount!==t.labels.length)throw Error('Mesh '+i+' vertex count does not match.');const a=from64(src.labelsBase64);if(a.length!==t.labels.length)throw Error('Invalid label data.');t.labels.set(a);n+=a.length}
 showLabels();saveLocal();$('paintStatus').textContent='Loaded region map for '+n+' vertices.';
}
function restoreLocal(){try{const s=localStorage.getItem(KEY);if(!s)return;applyPayload(JSON.parse(s));$('paintStatus').textContent='Restored saved labels from this device.'}catch(e){$('paintStatus').textContent='Saved labels ignored: '+e.message}}
async function copyJSON(){if(!targets.length)return;const s=JSON.stringify(payload(),null,2);try{await navigator.clipboard.writeText(s);$('paintStatus').textContent='Region JSON copied to clipboard.'}catch(e){const ta=document.createElement('textarea');ta.value=s;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();$('paintStatus').textContent='Region JSON copied.'}}
function importJSON(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{applyPayload(JSON.parse(r.result))}catch(x){$('paintStatus').textContent='Import failed: '+x.message}};r.readAsText(f);e.target.value=''}
function onDown(e){
 if(!$('paintMode').checked||(e.pointerType==='mouse'&&e.button!==0))return;
 const h=hit(e);if(!h)return;
 painting=true;pointerId=e.pointerId;stroke=new Map();lastPoint=h.point.clone();window.FootRigLab.controls.enabled=false;
 try{e.currentTarget.setPointerCapture(pointerId)}catch(_){}
 const n=h.face&&h.face.normal?h.face.normal.clone().transformDirection(h.object.matrixWorld):null;const br=+$('brush').value;if($('faceTap').checked&&br===0){paintFace(h,+$('region').value);showLabels();}else paintAt(h.point,n);e.preventDefault();
}
function onMove(e){
 if(!painting||e.pointerId!==pointerId)return;const h=hit(e);if(!h)return;
 const n=h.face&&h.face.normal?h.face.normal.clone().transformDirection(h.object.matrixWorld):null;
 if(lastPoint)paintSegment(lastPoint,h.point,n);else paintAt(h.point,n);lastPoint=h.point.clone();e.preventDefault();
}
function onUp(e){
 if(!painting||(e.pointerId!=null&&e.pointerId!==pointerId))return;
 const c=window.FootRigLab&&window.FootRigLab.renderer.domElement;
 if(c&&pointerId!=null){try{if(c.hasPointerCapture(pointerId))c.releasePointerCapture(pointerId)}catch(_){}}
 painting=false;pointerId=null;window.FootRigLab.controls.enabled=true;finishStroke();e&&e.preventDefault&&e.preventDefault();
}
function init(){
 if(!window.FootRigLab||!window.THREE){setTimeout(init,100);return}
 ray=new THREE.Raycaster();ndc=new THREE.Vector2();tmp=new THREE.Vector3();tmp2=new THREE.Vector3();addUI();
 const c=window.FootRigLab.renderer.domElement;
 c.addEventListener('pointerdown',onDown,{passive:false});c.addEventListener('pointermove',onMove,{passive:false});c.addEventListener('pointerup',onUp,{passive:false});c.addEventListener('pointercancel',onUp,{passive:false});c.addEventListener('lostpointercapture',onUp,{passive:false});
 addEventListener('blur',()=>onUp({pointerId:pointerId,preventDefault(){}}));document.addEventListener('visibilitychange',()=>{if(document.hidden)onUp({pointerId:pointerId,preventDefault(){}})});
 addEventListener('footrigloaded',buildTargets);
}
init();
})();