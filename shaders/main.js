export const mainVertex = `
out vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}
`;

export const mainFragment = `
// Main renderer: Raymarching through voxel grid with dithered transparency
precision highp float;

uniform sampler2D iChannel0;  // Buffer A (site positions)
uniform sampler2D iChannel1;  // Buffer B (voxel grid)
uniform vec2 iResolution;
uniform float iTime;
uniform float iFrame;
uniform vec4 iMouse;

// Control uniforms
uniform float cellOpacity;
uniform float edgeOpacity;
uniform float edgeSharpness;
uniform float edgeThickness;
uniform float showSitePoints;
uniform float sitePointSize;
uniform float useSmoothEdges;
uniform float useSizeBasedColor;
uniform float useTemporalDither;
uniform float ditherScale;
uniform float cubeSize;
uniform float autoRotate;
uniform float rotateSpeed;
uniform vec3 baseColor;
uniform float useRandomColors;  // Added for random colors toggle
uniform float zoom;  // Added for zoom control
uniform float usePeriodicBoundaries;  // Toggle for periodic boundaries

in vec2 vUv;
out vec4 fragColor;

// Custom dither with scale
float bayerDither(vec2 pos, float scale) {
    mat4 bayerMatrix = mat4(
        0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,
        12.0/16.0, 4.0/16.0, 14.0/16.0,  6.0/16.0,
        3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0,
        15.0/16.0, 7.0/16.0, 13.0/16.0,  5.0/16.0
    );
    ivec2 p = ivec2(mod(pos * scale, 4.0));
    return bayerMatrix[p.x][p.y];
}

ivec4 getVoxelData(vec3 p, float cs) {
    ivec3 c = ivec3(floor((p/cs*0.5+0.5)*float(VOXEL_DIM)));
    return ivec4(texelFetch(iChannel1, to2D(clamp(c,0,VOXEL_DIM-1)), 0));
}

float getCellSize(vec3 p, vec3 p1, vec3 p2, vec3 p3, vec3 p4) {
    float d2 = periodic_dist(p1, p2, usePeriodicBoundaries, cubeSize);
    float d3 = periodic_dist(p1, p3, usePeriodicBoundaries, cubeSize);
    float d4 = periodic_dist(p1, p4, usePeriodicBoundaries, cubeSize);
    float avgDist = (d2 + d3 + d4) / 3.0;
    return clamp((avgDist - 0.1) / 0.4, 0.0, 1.0);
}

// Improved color generation with saturation boost
vec3 idToColor(int id) {
    if (useSizeBasedColor > 0.5) {
        // Use base color with size-based variation based on id
        float variation = fract(float(id) * 0.618);
        float tone = 0.5 + 0.5 * variation;
        return baseColor * tone;
    } else if (useRandomColors > 0.5) {
        // Use random colors per cell
        vec3 col = vec3(
            fract(sin(float(id) * 12.9898) * 43758.5453),
            fract(sin(float(id) * 78.233) * 43758.5453),
            fract(sin(float(id) * 45.164) * 43758.5453)
        );
        
        // Boost saturation
        float maxComp = max(col.r, max(col.g, col.b));
        float minComp = min(col.r, min(col.g, col.b));
        float sat = maxComp - minComp;
        
        if (sat < 0.3) {
            col = mix(vec3(0.5), col, 2.0);
        }
        
        col = pow(col, vec3(0.8));
        col = col * 0.8 + 0.2;
        
        return col;
    } else {
        // Use single base color for all cells
        return baseColor;
    }
}

float map(vec3 p, vec3 p1, vec3 p2, vec3 p3, vec3 p4) {
    float d12 = 0.5 * (periodic_dist(p, p1, usePeriodicBoundaries, cubeSize) - periodic_dist(p, p2, usePeriodicBoundaries, cubeSize));
    float d13 = 0.5 * (periodic_dist(p, p1, usePeriodicBoundaries, cubeSize) - periodic_dist(p, p3, usePeriodicBoundaries, cubeSize));
    float d14 = 0.5 * (periodic_dist(p, p1, usePeriodicBoundaries, cubeSize) - periodic_dist(p, p4, usePeriodicBoundaries, cubeSize));
    return max(d12, max(d13, d14));
}

float getEdgeWeight(vec3 p, vec3 p1, vec3 p2, vec3 p3, vec3 p4) {
    float d1 = periodic_dist(p, p1, usePeriodicBoundaries, cubeSize);
    float d2 = periodic_dist(p, p2, usePeriodicBoundaries, cubeSize);
    float d3 = periodic_dist(p, p3, usePeriodicBoundaries, cubeSize);
    float d4 = periodic_dist(p, p4, usePeriodicBoundaries, cubeSize);
    
    if (useSmoothEdges > 0.5) {
        float diff12 = abs(d1 - d2);
        float diff13 = abs(d1 - d3);
        
        float edge12_13 = (1.0 - smoothstep(0.003, edgeThickness, diff12)) * 
                          (1.0 - smoothstep(0.003, edgeThickness, diff13));
        float edge12_14 = (1.0 - smoothstep(0.003, edgeThickness, diff12)) * 
                          (1.0 - smoothstep(0.003, edgeThickness, abs(d1 - d4)));
        float edge13_14 = (1.0 - smoothstep(0.003, edgeThickness, diff13)) * 
                          (1.0 - smoothstep(0.003, edgeThickness, abs(d1 - d4)));
        
        return max(max(edge12_13, edge12_14), edge13_14);
    } else {
        float diff12 = abs(d1 - d2);
        float diff13 = abs(d1 - d3);
        
        bool isEdge = (diff12 < edgeThickness && diff13 < edgeThickness) ||
                      (diff12 < edgeThickness && abs(d1 - d4) < edgeThickness) ||
                      (diff13 < edgeThickness && abs(d1 - d4) < edgeThickness);
        return isEdge ? 1.0 : 0.0;
    }
}

vec3 getNormal(vec3 p, vec3 p1, vec3 p2, vec3 p3, vec3 p4) {
    vec2 e = vec2(edgeSharpness * 0.1, 0);
    return normalize(vec3(
        map(p+e.xyy,p1,p2,p3,p4)-map(p-e.xyy,p1,p2,p3,p4),
        map(p+e.yxy,p1,p2,p3,p4)-map(p-e.yxy,p1,p2,p3,p4),
        map(p+e.yyx,p1,p2,p3,p4)-map(p-e.yyx,p1,p2,p3,p4)
    ));
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec3 backgroundColor = vec3(0.05, 0.05, 0.08);
    
    // Get dither threshold with optional temporal rotation and scale
    float ditherThreshold;
    if (useTemporalDither > 0.5) {
        vec2 ditherOffset = vec2(
            mod(iFrame * 17.0, 64.0),
            mod(iFrame * 23.0, 64.0)
        );
        ditherThreshold = bayerDither(fragCoord + ditherOffset, ditherScale);
    } else {
        ditherThreshold = bayerDither(fragCoord, ditherScale);
    }
    
    float hitDist = edgeSharpness * 0.1;
    
    // Auto rotation or mouse control
    float angleH = 0.0;
    float angleV = 0.0;
    
    if (iMouse.z > 0.0 || iMouse.w > 0.0) {
        // Mouse control or maintaining last position
        angleH = (iMouse.x / iResolution.x - 0.5) * 6.28318;
        angleV = (iMouse.y / iResolution.y - 0.5) * 3.14159;
        angleV = clamp(angleV, -1.4, 1.4);
    } else if (autoRotate > 0.5) {
        // Auto rotate only when not manually positioned
        angleH = iTime * rotateSpeed;
    }
    
    float sh = sin(angleH), ch = cos(angleH);
    mat3 rotY = mat3(ch, 0, -sh, 0, 1, 0, sh, 0, ch);
    
    float sv = sin(angleV), cv = cos(angleV);
    mat3 rotX = mat3(1, 0, 0, 0, cv, sv, 0, -sv, cv);
    
    mat3 rot = rotX * rotY;
    mat3 invRot = transpose(rot);
    
    vec3 ro_world = vec3(0.0, 0.0, zoom);  // Use zoom uniform instead of hardcoded 2.5
    vec2 uv = (fragCoord - 0.5 * iResolution) / iResolution.y;
    vec3 rd_world = normalize(vec3(uv, -1.5));
    
    vec3 ro = ro_world * invRot;
    vec3 rd = rd_world * invRot;
    
    // Use cubeSize uniform for dynamic sizing
    vec3 tMin = (vec3(-cubeSize) - ro) / rd;
    vec3 tMax = (vec3(cubeSize) - ro) / rd;
    vec3 t1 = min(tMin, tMax);
    vec3 t2 = max(tMin, tMax);
    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar = min(min(t2.x, t2.y), t2.z);
    
    if (tNear > tFar || tFar < 0.0) {
        fragColor = vec4(backgroundColor, 1.0);
        return;
    }
    
    float t = max(0.0, tNear);
    float minStep = max(edgeSharpness * 0.5, 0.005);
    
    for(int i = 0; i < 80; i++) {
        vec3 p = ro + rd * t;
        
        ivec4 nIds = getVoxelData(p, cubeSize);
        int id1 = nIds.x;
        
        if(id1 < 0 || nIds.y < 0 || nIds.z < 0 || nIds.w < 0) {
            t += 0.1;
            if(t > tFar) break;
            continue;
        }
        
        vec3 p1 = getSiteData(iChannel0, id1).xyz;
        vec3 p2 = getSiteData(iChannel0, nIds.y).xyz;
        vec3 p3 = getSiteData(iChannel0, nIds.z).xyz;
        vec3 p4 = getSiteData(iChannel0, nIds.w).xyz;
        
        // Scale site positions by cube size
        p1 *= cubeSize / CUBE_SIZE;
        p2 *= cubeSize / CUBE_SIZE;
        p3 *= cubeSize / CUBE_SIZE;
        p4 *= cubeSize / CUBE_SIZE;
        
        if (showSitePoints > 0.5) {
            if (periodic_dist(p, p1, usePeriodicBoundaries, cubeSize) < sitePointSize || 
                periodic_dist(p, p2, usePeriodicBoundaries, cubeSize) < sitePointSize || 
                periodic_dist(p, p3, usePeriodicBoundaries, cubeSize) < sitePointSize || 
                periodic_dist(p, p4, usePeriodicBoundaries, cubeSize) < sitePointSize) {
                vec3 siteColor = vec3(1.0);
                float fog = smoothstep(tFar, tNear, t);
                fragColor = vec4(mix(backgroundColor, siteColor, fog), 1.0);
                return;
            }
        }
        
        float dist = map(p, p1, p2, p3, p4);
        
        if (dist < hitDist) {
            vec3 normal_local = getNormal(p, p1, p2, p3, p4);
            vec3 normal_world = normal_local * rot;
            
            float edgeWeight = getEdgeWeight(p, p1, p2, p3, p4);
            
            vec3 color = idToColor(id1);
            
            vec3 lightDir1 = normalize(vec3(0.8, 0.9, 0.6));
            vec3 lightDir2 = normalize(vec3(-0.5, 0.3, -0.8));
            
            float diff1 = max(0.0, dot(normal_world, lightDir1));
            float diff2 = max(0.0, dot(normal_world, lightDir2)) * 0.4;
            
            float ambient = 0.2;
            float totalLight = ambient + diff1 + diff2;
            
            vec3 viewDir = normalize(-rd_world);
            float rim = 1.0 - max(0.0, dot(viewDir, normal_world));
            rim = pow(rim, 2.0) * 0.3;
            
            vec3 cellColor = color * totalLight + vec3(rim);
            
            vec3 edgeColor = vec3(0.95, 0.95, 1.0);
            float edgeIntensity = max(0.5, dot(normal_world, lightDir1));
            vec3 finalEdgeColor = edgeColor * edgeIntensity;
            
            vec3 surfaceColor = mix(cellColor, finalEdgeColor, edgeWeight);
            
            // Handle edge opacity > 1.0 as intensity multiplier
            float effectiveOpacity = mix(cellOpacity, min(1.0, edgeOpacity), edgeWeight);
            if (edgeWeight > 0.5 && edgeOpacity > 1.0) {
                // Make edges more visible when opacity > 1
                effectiveOpacity = min(1.0, edgeWeight * edgeOpacity * 0.3);
            }
            
            if (effectiveOpacity < ditherThreshold) {
                t += minStep;
                if(t > tFar) break;
                continue;
            }
            
            float fog = smoothstep(tFar, tNear, t);
            fragColor = vec4(mix(backgroundColor, surfaceColor, fog), 1.0);
            return;
        }
        
        t += max(dist, minStep);
        if(t > tFar) break;
    }
    
    fragColor = vec4(backgroundColor, 1.0);
}
`; 