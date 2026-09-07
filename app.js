(() => {
'use strict';
const $=id=>document.getElementById(id);
const status=$('status'), viewer=$('viewer'), hint=$('dropHint');
if(!window.THREE || !THREE.GLTFLoader){status.textContent='Three.js failed to load.';return;}

const renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'low-power'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
viewer.appendChild(renderer.domElement);
const scene=new THREE.Scene(); scene.background=new THREE.Color(0x0b0d10);
const camera=new THREE.PerspectiveCamera(40,1,.0001,100);
const hemi=new THREE.HemisphereLight(0xffffff,0x303030,1.8); scene.add(hemi);
const light=new THREE.DirectionalLight(0xffffff,1.5); light.position.set(1,2,2); scene.add(light);
const orbit=new THREE.OrbitControls(camera,renderer.domElement); orbit.enableDamping=false;
const transform=new THREE.TransformControls(camera,renderer.domElement); scene.add(transform);

let renderPending=false;
function render(){renderer.render(scene,camera);}
function requestRender(){if(!renderPending){renderPending=true;requestAnimationFrame(()=>{renderPending=false;render();});}}
orbit.addEventListener('change',requestRender);

const toes=['Hallux','Index','Middle','Ring','Pinky'];
const defs=[], byName={};
for(const side of ['Left','Right']){
 const leg=side+' Leg', ankle=side+' Ankle', heel=side+' Heel';
 defs.push({name:leg,parent:null,static:true},{name:ankle,parent:leg},{name:heel,parent:ankle,static:true});
 for(const toe of toes){
  const m=side+' '+toe+' Metatarsal', p=side+' '+toe+' Proximal';
  defs.push({name:m,parent:ankle,static:true},{name:p,parent:m});
  if(toe==='Hallux'){
   const d=side+' '+toe+' Distal';
   defs.push({name:d,parent:p},{name:side+' '+toe+' Tip',parent:d,endpoint:true});
  }else{
   const mid=side+' '+toe+' Middle', d=side+' '+toe+' Distal';
   defs.push({name:mid,parent:p},{name:d,parent:mid},{name:side+' '+toe+' Tip',parent:d,endpoint:true});
  }
 }
}
defs.forEach(d=>byName[d.name]=d);
for(const d of defs){const o=document.createElement('option');o.value=d.name;o.textContent=d.name+(d.static?' [STATIC]':'');$('joint').appendChild(o);}

const markers={}, boneGroup=new THREE.Group(); scene.add(boneGroup);
const markerGeo=new THREE.SphereGeometry(.007,10,8);
const coneGeo=new THREE.ConeGeometry(1,1,8,1,true);
const matStatic=new THREE.MeshBasicMaterial({color:0xffa83d,transparent:true,opacity:.9,depthTest:false});
const matActive=new THREE.MeshBasicMaterial({color:0x4ea1ff,transparent:true,opacity:.9,depthTest:false});
const matTip=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.9,depthTest:false});
function material(d){return d.static?matStatic:(d.endpoint?matTip:matActive);}
function addMarker(d,p){const m=new THREE.Mesh(markerGeo,material(d));m.name=d.name;m.position.copy(p);scene.add(m);markers[d.name]=m;}
function clearRig(){for(const n in markers)scene.remove(markers[n]);for(const n in markers)delete markers[n];while(boneGroup.children.length)boneGroup.remove(boneGroup.children[0]);}
function redrawBones(){
 while(boneGroup.children.length)boneGroup.remove(boneGroup.children[0]);
 for(const d of defs){
  if(!d.parent||!markers[d.parent]||!markers[d.name])continue;
  const a=markers[d.parent].position,b=markers[d.name].position;
  const dir=new THREE.Vector3().subVectors(b,a),len=dir.length(); if(len<1e-6)continue;
  const c=new THREE.Mesh(coneGeo,material(byName[d.parent]));
  c.position.copy(a).add(b).multiplyScalar(.5);
  const r=Math.min(Math.max(len*.11,.003),.009);
  c.scale.set(r,len,r); c.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize()); boneGroup.add(c);
 }
}
function counterpart(n){return n.startsWith('Left ')?'Right '+n.slice(5):n.startsWith('Right ')?'Left '+n.slice(6):null;}
let centerX=0,current=null,updating=false;
function mirrorPoint(p){return new THREE.Vector3(2*centerX-p.x,p.y,p.z);}
function syncInputs(){if(!current)return;for(const a of ['x','y','z'])$(a+'n').value=current.position[a].toFixed(5);}
function pick(name){current=markers[name];if(current){transform.attach(current);$('joint').value=name;syncInputs();requestRender();}}
$('joint').addEventListener('change',()=>pick($('joint').value));

const coord=$('coords');
function nudge(axis,sign){
 if(!current)return;
 const step=Number($('nudgeStep').value)||0.001;
 current.position[axis]+=step*sign;
 changed();
}
for(const a of ['x','y','z']){
 const row=document.createElement('div');row.className='coord';
 row.innerHTML='<span class="axis">'+a.toUpperCase()+'</span><button class="nudge" type="button" aria-label="'+a.toUpperCase()+' decrease">−</button><input id="'+a+'n" type="number" step="0.0001" inputmode="decimal"><button class="nudge" type="button" aria-label="'+a.toUpperCase()+' increase">+</button>';
 coord.appendChild(row);
 const buttons=row.querySelectorAll('.nudge');
 buttons[0].addEventListener('click',()=>nudge(a,-1));
 buttons[1].addEventListener('click',()=>nudge(a,1));
 $(a+'n').addEventListener('change',e=>{if(current&&Number.isFinite(Number(e.target.value))){current.position[a]=Number(e.target.value);changed();}});
}

function save(){
 if(!Object.keys(markers).length)return;
 const joints={}; for(const d of defs){const p=markers[d.name].position;joints[d.name]=[p.x,p.y,p.z];}
 try{localStorage.setItem('foot-rig-tool-v1',JSON.stringify({centerX,joints,selected:current&&current.name,mirror:$('mirror').checked}));}catch(e){}
}
function changed(){
 if(!updating&&current&&$('mirror').checked){
  const other=markers[counterpart(current.name)];
  if(other){updating=true;other.position.copy(mirrorPoint(current.position));updating=false;}
 }
 syncInputs(); redrawBones(); save(); requestRender();
}
transform.addEventListener('objectChange',changed);
transform.addEventListener('dragging-changed',e=>orbit.enabled=!e.value);

let model=null, box=null;
const supplied={
'Left Leg':[-0.12,0.454,-0.037],
'Left Ankle':[-0.11,0.078,-0.03],
'Left Heel':[-0.105,0.026,-0.068],
'Left Hallux Metatarsal':[-0.112,0.0515,0.03],
'Left Hallux Proximal':[-0.1105,0.012,0.0855],
'Left Hallux Distal':[-0.117,0.005,0.12],
'Left Hallux Tip':[-0.126,0,0.147],
'Left Index Metatarsal':[-0.124,0.0525,0.0235],
'Left Index Proximal':[-0.133,0.011,0.091],
'Left Index Middle':[-0.1379,0.0095,0.1135],
'Left Index Distal':[-0.141,0.0035,0.128],
'Left Index Tip':[-0.1444,-0.0034,0.1419361425370647],
'Left Middle Metatarsal':[-0.134,0.05631674191355709,0.0157302397787571],
'Left Middle Proximal':[-0.14733293548226362,0.009316741913557025,0.08624755915999414],
'Left Middle Middle':[-0.15183293548226362,0.01081674191355703,0.10598896687477831],
'Left Middle Distal':[-0.1541329354822637,0.004316741913557024,0.11903436284512282],
'Left Middle Tip':[-0.1568329354822635,-0.004583258086442974,0.13121442156732074],
'Left Ring Metatarsal':[-0.14039974638819694,0.04981674191355708,0.0007302397787571093],
'Left Ring Proximal':[-0.157899746388197,0.009316741913557022,0.07524755915999413],
'Left Ring Middle':[-0.16339974638819701,0.008816741913557025,0.0979889668747783],
'Left Ring Distal':[-0.16469974638819704,0.002316741913557027,0.10703436284512281],
'Left Ring Tip':[-0.16519974638819698,-0.005083258086442934,0.11761442156732083],
'Left Pinky Metatarsal':[-0.14746655729413033,0.021816741913557064,-0.0037697602212428878],
'Left Pinky Proximal':[-0.16796655729413035,0.00831674191355706,0.05324755915999415],
'Left Pinky Middle':[-0.17396655729413035,0.007316741913557067,0.08548896687477829],
'Left Pinky Distal':[-0.17146655729413035,0.00031674191355706696,0.08941834533372467],
'Left Pinky Tip':[-0.16946655729413035,-0.006683258086442927,0.09451442156732083]
};
function mirrorLeftToRight(){
 if(!Object.keys(markers).length){status.textContent='Load the GLB first.';return;}
 for(const d of defs){
  if(!d.name.startsWith('Left '))continue;
  const other=markers[counterpart(d.name)];
  if(other)other.position.copy(mirrorPoint(markers[d.name].position));
 }
 redrawBones();save();syncInputs();status.textContent='All Left joint positions mirrored to Right.';requestRender();
}
$('mirrorLeft').addEventListener('click',mirrorLeftToRight);
function buildDefaults(){
 clearRig(); const c=box.getCenter(new THREE.Vector3()),sz=box.getSize(new THREE.Vector3()); centerX=3.725290298461914e-8;
 for(const side of ['Left','Right']){
  const sx=side==='Left'?c.x-sz.x*.25:c.x+sz.x*.25, medial=side==='Left'?1:-1;
  addMarker(byName[side+' Leg'],new THREE.Vector3(sx,box.max.y,box.min.z));
  addMarker(byName[side+' Ankle'],new THREE.Vector3(sx,c.y,box.min.z+sz.z*.28));
  addMarker(byName[side+' Heel'],new THREE.Vector3(sx,c.y,box.min.z+sz.z*.10));
  toes.forEach((toe,i)=>{
   const x=sx+medial*([-.20,-.10,0,.10,.20][i])*sz.x,base=box.min.z+sz.z*.55,tip=box.max.z-sz.z*.025;
   addMarker(byName[side+' '+toe+' Metatarsal'],new THREE.Vector3(x,c.y,base-sz.z*.14));
   addMarker(byName[side+' '+toe+' Proximal'],new THREE.Vector3(x,c.y,base));
   if(toe==='Hallux')addMarker(byName[side+' '+toe+' Distal'],new THREE.Vector3(x,c.y,base+(tip-base)*.56));
   else {addMarker(byName[side+' '+toe+' Middle'],new THREE.Vector3(x,c.y,base+(tip-base)*.38));addMarker(byName[side+' '+toe+' Distal'],new THREE.Vector3(x,c.y,base+(tip-base)*.70));}
   addMarker(byName[side+' '+toe+' Tip'],new THREE.Vector3(x,c.y,tip));
  });
 }
 for(const [name,p] of Object.entries(supplied))markers[name].position.fromArray(p);
 mirrorLeftToRight();
 redrawBones();pick('Left Ankle');save();
}
function setMaterials(){
 const wire=$('wire').checked,op=Number($('opacity').value);
 if(model)model.traverse(o=>{if(o.isMesh){const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms){m.wireframe=wire;m.transparent=op<.999;m.opacity=op;m.depthWrite=op>.98;m.needsUpdate=true;}}});
 requestRender();
}
$('wire').addEventListener('change',setMaterials);$('opacity').addEventListener('input',setMaterials);

$('file').addEventListener('change',e=>{
 const f=e.target.files[0];if(!f)return;status.textContent='Loading model…';
 const r=new FileReader();r.onload=()=>new THREE.GLTFLoader().parse(r.result,'',g=>{
  if(model)scene.remove(model);model=g.scene;scene.add(model);box=new THREE.Box3().setFromObject(model);
  if(box.isEmpty()){status.textContent='No visible geometry.';return;}
  const c=box.getCenter(new THREE.Vector3()),s=box.getSize(new THREE.Vector3()).length();
  orbit.target.copy(c);camera.position.copy(c).add(new THREE.Vector3(s*.6,s*.42,s*.82));camera.near=Math.max(s/10000,.00001);camera.far=s*20;camera.updateProjectionMatrix();
  hint.style.display='none';buildDefaults();setMaterials();status.textContent='Model loaded. Your complete Left foot alignment was applied and mirrored to Right.';requestRender();
 },err=>status.textContent='GLB error: '+err.message);r.readAsArrayBuffer(f);
});

$('restore').addEventListener('click',()=>{
 try{
  const d=JSON.parse(localStorage.getItem('foot-rig-tool-v1'));if(!d||!d.joints)throw Error();
  centerX=d.centerX??centerX;for(const [n,p] of Object.entries(d.joints))if(markers[n])markers[n].position.fromArray(p);
  $('mirror').checked=d.mirror!==false;redrawBones();pick(d.selected&&markers[d.selected]?d.selected:'Left Ankle');status.textContent='Auto-save restored.';requestRender();
 }catch(e){status.textContent='No compatible auto-save found.';}
});

$('copy').addEventListener('click',async()=>{
 if(!Object.keys(markers).length){status.textContent='Load the GLB first.';return;}
 const joints={};for(const d of defs){const p=markers[d.name].position;joints[d.name]={position:[p.x,p.y,p.z],parent:d.parent||null,static:!!d.static,endpoint:!!d.endpoint};}
 const text=JSON.stringify({format:'FootRigTool-v1',mirrorPlaneX:centerX,hierarchy:'Leg → Ankle → {five Metatarsals, Heel}',joints},null,2);
 try{
  if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);
  else{const ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}
  status.textContent='Rig JSON copied.';
 }catch(e){status.textContent='Clipboard permission failed.';}
});

function resize(){renderer.setSize(viewer.clientWidth,viewer.clientHeight,false);camera.aspect=viewer.clientWidth/viewer.clientHeight;camera.updateProjectionMatrix();requestRender();}
addEventListener('resize',resize);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)requestRender();});
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();save();status.textContent='WebGL context lost. Your edits were auto-saved; reload and restore.';});
resize();camera.position.set(0,.15,.5);status.textContent='Ready. Choose the GLB file.';requestRender();
})();