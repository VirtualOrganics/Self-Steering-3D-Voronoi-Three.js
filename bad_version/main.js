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

// Current settings
let currentNumSites = 100;
let needsBufferReset = false;

// Initialize buffers
let bufferA, bufferB1, bufferB2;

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
        numSites: { value: 100 }
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
        numSites: { value: 100 }
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
        
        // Control uniforms with original working defaults
        numSites: { value: 100 },
        cellOpacity: { value: 0.15 },      // Original value for proper transparency
        edgeOpacity: { value: 4.0 },       // Original value for white edges
        edgeSharpness: { value: 0.005 },   // Original sharpness
        edgeThickness: { value: 0.00785 }, // Original thickness
        showSitePoints: { value: 1.0 },
        sitePointSize: { value: 0.0075 },  // Original size
        useSmoothEdges: { value: 1.0 },
        useRandomColors: { value: 0.0 },
        useSizeBasedTone: { value: 1.0 },
        useTemporalDither: { value: 1.0 },
        ditherScale: { value: 4.0 },
        cubeSize: { value: 0.55 },
        autoRotate: { value: 1.0 },
        rotateSpeed: { value: 0.3 },
        baseColor: { value: new THREE.Vector3(0.247, 0.541, 0.953) },
        zoom: { value: 2.5 }
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

// Helper function to recreate buffers when site count changes
function recreateBuffers(numSites) {
    // Calculate texture size for Buffer A (sites)
    const siteTexSize = Math.ceil(Math.sqrt(numSites));
    
    // Dispose old buffers
    if (bufferA) {
        bufferA.dispose();
        bufferB1.dispose();
        bufferB2.dispose();
    }
    
    // Create new buffers with appropriate sizes
    const rtOptions = {
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        generateMipmaps: false
    };
    
    bufferA = new THREE.WebGLRenderTarget(siteTexSize, siteTexSize, rtOptions);
    bufferB1 = new THREE.WebGLRenderTarget(512, 512, rtOptions);
    bufferB2 = new THREE.WebGLRenderTarget(512, 512, rtOptions);
    
    bufferAMaterial.uniforms.numSites.value = numSites;
    bufferBMaterial.uniforms.numSites.value = numSites;
    mainMaterial.uniforms.numSites.value = numSites;
    
    currentNumSites = numSites;
    needsBufferReset = true;
    
    // Initialize the new buffers immediately
    initializeBuffers();
}

// Function to initialize buffers
function initializeBuffers() {
    if (!bufferA || !bufferB1 || !bufferB2) return;
    
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
}

// Initialize buffers with default size
recreateBuffers(100);

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
        mainMaterial.uniforms.iMouse.value.z = 1;
        mainMaterial.uniforms.iMouse.value.x = touches[0].clientX;
        mainMaterial.uniforms.iMouse.value.y = window.innerHeight - touches[0].clientY;
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
        // Handle rotation
        mainMaterial.uniforms.iMouse.value.x = touches[0].clientX;
        mainMaterial.uniforms.iMouse.value.y = window.innerHeight - touches[0].clientY;
    }
});

renderer.domElement.addEventListener('touchend', (e) => {
    e.preventDefault();
    touches = Array.from(e.touches);
    
    if (touches.length === 0) {
        // End all gestures
        mainMaterial.uniforms.iMouse.value.z = 0;
        currentZoom = mainMaterial.uniforms.zoom.value;
    } else if (touches.length === 1) {
        // Switching from pinch to rotate
        mainMaterial.uniforms.iMouse.value.z = 1;
        mainMaterial.uniforms.iMouse.value.x = touches[0].clientX;
        mainMaterial.uniforms.iMouse.value.y = window.innerHeight - touches[0].clientY;
        currentZoom = mainMaterial.uniforms.zoom.value;
    }
});

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
document.getElementById('numSites').addEventListener('input', (e) => {
    const numSites = parseInt(e.target.value);
    document.getElementById('numSitesValue').textContent = numSites;
    document.getElementById('numSitesInput').value = numSites;
    if (numSites !== currentNumSites) {
        recreateBuffers(numSites);
    }
});

// Add handler for number input
document.getElementById('numSitesInput').addEventListener('change', (e) => {
    const numSites = parseInt(e.target.value);
    if (numSites >= 10 && numSites <= 50000) {
        document.getElementById('numSitesValue').textContent = numSites;
        // Update slider if within range
        if (numSites <= 5000) {
            document.getElementById('numSites').value = numSites;
        }
        if (numSites !== currentNumSites) {
            console.log(`Changing number of sites to ${numSites}`);
            recreateBuffers(numSites);
        }
    }
});

document.getElementById('autoRotate').addEventListener('change', (e) => {
    mainMaterial.uniforms.autoRotate.value = e.target.checked ? 1.0 : 0.0;
});

document.getElementById('resetRotation').addEventListener('click', () => {
    mainMaterial.uniforms.iMouse.value.set(0, 0, 0, 0);
});

document.getElementById('zoom').addEventListener('input', (e) => {
    const zoom = parseFloat(e.target.value);
    mainMaterial.uniforms.zoom.value = zoom;
    currentZoom = zoom;
    document.getElementById('zoomValue').textContent = zoom.toFixed(1);
});

document.getElementById('cubeSize').addEventListener('input', (e) => {
    mainMaterial.uniforms.cubeSize.value = parseFloat(e.target.value);
    document.getElementById('cubeSizeValue').textContent = e.target.value;
});

// Color controls
document.getElementById('randomColors').addEventListener('change', (e) => {
    const useRandom = e.target.checked;
    mainMaterial.uniforms.useRandomColors.value = useRandom ? 1.0 : 0.0;
    
    // Enable/disable related controls
    document.getElementById('baseColorPicker').disabled = useRandom;
    document.getElementById('sizeBasedTone').disabled = useRandom;
    document.getElementById('toneVariationGroup').style.opacity = useRandom ? '0.4' : '0.8';
});

document.getElementById('baseColorPicker').addEventListener('input', (e) => {
    const color = e.target.value;
    document.getElementById('baseColorValue').textContent = color;
    
    // Convert hex to RGB
    const r = parseInt(color.substr(1, 2), 16) / 255;
    const g = parseInt(color.substr(3, 2), 16) / 255;
    const b = parseInt(color.substr(5, 2), 16) / 255;
    
    mainMaterial.uniforms.baseColor.value.set(r, g, b);
});

document.getElementById('sizeBasedTone').addEventListener('change', (e) => {
    mainMaterial.uniforms.useSizeBasedTone.value = e.target.checked ? 1.0 : 0.0;
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
    const show = e.target.checked;
    mainMaterial.uniforms.showSitePoints.value = show ? 1.0 : 0.0;
    
    // Enable/disable size control
    document.getElementById('sitePointSize').disabled = !show;
    document.getElementById('sitePointSizeGroup').style.opacity = show ? '0.8' : '0.4';
});

document.getElementById('smoothEdges').addEventListener('change', (e) => {
    mainMaterial.uniforms.useSmoothEdges.value = e.target.checked ? 1.0 : 0.0;
});

document.getElementById('temporalDither').addEventListener('change', (e) => {
    mainMaterial.uniforms.useTemporalDither.value = e.target.checked ? 1.0 : 0.0;
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
let frameCount = 0;
let fpsTime = 0;

function animate() {
    requestAnimationFrame(animate);
    
    const time = clock.getElapsedTime();
    const deltaTime = time - lastTime;
    lastTime = time;
    
    // FPS calculation
    frameCount++;
    fpsTime += deltaTime;
    if (fpsTime >= 1.0) {
        document.getElementById('fps').textContent = Math.round(frameCount / fpsTime);
        frameCount = 0;
        fpsTime = 0;
    }
    document.getElementById('frameCount').textContent = frame;
    
    // Reset frame counter if buffers were recreated
    if (needsBufferReset) {
        frame = 0;
        needsBufferReset = false;
        currentBufferB = 0;
    }
    
    // Make sure buffers exist before using them
    if (!bufferA || !bufferB1 || !bufferB2) {
        return;
    }
    
    // Update Buffer A (site positions)
    bufferAMaterial.uniforms.iTime.value = time;
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
    mainMaterial.uniforms.iChannel0.value = bufferA.texture;
    mainMaterial.uniforms.iChannel1.value = writeBuffer.texture;
    mainMaterial.uniforms.iTime.value = time;
    mainMaterial.uniforms.iFrame.value = frame;
    
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(scene, camera);
    
    frame++;
}

console.log('Starting animation loop...');
animate(); 