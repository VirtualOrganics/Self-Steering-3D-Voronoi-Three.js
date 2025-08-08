export const bufferAFragment = `
// Buffer A: Calculate and animate local space site positions
// Now supports both closed-box and periodic boundary conditions
precision highp float;

uniform float iTime;
uniform float iFrame;
uniform float movementSpeed;
uniform float movementScale;
uniform float activeSites;  // Number of sites actually in use (controlled by slider)
uniform float usePeriodicBoundaries;  // Toggle for periodic boundaries
uniform float cubeSize;  // Cube size from main uniforms

in vec2 vUv;
out vec4 fragColor;

vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return -1.0 + 2.0 * fract(vec3((p3.x + p3.y) * p3.z, (p3.x + p3.z) * p3.y, (p3.y + p3.z) * p3.x));
}

vec3 noise3D_vec(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    
    return mix(mix(mix(hash33(i + vec3(0,0,0)), hash33(i + vec3(1,0,0)), u.x),
                   mix(hash33(i + vec3(0,1,0)), hash33(i + vec3(1,1,0)), u.x), u.y),
               mix(mix(hash33(i + vec3(0,0,1)), hash33(i + vec3(1,0,1)), u.x),
                   mix(hash33(i + vec3(0,1,1)), hash33(i + vec3(1,1,1)), u.x), u.y), u.z);
}

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    int siteId = p.y * 224 + p.x;  // 224x224 texture for up to 50000 sites
    
    if (siteId >= int(activeSites)) {
        fragColor = vec4(0);
        return;
    }
    
    // Base position for each site (in [-1, 1] range)
    vec3 basePos = vec3(
        hash33(vec3(float(siteId), 0, 0)).x,
        hash33(vec3(0, float(siteId), 0)).y,
        hash33(vec3(0, 0, float(siteId))).z
    );
    
    // Animated movement - this can push particles beyond boundaries
    vec3 movement = noise3D_vec(basePos * 2.0 + vec3(iTime * movementSpeed));
    vec3 localPos = basePos + movement * movementScale;
    
    if (usePeriodicBoundaries < 0.5) {
        // --- ORIGINAL SOFT BOUNDARY LOGIC (CLOSED BOX) ---
        // Scale base position to stay within bounds
        localPos = basePos * 0.8 + movement * movementScale;
        
        float edgeDist = 0.85;
        float repelStrength = 2.0;
        
        if (abs(localPos.x) > edgeDist) {
            float excess = abs(localPos.x) - edgeDist;
            localPos.x *= max(0.0, 1.0 - excess * repelStrength);
        }
        if (abs(localPos.y) > edgeDist) {
            float excess = abs(localPos.y) - edgeDist;
            localPos.y *= max(0.0, 1.0 - excess * repelStrength);
        }
        if (abs(localPos.z) > edgeDist) {
            float excess = abs(localPos.z) - edgeDist;
            localPos.z *= max(0.0, 1.0 - excess * repelStrength);
        }
        
        localPos = clamp(localPos, -0.95, 0.95);
    }
    // For periodic mode, let particles move freely in the full [-1, 1] + movement range
    
    // Scale normalized position to world space (CRITICAL FIX from reference)
    vec3 worldPos = localPos * cubeSize;
    
    if (usePeriodicBoundaries > 0.5) {
        // --- NEW PERIODIC WRAPPING LOGIC ---
        // This wraps the particle's position around the cube's boundaries
        worldPos = mod(worldPos + cubeSize, 2.0 * cubeSize) - cubeSize;
    }
    
    fragColor = vec4(worldPos, float(siteId));
}
`; 