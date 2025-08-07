import * as THREE from 'three';
import { commonShader } from './shaders/common.js';
import { bufferAFragment } from './shaders/bufferA.js';
import { bufferBFragment } from './shaders/bufferB.js';
import { mainFragment, mainVertex } from './shaders/main.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 2.5;

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Clock for animation
const clock = new THREE.Clock();

// Render targets for buffers
const rtOptions = {
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter
};

// Buffer A: Site positions (10x10 texture for 100 sites)
const bufferA = new THREE.WebGLRenderTarget(10, 10, rtOptions);

// Buffer B: Voxel grid (512x512 for 64^3 voxels)
const bufferB = new THREE.WebGLRenderTarget(512, 512, rtOptions);

// Materials for each buffer
const bufferAMaterial = new THREE.ShaderMaterial({
    uniforms: {
        iTime: { value: 0 },
        iFrame: { value: 0 },
        movementSpeed: { value: 0.3 },
        movementScale: { value: 0.25 }
    },
    fragmentShader: commonShader + bufferAFragment,
    glslVersion: THREE.GLSL3
});

const bufferBMaterial = new THREE.ShaderMaterial({
    uniforms: {
        iChannel0: { value: null }, // Buffer A
        iChannel1: { value: null }, // Buffer B (itself)
        iFrame: { value: 0 }
    },
    fragmentShader: commonShader + bufferBFragment,
    glslVersion: THREE.GLSL3
});

// Main rendering material
const mainMaterial = new THREE.ShaderMaterial({
    uniforms: {
        iChannel0: { value: null }, // Buffer A
        iChannel1: { value: null }, // Buffer B
        iResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        iTime: { value: 0 },
        iFrame: { value: 0 },
        iMouse: { value: new THREE.Vector4(0, 0, 0, 0) },
        
        // Control uniforms
        cellOpacity: { value: 0.7 },
        edgeOpacity: { value: 0.9 },
        edgeSharpness: { value: 0.01 },
        edgeThickness: { value: 0.012 },
        showSitePoints: { value: 1.0 },
        sitePointSize: { value: 0.01 },
        useSmoothEdges: { value: 1.0 },
        useSizeBasedColor: { value: 0.0 },
        baseColor: { value: new THREE.Vector3(0.3, 0.6, 1.0) }
    },
    vertexShader: mainVertex,
    fragmentShader: commonShader + mainFragment,
    glslVersion: THREE.GLSL3
});

// Fullscreen quad for rendering
const geometry = new THREE.PlaneGeometry(2, 2);
const mesh = new THREE.Mesh(geometry, mainMaterial);
scene.add(mesh);

// Scenes for render targets
const bufferAScene = new THREE.Scene();
const bufferAQuad = new THREE.Mesh(geometry, bufferAMaterial);
bufferAScene.add(bufferAQuad);

const bufferBScene = new THREE.Scene();
const bufferBQuad = new THREE.Mesh(geometry, bufferBMaterial);
bufferBScene.add(bufferBQuad);

// Mouse interaction
let mouseDown = false;
let mouseX = 0, mouseY = 0;

renderer.domElement.addEventListener('mousedown', (e) => {
    mouseDown = true;
    mouseX = e.clientX;
    mouseY = e.clientY;
    mainMaterial.uniforms.iMouse.value.z = 1;
});

renderer.domElement.addEventListener('mousemove', (e) => {
    if (mouseDown) {
        mainMaterial.uniforms.iMouse.value.x = e.clientX;
        mainMaterial.uniforms.iMouse.value.y = window.innerHeight - e.clientY;
    }
});

renderer.domElement.addEventListener('mouseup', () => {
    mouseDown = false;
    mainMaterial.uniforms.iMouse.value.z = 0;
});

// Controls
document.getElementById('cellOpacity').addEventListener('input', (e) => {
    mainMaterial.uniforms.cellOpacity.value = parseFloat(e.target.value);
    document.getElementById('cellOpacityValue').textContent = e.target.value;
});

document.getElementById('movementSpeed').addEventListener('input', (e) => {
    bufferAMaterial.uniforms.movementSpeed.value = parseFloat(e.target.value);
    document.getElementById('movementSpeedValue').textContent = e.target.value;
});

document.getElementById('edgeSharpness').addEventListener('input', (e) => {
    mainMaterial.uniforms.edgeSharpness.value = parseFloat(e.target.value);
    document.getElementById('edgeSharpnessValue').textContent = e.target.value;
});

document.getElementById('showSitePoints').addEventListener('change', (e) => {
    mainMaterial.uniforms.showSitePoints.value = e.target.checked ? 1.0 : 0.0;
});

document.getElementById('smoothEdges').addEventListener('change', (e) => {
    mainMaterial.uniforms.useSmoothEdges.value = e.target.checked ? 1.0 : 0.0;
});

document.getElementById('sizeBasedColor').addEventListener('change', (e) => {
    mainMaterial.uniforms.useSizeBasedColor.value = e.target.checked ? 1.0 : 0.0;
});

// Window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    mainMaterial.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
});

// Animation loop
let frame = 0;
function animate() {
    requestAnimationFrame(animate);
    
    const time = clock.getElapsedTime();
    
    // Update Buffer A (site positions)
    bufferAMaterial.uniforms.iTime.value = time;
    bufferAMaterial.uniforms.iFrame.value = frame;
    
    renderer.setRenderTarget(bufferA);
    renderer.render(bufferAScene, camera);
    
    // Update Buffer B (voxel grid)
    bufferBMaterial.uniforms.iChannel0.value = bufferA.texture;
    bufferBMaterial.uniforms.iChannel1.value = bufferB.texture;
    bufferBMaterial.uniforms.iFrame.value = frame;
    
    renderer.setRenderTarget(bufferB);
    renderer.render(bufferBScene, camera);
    
    // Main render
    mainMaterial.uniforms.iChannel0.value = bufferA.texture;
    mainMaterial.uniforms.iChannel1.value = bufferB.texture;
    mainMaterial.uniforms.iTime.value = time;
    mainMaterial.uniforms.iFrame.value = frame;
    
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    
    frame++;
}

animate(); 