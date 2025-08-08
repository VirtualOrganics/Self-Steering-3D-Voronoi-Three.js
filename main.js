import * as THREE from 'three';
import { commonShader } from './shaders/common.js';
import { bufferAFragment } from './shaders/bufferA.js';
import { bufferBFragment } from './shaders/bufferB.js';
import { mainFragment, mainVertex } from './shaders/main.js';

// Debug logging
console.log('Starting 3D Voronoi Renderer...');

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 2.5;

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
// Enable float textures
renderer.capabilities.isWebGL2 = true;
document.body.appendChild(renderer.domElement);

// Orthographic camera for buffer rendering
const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// Clock for animation
const clock = new THREE.Clock();
let lastTime = 0;

// Render targets for buffers - using float type for proper data storage
const rtOptions = {
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    generateMipmaps: false
};

// Buffer A: Site positions (224x224 texture for up to 50000 sites)
const bufferA = new THREE.WebGLRenderTarget(224, 224, rtOptions);
bufferA.texture.needsUpdate = true;

// Buffer B: Voxel grid - we need TWO for ping-ponging to avoid feedback loop
const bufferB1 = new THREE.WebGLRenderTarget(512, 512, rtOptions);
const bufferB2 = new THREE.WebGLRenderTarget(512, 512, rtOptions);
bufferB1.texture.needsUpdate = true;
bufferB2.texture.needsUpdate = true;

// Track which buffer B is current
let currentBufferB = 0;

// Simple passthrough vertex shader for buffers
const bufferVertexShader = `
out vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Materials for each buffer
const bufferAMaterial = new THREE.ShaderMaterial({
    uniforms: {
        iTime: { value: 0 },
        iFrame: { value: 0 },
        movementSpeed: { value: 0.6 },
        movementScale: { value: 0.2 },
        activeSites: { value: 4000 },  // Default 4000 sites
        usePeriodicBoundaries: { value: 1.0 },  // Default on
        cubeSize: { value: 0.55 }  // Match default cube size
    },
    vertexShader: bufferVertexShader,
    fragmentShader: commonShader + bufferAFragment,
    glslVersion: THREE.GLSL3
});

const bufferBMaterial = new THREE.ShaderMaterial({
    uniforms: {
        iChannel0: { value: null }, // Buffer A
        iChannel1: { value: null }, // Previous Buffer B
        iFrame: { value: 0 },
        activeSites: { value: 4000 },  // Default 4000 sites
        usePeriodicBoundaries: { value: 1.0 },  // Default on
        cubeSize: { value: 0.55 }  // Match default cube size
    },
    vertexShader: bufferVertexShader,
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
        
        // Control uniforms with user-specified defaults
        cellOpacity: { value: 0.25 },
        edgeOpacity: { value: 4.3 },
        edgeSharpness: { value: 0.005 },
        edgeThickness: { value: 0.0075 },
        showSitePoints: { value: 1.0 },
        sitePointSize: { value: 0.006 },
        useSmoothEdges: { value: 1.0 },
        useSizeBasedColor: { value: 1.0 },
        useTemporalDither: { value: 1.0 },
        ditherScale: { value: 1.3 },
        cubeSize: { value: 0.55 },
        autoRotate: { value: 1.0 },
        rotateSpeed: { value: 0.3 },
        baseColor: { value: new THREE.Vector3(0.204, 0.380, 0.596) },  // #346198 in RGB
        useRandomColors: { value: 0.0 },  // Random colors OFF
        zoom: { value: 3.3 },  // Default zoom 3.3
        usePeriodicBoundaries: { value: 1.0 }  // Default on
    },
    vertexShader: mainVertex,
    fragmentShader: commonShader + mainFragment,
    glslVersion: THREE.GLSL3,
    depthTest: false,
    depthWrite: false
});

// Check shader compilation
bufferAMaterial.onBeforeCompile = (shader) => {
    console.log('Buffer A shader compiled');
};

bufferBMaterial.onBeforeCompile = (shader) => {
    console.log('Buffer B shader compiled');
};

mainMaterial.onBeforeCompile = (shader) => {
    console.log('Main shader compiled');
};

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
let currentRotationX = 0;  // Persistent rotation angle horizontal
let currentRotationY = 0;  // Persistent rotation angle vertical
let isPaused = false;  // Animation pause state

// Touch handling for pinch-to-zoom
let touches = [];
let initialPinchDistance = 0;
let currentZoom = 2.5;

function getTouchDistance(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

renderer.domElement.addEventListener('touchstart', (e) => {
    e.preventDefault();
    touches = Array.from(e.touches);
    
    if (touches.length === 2) {
        // Start pinch gesture
        initialPinchDistance = getTouchDistance(touches[0], touches[1]);
    } else if (touches.length === 1) {
        // Start rotation
        mouseX = touches[0].clientX;
        mouseY = touches[0].clientY;
        mainMaterial.uniforms.iMouse.value.z = 1;
    }
});

renderer.domElement.addEventListener('touchmove', (e) => {
    e.preventDefault();
    touches = Array.from(e.touches);
    
    if (touches.length === 2) {
        // Handle pinch-to-zoom
        const currentDistance = getTouchDistance(touches[0], touches[1]);
        const scale = currentDistance / initialPinchDistance;
        
        const newZoom = Math.max(1.0, Math.min(5.0, currentZoom * scale));
        mainMaterial.uniforms.zoom.value = newZoom;
        document.getElementById('zoom').value = newZoom;
        document.getElementById('zoomValue').textContent = newZoom.toFixed(1);
    } else if (touches.length === 1 && mainMaterial.uniforms.iMouse.value.z > 0) {
        // Handle rotation with persistent angles
        const deltaX = (touches[0].clientX - mouseX) * 0.01;
        const deltaY = (touches[0].clientY - mouseY) * 0.01;
        currentRotationX += deltaX;
        currentRotationY = Math.max(-1.4, Math.min(1.4, currentRotationY + deltaY));
        
        mainMaterial.uniforms.iMouse.value.x = currentRotationX * 100 + window.innerWidth * 0.5;
        mainMaterial.uniforms.iMouse.value.y = currentRotationY * 100 + window.innerHeight * 0.5;
        
        mouseX = touches[0].clientX;
        mouseY = touches[0].clientY;
    }
});

renderer.domElement.addEventListener('touchend', (e) => {
    e.preventDefault();
    touches = Array.from(e.touches);
    
    if (touches.length === 0) {
        // End all gestures but keep rotation values
        mainMaterial.uniforms.iMouse.value.z = 0;
        mainMaterial.uniforms.iMouse.value.w = 1; // Signal to keep position
        currentZoom = mainMaterial.uniforms.zoom.value;
    } else if (touches.length === 1) {
        // Switching from pinch to rotate
        mouseX = touches[0].clientX;
        mouseY = touches[0].clientY;
        mainMaterial.uniforms.iMouse.value.z = 1;
        currentZoom = mainMaterial.uniforms.zoom.value;
    }
});

// Mouse events
renderer.domElement.addEventListener('mousedown', (e) => {
    mouseDown = true;
    mouseX = e.clientX;
    mouseY = e.clientY;
    mainMaterial.uniforms.iMouse.value.z = 1;
});

renderer.domElement.addEventListener('mousemove', (e) => {
    if (mouseDown) {
        const deltaX = (e.clientX - mouseX) * 0.01;
        const deltaY = (e.clientY - mouseY) * 0.01;
        currentRotationX += deltaX;
        currentRotationY = Math.max(-1.4, Math.min(1.4, currentRotationY + deltaY));
        
        // Convert rotation angles to pixel coordinates for shader
        mainMaterial.uniforms.iMouse.value.x = currentRotationX * 100 + window.innerWidth * 0.5;
        mainMaterial.uniforms.iMouse.value.y = currentRotationY * 100 + window.innerHeight * 0.5;
        
        mouseX = e.clientX;
        mouseY = e.clientY;
    }
});

renderer.domElement.addEventListener('mouseup', () => {
    mouseDown = false;
    // Keep rotation values but signal mouse released
    mainMaterial.uniforms.iMouse.value.z = 0;
    mainMaterial.uniforms.iMouse.value.w = 1; // Signal to keep position
});

// Mouse wheel for zoom
renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY * -0.001;
    
    const newZoom = Math.max(1.0, Math.min(5.0, mainMaterial.uniforms.zoom.value + delta));
    mainMaterial.uniforms.zoom.value = newZoom;
    currentZoom = newZoom;
    document.getElementById('zoom').value = newZoom;
    document.getElementById('zoomValue').textContent = newZoom.toFixed(1);
});

// Controls
document.getElementById('autoRotate').addEventListener('change', (e) => {
    mainMaterial.uniforms.autoRotate.value = e.target.checked ? 1.0 : 0.0;
    if (!e.target.checked && mainMaterial.uniforms.iMouse.value.w > 0) {
        // Keep current rotation when disabling auto-rotate
        mainMaterial.uniforms.iMouse.value.x = currentRotationX * 100 + window.innerWidth * 0.5;
        mainMaterial.uniforms.iMouse.value.y = currentRotationY * 100 + window.innerHeight * 0.5;
    }
});

document.getElementById('resetRotation').addEventListener('click', () => {
    currentRotationX = 0;
    currentRotationY = 0;
    mainMaterial.uniforms.iMouse.value.set(window.innerWidth * 0.5, window.innerHeight * 0.5, 0, 0);
});

// Pause button
document.getElementById('pauseAnimation').addEventListener('click', (e) => {
    isPaused = !isPaused;
    e.target.textContent = isPaused ? 'Resume' : 'Pause';
});

// Zoom slider
document.getElementById('zoom').addEventListener('input', (e) => {
    const zoomValue = parseFloat(e.target.value);
    mainMaterial.uniforms.zoom.value = zoomValue;
    currentZoom = zoomValue;
    document.getElementById('zoomValue').textContent = zoomValue.toFixed(1);
});

document.getElementById('cubeSize').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    mainMaterial.uniforms.cubeSize.value = value;
    bufferAMaterial.uniforms.cubeSize.value = value;  // Update Buffer A too
    bufferBMaterial.uniforms.cubeSize.value = value;  // Update Buffer B too
    document.getElementById('cubeSizeValue').textContent = e.target.value;
    // Reset frame to trigger buffer update
    frame = 0;
});

document.getElementById('cellOpacity').addEventListener('input', (e) => {
    mainMaterial.uniforms.cellOpacity.value = parseFloat(e.target.value);
    document.getElementById('cellOpacityValue').textContent = e.target.value;
});

document.getElementById('edgeOpacity').addEventListener('input', (e) => {
    mainMaterial.uniforms.edgeOpacity.value = parseFloat(e.target.value);
    document.getElementById('edgeOpacityValue').textContent = e.target.value;
});

document.getElementById('movementSpeed').addEventListener('input', (e) => {
    bufferAMaterial.uniforms.movementSpeed.value = parseFloat(e.target.value);
    document.getElementById('movementSpeedValue').textContent = e.target.value;
});

document.getElementById('movementScale').addEventListener('input', (e) => {
    bufferAMaterial.uniforms.movementScale.value = parseFloat(e.target.value);
    document.getElementById('movementScaleValue').textContent = e.target.value;
});

document.getElementById('edgeSharpness').addEventListener('input', (e) => {
    mainMaterial.uniforms.edgeSharpness.value = parseFloat(e.target.value);
    document.getElementById('edgeSharpnessValue').textContent = e.target.value;
});

document.getElementById('edgeThickness').addEventListener('input', (e) => {
    mainMaterial.uniforms.edgeThickness.value = parseFloat(e.target.value);
    document.getElementById('edgeThicknessValue').textContent = e.target.value;
});

document.getElementById('sitePointSize').addEventListener('input', (e) => {
    mainMaterial.uniforms.sitePointSize.value = parseFloat(e.target.value);
    document.getElementById('sitePointSizeValue').textContent = e.target.value;
});

document.getElementById('ditherScale').addEventListener('input', (e) => {
    mainMaterial.uniforms.ditherScale.value = parseFloat(e.target.value);
    document.getElementById('ditherScaleValue').textContent = e.target.value;
});

document.getElementById('showSitePoints').addEventListener('change', (e) => {
    mainMaterial.uniforms.showSitePoints.value = e.target.checked ? 1.0 : 0.0;
});

document.getElementById('smoothEdges').addEventListener('change', (e) => {
    mainMaterial.uniforms.useSmoothEdges.value = e.target.checked ? 1.0 : 0.0;
});

document.getElementById('temporalDither').addEventListener('change', (e) => {
    mainMaterial.uniforms.useTemporalDither.value = e.target.checked ? 1.0 : 0.0;
});

document.getElementById('sizeBasedColor').addEventListener('change', (e) => {
    mainMaterial.uniforms.useSizeBasedColor.value = e.target.checked ? 1.0 : 0.0;
});

// Periodic boundaries toggle
document.getElementById('periodicBoundaries').addEventListener('change', (e) => {
    const value = e.target.checked ? 1.0 : 0.0;
    mainMaterial.uniforms.usePeriodicBoundaries.value = value;
    bufferAMaterial.uniforms.usePeriodicBoundaries.value = value;
    bufferBMaterial.uniforms.usePeriodicBoundaries.value = value;
    
    // Reset frame to trigger buffer update
    frame = 0;
});

// Random colors toggle
document.getElementById('randomColors').addEventListener('change', (e) => {
    mainMaterial.uniforms.useRandomColors.value = e.target.checked ? 1.0 : 0.0;
});

// Base color picker
document.getElementById('baseColor').addEventListener('input', (e) => {
    const hex = e.target.value;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    mainMaterial.uniforms.baseColor.value.set(r, g, b);
});

// Number of Sites control
document.getElementById('numSites').addEventListener('input', (e) => {
    const numSites = parseInt(e.target.value);
    document.getElementById('numSitesValue').textContent = numSites;
    document.getElementById('numSitesInput').value = numSites;
    
    // Update uniforms
    bufferAMaterial.uniforms.activeSites.value = numSites;
    bufferBMaterial.uniforms.activeSites.value = numSites;
    
    // Reset frame to trigger buffer update
    frame = 0;
});

document.getElementById('numSitesInput').addEventListener('change', (e) => {
    const numSites = Math.min(50000, Math.max(10, parseInt(e.target.value) || 4000));
    e.target.value = numSites;
    document.getElementById('numSites').value = numSites;
    document.getElementById('numSitesValue').textContent = numSites;
    
    // Update uniforms
    bufferAMaterial.uniforms.activeSites.value = numSites;
    bufferBMaterial.uniforms.activeSites.value = numSites;
    
    // Reset frame to trigger buffer update
    frame = 0;
});

// Window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    mainMaterial.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
});

// Animation loop
let frame = 0;  // Moved to this scope so event listeners can access it
let frameCount = 0;
let fpsTime = 0;
let animationTime = 0;  // Time for animation (affected by pause)
let lastAnimationTime = 0;

function animate() {
    requestAnimationFrame(animate);
    
    const currentTime = clock.getElapsedTime();
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;
    
    // Update animation time (only when not paused)
    if (!isPaused) {
        animationTime += deltaTime;
    }
    
    // FPS calculation
    frameCount++;
    fpsTime += deltaTime;
    if (fpsTime >= 1.0) {
        document.getElementById('fps').textContent = Math.round(frameCount / fpsTime);
        frameCount = 0;
        fpsTime = 0;
    }
    document.getElementById('frameCount').textContent = frame;
    
    // Update Buffer A (site positions) - use animationTime for movement
    bufferAMaterial.uniforms.iTime.value = animationTime;
    bufferAMaterial.uniforms.iFrame.value = frame;
    
    renderer.setRenderTarget(bufferA);
    renderer.clear();
    renderer.render(bufferAScene, orthoCamera);
    
    // Update Buffer B (voxel grid) with ping-pong to avoid feedback loop
    // Read from one buffer, write to the other
    const readBuffer = currentBufferB === 0 ? bufferB2 : bufferB1;
    const writeBuffer = currentBufferB === 0 ? bufferB1 : bufferB2;
    
    bufferBMaterial.uniforms.iChannel0.value = bufferA.texture;
    bufferBMaterial.uniforms.iChannel1.value = readBuffer.texture;
    bufferBMaterial.uniforms.iFrame.value = frame;
    
    renderer.setRenderTarget(writeBuffer);
    renderer.clear();
    renderer.render(bufferBScene, orthoCamera);
    
    // Swap buffers for next frame
    currentBufferB = 1 - currentBufferB;
    
    // Debug: Check if buffers have data
    if (frame === 0 || frame === 10) {
        console.log(`Frame ${frame}: BufferA texture:`, bufferA.texture);
        console.log(`Frame ${frame}: BufferB texture:`, writeBuffer.texture);
    }
    
    // Main render - use the buffer we just wrote to
    // Use currentTime for rotation (not affected by pause)
    mainMaterial.uniforms.iChannel0.value = bufferA.texture;
    mainMaterial.uniforms.iChannel1.value = writeBuffer.texture;
    mainMaterial.uniforms.iTime.value = currentTime;  // Use real time for rotation
    mainMaterial.uniforms.iFrame.value = frame;
    
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(scene, camera);
    
    frame++;
}

// Initialize buffers before starting animation
console.log('Initializing buffers...');

// Initialize Buffer A
renderer.setRenderTarget(bufferA);
renderer.clear();
renderer.render(bufferAScene, orthoCamera);

// Initialize both Buffer B ping-pong targets
// First render to bufferB1
bufferBMaterial.uniforms.iChannel0.value = bufferA.texture;
bufferBMaterial.uniforms.iChannel1.value = bufferB2.texture; // Initially empty
bufferBMaterial.uniforms.iFrame.value = 0;

renderer.setRenderTarget(bufferB1);
renderer.clear();
renderer.render(bufferBScene, orthoCamera);

// Then copy to bufferB2 for consistency
renderer.setRenderTarget(bufferB2);
renderer.clear();
renderer.render(bufferBScene, orthoCamera);

renderer.setRenderTarget(null);

console.log('Starting animation loop...');
animate(); 