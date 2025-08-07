export const mainVertex = `
out vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}
`;

export const mainFragment = `
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform vec2 iResolution;
uniform float iTime;
uniform float iFrame;
uniform vec4 iMouse;

uniform float cellOpacity;
uniform float edgeOpacity;
uniform float edgeSharpness;
uniform float edgeThickness;
uniform float showSitePoints;
uniform float sitePointSize;
uniform float useSmoothEdges;
uniform float useSizeBasedColor;
uniform float useTemporalDither;
uniform vec3 baseColor;

in vec2 vUv;
out vec4 fragColor;

ivec4 getVoxelData(vec3 p) {
    ivec3 c = ivec3(floor((p/CUBE_SIZE*0.5+0.5)*float(VOXEL_DIM)));
    return ivec4(texelFetch(iChannel1, to2D(clamp(c,0,VOXEL_DIM-1)), 0));
}

float getCellSize(vec3 p, vec3 p1, vec3 p2, vec3 p3, vec3 p4) {
    float d2 = distance(p1, p2);
    float d3 = distance(p1, p3);
    float d4 = distance(p1, p4);
    float avgDist = (d2 + d3 + d4) / 3.0;
    return clamp((avgDist - 0.1) / 0.4, 0.0, 1.0);
}

vec3 idToColor(int id, vec3 p, vec3 p1, vec3 p2, vec3 p3, vec3 p4) {
    if (useSizeBasedColor > 0.5) {
        float cellSize = getCellSize(p, p1, p2, p3, p4);
        float brightness = 0.5 + (1.0 - cellSize) * 0.7;
        vec3 color = baseColor * brightness;
        float variation = fract(float(id) * 0.618) * 0.1 - 0.05;
        color += vec3(variation);
        return clamp(color, vec3(0.0), vec3(1.0));
    } else {
        float h = fract(float(id) * 0.618);
        vec3 color = 0.5 + 0.5 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67)));
        float lum = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(vec3(lum), color, 1.8);
        color = max(color, vec3(0.15));
        return color;
    }
}

float map(vec3 p, vec3 p1, vec3 p2, vec3 p3, vec3 p4) {
    float d12 = 0.5 * (distance(p, p1) - distance(p, p2));
    float d13 = 0.5 * (distance(p, p1) - distance(p, p3));
    float d14 = 0.5 * (distance(p, p1) - distance(p, p4));
    return max(d12, max(d13, d14));
}

float getEdgeWeight(vec3 p, vec3 p1, vec3 p2, vec3 p3, vec3 p4) {
    float d1 = distance(p, p1);
    float d2 = distance(p, p2);
    float d3 = distance(p, p3);
    float d4 = distance(p, p4);
    
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
    
    // Get dither threshold with optional temporal rotation
    float ditherThreshold;
    if (useTemporalDither > 0.5) {
        vec2 ditherOffset = vec2(
            mod(iFrame * 17.0, 64.0),
            mod(iFrame * 23.0, 64.0)
        );
        ditherThreshold = bayer4x4(fragCoord + ditherOffset);
    } else {
        ditherThreshold = bayer4x4(fragCoord);
    }
    
    float hitDist = edgeSharpness * 0.1;
    
    float angleH = iTime * AUTO_ROTATE_SPEED;
    float angleV = 0.0;
    
    if (iMouse.z > 0.0) {
        angleH = (iMouse.x / iResolution.x - 0.5) * 6.28318;
        angleV = (iMouse.y / iResolution.y - 0.5) * 3.14159;
        angleV = clamp(angleV, -1.4, 1.4);
    }
    
    float sh = sin(angleH), ch = cos(angleH);
    mat3 rotY = mat3(ch, 0, -sh, 0, 1, 0, sh, 0, ch);
    
    float sv = sin(angleV), cv = cos(angleV);
    mat3 rotX = mat3(1, 0, 0, 0, cv, sv, 0, -sv, cv);
    
    mat3 rot = rotX * rotY;
    mat3 invRot = transpose(rot);
    
    vec3 ro_world = vec3(0.0, 0.0, 2.5);
    vec2 uv = (fragCoord - 0.5 * iResolution) / iResolution.y;
    vec3 rd_world = normalize(vec3(uv, -1.5));
    
    vec3 ro = ro_world * invRot;
    vec3 rd = rd_world * invRot;
    
    vec3 tMin = (vec3(-CUBE_SIZE) - ro) / rd;
    vec3 tMax = (vec3(CUBE_SIZE) - ro) / rd;
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
        
        ivec4 nIds = getVoxelData(p);
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
        
        if (showSitePoints > 0.5) {
            if (distance(p, p1) < sitePointSize || distance(p, p2) < sitePointSize || 
                distance(p, p3) < sitePointSize || distance(p, p4) < sitePointSize) {
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
            
            vec3 color = idToColor(id1, p, p1, p2, p3, p4);
            
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
            
            float effectiveOpacity = mix(cellOpacity, edgeOpacity, edgeWeight);
            
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