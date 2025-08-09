import * as THREE from 'three';
import { commonShader } from './shaders/common.js';
import { bufferAFragment } from './shaders/bufferA.js';
import { bufferBFragment } from './shaders/bufferB.js';
import { bufferCFragment } from './shaders/bufferC.js';
import { bufferDFragment } from './shaders/bufferD.js';
import { mainFragment, mainVertex } from './shaders/main.js';

// Scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 2.5;
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
// Match original setup for float RTs
renderer.capabilities.isWebGL2 = true;
try { renderer.getContext().getExtension('EXT_color_buffer_float'); } catch(e) {}
document.body.appendChild(renderer.domElement);
const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// Render targets
const floatOptions = {
  format: THREE.RGBAFormat,
  type: THREE.FloatType,
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
  wrapS: THREE.ClampToEdgeWrapping,
  wrapT: THREE.ClampToEdgeWrapping,
  generateMipmaps: false
};

// Buffers: A (positions ping-pong), B (voxel ping-pong), C (steering raw ping-pong), D (state ping-pong)
// Preallocate compact textures: 64x64 holds up to 4096 sites (faster than 224x224)
const SITE_SIDE = 64;
const rtA1 = new THREE.WebGLRenderTarget(SITE_SIDE, SITE_SIDE, floatOptions);
const rtA2 = new THREE.WebGLRenderTarget(SITE_SIDE, SITE_SIDE, floatOptions);
const rtB1 = new THREE.WebGLRenderTarget(512, 512, floatOptions);
const rtB2 = new THREE.WebGLRenderTarget(512, 512, floatOptions);
const rtC1 = new THREE.WebGLRenderTarget(SITE_SIDE, SITE_SIDE, floatOptions);
const rtC2 = new THREE.WebGLRenderTarget(SITE_SIDE, SITE_SIDE, floatOptions);
const rtD1 = new THREE.WebGLRenderTarget(SITE_SIDE, SITE_SIDE, floatOptions);
const rtD2 = new THREE.WebGLRenderTarget(SITE_SIDE, SITE_SIDE, floatOptions);

let pingA = 0; let pingB = 0; let pingC = 0; let pingD = 0;

// Vertex for offscreen passes
const bufferVertexShader = `
out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Materials
const bufferAMaterial = new THREE.ShaderMaterial({
  uniforms: {
    iTime:{value:0}, iFrame:{value:0}, cubeSize:{value:0.30}, usePeriodicBoundaries:{value:0.0},
    iChannel0:{value:null}, // prev A
    iChannel1:{value:null}, // D state
    iChannel2:{value:null}, // B owners
    iActiveSites:{value:1200},
    // physics
    invertSteering:{value:1.0},
    steeringStrength:{value:2.5},
    friction:{value:0.025},
    minSpeed:{value:0.0004},
    maxSpeed:{value:0.0035},
    minRepulsionRadius:{value:0.015},
    repulsionStrength:{value:0.015},
    movementFactor:{value:0.001},
    relaxRepulsionStrength:{value:0.05},
    relaxDuration:{value:0.0002},
    steerDuration:{value:0.0004},
    relaxStepsPerSecond:{value:30.0}
  },
  vertexShader: bufferVertexShader,
  fragmentShader: commonShader + bufferAFragment,
  glslVersion: THREE.GLSL3
});

const bufferBMaterial = new THREE.ShaderMaterial({
  uniforms: { iChannel0:{value:null}, iChannel1:{value:null}, iFrame:{value:0}, cubeSize:{value:0.30}, usePeriodicBoundaries:{value:0.0}, iActiveSites:{value:1200} },
  vertexShader: bufferVertexShader,
  fragmentShader: commonShader + bufferBFragment,
  glslVersion: THREE.GLSL3
});

const bufferCMaterial = new THREE.ShaderMaterial({
  uniforms: { iChannel0:{value:null}, iChannel1:{value:null}, iChannel2:{value:null}, iFrame:{value:0}, cubeSize:{value:0.30}, usePeriodicBoundaries:{value:0.0}, iActiveSites:{value:1200} },
  vertexShader: bufferVertexShader,
  fragmentShader: commonShader + bufferCFragment,
  glslVersion: THREE.GLSL3
});

const bufferDMaterial = new THREE.ShaderMaterial({
  uniforms: { iChannel0:{value:null}, iChannel1:{value:null}, iTime:{value:0}, iFrame:{value:0} },
  vertexShader: bufferVertexShader,
  fragmentShader: commonShader + bufferDFragment,
  glslVersion: THREE.GLSL3
});

const mainMaterial = new THREE.ShaderMaterial({
  uniforms: {
    iChannel0:{value:null}, iChannel1:{value:null}, iChannel2:{value:null},
    iResolution:{value:new THREE.Vector2(window.innerWidth, window.innerHeight)},
    iTime:{value:0}, iFrame:{value:0}, iMouse:{value:new THREE.Vector4(0,0,0,0)},
    cellOpacity:{value:0.1}, edgeOpacity:{value:2.0}, edgeSharpness:{value:0.025}, edgeThickness:{value:0.004},
    showSitePoints:{value:1.0}, sitePointSize:{value:0.0085}, useSmoothEdges:{value:1.0}, useTemporalDither:{value:1.0}, ditherScale:{value:2.0},
    cubeSize:{value:0.30}, autoRotate:{value:1.0}, rotateSpeed:{value:0.25}, zoom:{value:2.5}, usePeriodicBoundaries:{value:0.0},
    baseColor:{value:new THREE.Vector3(0.204,0.380,0.596)}, useRandomColors:{value:0.0}, useSizeBasedColor:{value:1.0},
    iActiveSites:{value:1200}, useVoxelGrid:{value:0.0}  // Start with brute-force until voxel grid ready
  },
  vertexShader: mainVertex,
  fragmentShader: commonShader + mainFragment,
  glslVersion: THREE.GLSL3
});

// Geometry/quads
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2,2), mainMaterial);
scene.add(quad);
const sceneA = new THREE.Scene(); sceneA.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), bufferAMaterial));
const sceneB = new THREE.Scene(); sceneB.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), bufferBMaterial));
const sceneC = new THREE.Scene(); sceneC.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), bufferCMaterial));
const sceneD = new THREE.Scene(); sceneD.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), bufferDMaterial));

// UI wiring
const ui = {
  sites: document.getElementById('sites'),
  sitesVal: document.getElementById('sitesVal'),
  cube: document.getElementById('cube'),
  cubeVal: document.getElementById('cubeVal'),
  zoom: document.getElementById('zoom'),
  zoomVal: document.getElementById('zoomVal'),
  cellOp: document.getElementById('cellOp'), cellOpVal: document.getElementById('cellOpVal'),
  edgeOp: document.getElementById('edgeOp'), edgeOpVal: document.getElementById('edgeOpVal'),
  edgeSharp: document.getElementById('edgeSharp'), edgeSharpVal: document.getElementById('edgeSharpVal'),
  edgeThick: document.getElementById('edgeThick'), edgeThickVal: document.getElementById('edgeThickVal'),
  showPoints: document.getElementById('showPoints'),
  periodic: document.getElementById('periodic'),
  // physics controls
  inv: document.getElementById('inv'),
  steer: document.getElementById('steer'), steerVal: document.getElementById('steerVal'),
  fric: document.getElementById('fric'), fricVal: document.getElementById('fricVal'),
  minSpd: document.getElementById('minSpd'), minSpdVal: document.getElementById('minSpdVal'),
  maxSpd: document.getElementById('maxSpd'), maxSpdVal: document.getElementById('maxSpdVal'),
  minRad: document.getElementById('minRad'), minRadVal: document.getElementById('minRadVal'),
  rep: document.getElementById('rep'), repVal: document.getElementById('repVal'),
  moveF: document.getElementById('moveF'), moveFVal: document.getElementById('moveFVal'),
  // visuals
  autoRotate: document.getElementById('autoRotate'),
  resetRotation: document.getElementById('resetRotation'),
  pauseAnimation: document.getElementById('pauseAnimation'),
  ditherScale: document.getElementById('ditherScale'), ditherScaleVal: document.getElementById('ditherScaleVal'),
  baseColor: document.getElementById('baseColor'), baseColorValue: document.getElementById('baseColorValue'),
  sizeBasedColor: document.getElementById('sizeBasedColor')
};

ui.sites.addEventListener('input', () => { 
  ui.sitesVal.textContent = ui.sites.value; 
  const n=parseInt(ui.sites.value); 
  bufferAMaterial.uniforms.iActiveSites.value=n; 
  bufferBMaterial.uniforms.iActiveSites.value=n; 
  bufferCMaterial.uniforms.iActiveSites.value=n; 
  mainMaterial.uniforms.iActiveSites.value=n;
  frame = 0;  // Reset to rebuild voxel grid
  // Rebuild voxel grid immediately to avoid transient large-cell artifacts
  (function rebuildVoxelGrid(iterations=8){
    bufferBMaterial.uniforms.iChannel0.value = (pingA===0? rtA1:rtA2).texture; // latest A
    for (let i=0; i<iterations; i++) {
      bufferBMaterial.uniforms.iFrame.value = i;
      const readB = (i % 2 === 0) ? rtB2 : rtB1;
      const writeB = (i % 2 === 0) ? rtB1 : rtB2;
      bufferBMaterial.uniforms.iChannel1.value = readB.texture;
      renderer.setRenderTarget(writeB);
      renderer.render(sceneB, orthoCamera);
    }
    renderer.setRenderTarget(null);
  })();
});
ui.cube.addEventListener('input', () => {
  const v = parseFloat(ui.cube.value); ui.cubeVal.textContent = v.toFixed(2);
  bufferAMaterial.uniforms.cubeSize.value = v;
  bufferBMaterial.uniforms.cubeSize.value = v;
  bufferCMaterial.uniforms.cubeSize.value = v;
  mainMaterial.uniforms.cubeSize.value = v;
});
ui.zoom.addEventListener('input', () => { const v = parseFloat(ui.zoom.value); ui.zoomVal.textContent = v.toFixed(1); mainMaterial.uniforms.zoom.value = v; });
ui.cellOp.addEventListener('input', () => { mainMaterial.uniforms.cellOpacity.value = parseFloat(ui.cellOp.value); ui.cellOpVal.textContent = ui.cellOp.value; });
ui.edgeOp.addEventListener('input', () => { mainMaterial.uniforms.edgeOpacity.value = parseFloat(ui.edgeOp.value); ui.edgeOpVal.textContent = ui.edgeOp.value; });
ui.edgeSharp.addEventListener('input', () => { mainMaterial.uniforms.edgeSharpness.value = parseFloat(ui.edgeSharp.value); ui.edgeSharpVal.textContent = ui.edgeSharp.value; });
ui.edgeThick.addEventListener('input', () => { mainMaterial.uniforms.edgeThickness.value = parseFloat(ui.edgeThick.value); ui.edgeThickVal.textContent = ui.edgeThick.value; });
ui.showPoints.addEventListener('change', () => { mainMaterial.uniforms.showSitePoints.value = ui.showPoints.checked ? 1.0 : 0.0; });
ui.periodic.addEventListener('change', () => {
  const v = ui.periodic.checked ? 1.0 : 0.0;
  bufferAMaterial.uniforms.usePeriodicBoundaries.value = v;
  bufferBMaterial.uniforms.usePeriodicBoundaries.value = v;
  bufferCMaterial.uniforms.usePeriodicBoundaries.value = v;
  mainMaterial.uniforms.usePeriodicBoundaries.value = v;
});

// Physics wiring
ui.inv.addEventListener('change', ()=>{ bufferAMaterial.uniforms.invertSteering.value = ui.inv.checked ? 1.0 : 0.0; });
ui.steer.addEventListener('input', ()=>{ const v=parseFloat(ui.steer.value); bufferAMaterial.uniforms.steeringStrength.value=v; ui.steerVal.textContent=v.toFixed(2); });
ui.fric.addEventListener('input', ()=>{ const v=parseFloat(ui.fric.value); bufferAMaterial.uniforms.friction.value=v; ui.fricVal.textContent=v.toFixed(3); });
ui.minSpd.addEventListener('input', ()=>{ const v=parseFloat(ui.minSpd.value); bufferAMaterial.uniforms.minSpeed.value=v; ui.minSpdVal.textContent=v.toFixed(4); });
ui.maxSpd.addEventListener('input', ()=>{ const v=parseFloat(ui.maxSpd.value); bufferAMaterial.uniforms.maxSpeed.value=v; ui.maxSpdVal.textContent=v.toFixed(4); });
ui.minRad.addEventListener('input', ()=>{ const v=parseFloat(ui.minRad.value); bufferAMaterial.uniforms.minRepulsionRadius.value=v; ui.minRadVal.textContent=v.toFixed(3); });
ui.rep.addEventListener('input', ()=>{ const v=parseFloat(ui.rep.value); bufferAMaterial.uniforms.repulsionStrength.value=v; ui.repVal.textContent=v.toFixed(3); });
ui.moveF.addEventListener('input', ()=>{ const v=parseFloat(ui.moveF.value); bufferAMaterial.uniforms.movementFactor.value=v; ui.moveFVal.textContent=v.toFixed(4); });

// Visual wiring
ui.autoRotate.addEventListener('change', ()=>{ mainMaterial.uniforms.autoRotate.value = ui.autoRotate.checked ? 1.0 : 0.0; });
ui.resetRotation.addEventListener('click', ()=>{ const im = mainMaterial.uniforms.iMouse.value; im.set(window.innerWidth*0.5, window.innerHeight*0.5, 0, 0); });
let isPaused=false; ui.pauseAnimation.addEventListener('click', (e)=>{ isPaused=!isPaused; e.target.textContent=isPaused?'Resume':'Pause'; });
ui.ditherScale.addEventListener('input', ()=>{ const v=parseFloat(ui.ditherScale.value); mainMaterial.uniforms.ditherScale.value=v; ui.ditherScaleVal.textContent=v.toFixed(1); });
ui.baseColor.addEventListener('input', (e)=>{ const hex=e.target.value; const r=parseInt(hex.slice(1,3),16)/255; const g=parseInt(hex.slice(3,5),16)/255; const b=parseInt(hex.slice(5,7),16)/255; mainMaterial.uniforms.baseColor.value.set(r,g,b); ui.baseColorValue.textContent=hex.toUpperCase(); });
ui.sizeBasedColor.addEventListener('change', ()=>{ mainMaterial.uniforms.useSizeBasedColor.value = ui.sizeBasedColor.checked ? 1.0 : 0.0; });

// Mouse rotate
let dragging=false, mx=0, my=0; const im = mainMaterial.uniforms.iMouse.value;
renderer.domElement.addEventListener('mousedown', (e)=>{ dragging=true; mx=e.clientX; my=e.clientY; im.z=1; });
renderer.domElement.addEventListener('mousemove', (e)=>{ if(!dragging) return; const dx=(e.clientX-mx)*0.01, dy=(e.clientY-my)*0.01; im.x += dx*100; im.y += dy*100; mx=e.clientX; my=e.clientY; });
renderer.domElement.addEventListener('mouseup', ()=>{ dragging=false; im.z=0; im.w=1; });

// Init
// Initialize Buffer A with initial positions
bufferAMaterial.uniforms.iFrame.value = 0;
bufferAMaterial.uniforms.iTime.value = 0;
renderer.setRenderTarget(rtA1); 
renderer.render(sceneA, orthoCamera);
renderer.setRenderTarget(rtA2); 
renderer.render(sceneA, orthoCamera);

// Initialize and warm-up Buffer B (voxel grid)
bufferBMaterial.uniforms.iChannel0.value = rtA1.texture;
bufferBMaterial.uniforms.iChannel1.value = rtB2.texture;
// Warm-up with proper ping-pong
for (let i=0; i<8; i++) {
  bufferBMaterial.uniforms.iFrame.value = i;
  const readB = (i % 2 === 0) ? rtB2 : rtB1;
  const writeB = (i % 2 === 0) ? rtB1 : rtB2;
  bufferBMaterial.uniforms.iChannel1.value = readB.texture;
  renderer.setRenderTarget(writeB); 
  renderer.render(sceneB, orthoCamera);
}

// C/D ping-pong init
bufferCMaterial.uniforms.iChannel0.value = rtC2.texture; // previous C
bufferCMaterial.uniforms.iChannel1.value = rtA1.texture;  // positions
bufferCMaterial.uniforms.iChannel2.value = rtB1.texture; // voxel owners
renderer.setRenderTarget(rtC1); renderer.render(sceneC, orthoCamera);
renderer.setRenderTarget(rtC2); renderer.render(sceneC, orthoCamera);

bufferDMaterial.uniforms.iChannel0.value = rtC2.texture; // raw
bufferDMaterial.uniforms.iChannel1.value = rtD2.texture; // prev state
renderer.setRenderTarget(rtD1); renderer.render(sceneD, orthoCamera);
renderer.setRenderTarget(rtD2); renderer.render(sceneD, orthoCamera);

renderer.setRenderTarget(null);

// Main mesh uses A/B/C
const plane = quad; // already added

// Animate
const clock = new THREE.Clock();
let frame=0;  // Moved to outer scope for event listener access
function animate(){
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  if (isPaused) { // freeze time for A/D simulation
    // keep time constant for simulation, still allow auto-rotate via iTime below
  }

  // A ping-pong (needs prev A, D state, B owners)
  const readA = pingA===0? rtA2:rtA1; const writeA = pingA===0? rtA1:rtA2; pingA = 1 - pingA;
  bufferAMaterial.uniforms.iTime.value = t;
  bufferAMaterial.uniforms.iFrame.value = frame;
  bufferAMaterial.uniforms.iChannel0.value = readA.texture;
  bufferAMaterial.uniforms.iChannel1.value = (pingD===0? rtD1:rtD2).texture; // latest state
  bufferAMaterial.uniforms.iChannel2.value = (pingB===0? rtB1:rtB2).texture;  // latest owners
  renderer.setRenderTarget(writeA); renderer.render(sceneA, orthoCamera);

  // B ping-pong
  const readB = pingB===0? rtB2:rtB1; const writeB = pingB===0? rtB1:rtB2; pingB = 1 - pingB;
  bufferBMaterial.uniforms.iChannel0.value = writeA.texture;
  bufferBMaterial.uniforms.iChannel1.value = readB.texture;
  bufferBMaterial.uniforms.iFrame.value = frame;
  renderer.setRenderTarget(writeB); renderer.render(sceneB, orthoCamera);

  // C ping-pong
  const readC = pingC===0? rtC2:rtC1; const writeC = pingC===0? rtC1:rtC2; pingC = 1 - pingC;
  bufferCMaterial.uniforms.iChannel0.value = readC.texture;
  bufferCMaterial.uniforms.iChannel1.value = writeA.texture;
  bufferCMaterial.uniforms.iChannel2.value = writeB.texture; // latest voxel owners
  bufferCMaterial.uniforms.iFrame.value = frame;
  renderer.setRenderTarget(writeC); renderer.render(sceneC, orthoCamera);

  // D ping-pong
  const readD = pingD===0? rtD2:rtD1; const writeD = pingD===0? rtD1:rtD2; pingD = 1 - pingD;
  bufferDMaterial.uniforms.iChannel0.value = writeC.texture; // raw steering
  bufferDMaterial.uniforms.iChannel1.value = readD.texture;   // prev state
  bufferDMaterial.uniforms.iTime.value = t;
  bufferDMaterial.uniforms.iFrame.value = frame;
  renderer.setRenderTarget(writeD); renderer.render(sceneD, orthoCamera);

  // Main
  mainMaterial.uniforms.iChannel0.value = writeA.texture;
  mainMaterial.uniforms.iChannel1.value = writeB.texture; // always read from the fresh write
  mainMaterial.uniforms.iChannel2.value = writeC.texture; // for debug lines
  mainMaterial.uniforms.iTime.value = t;
  mainMaterial.uniforms.iFrame.value = frame;
  // After a few frames, switch to voxel grid mode
  if (frame > 10) {
    mainMaterial.uniforms.useVoxelGrid.value = 1.0;
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
  mainMaterial.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);

  frame++;
}

animate();

window.addEventListener('resize', ()=>{
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  mainMaterial.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
});


