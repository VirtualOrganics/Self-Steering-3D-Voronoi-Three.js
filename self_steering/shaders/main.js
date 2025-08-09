export const mainVertex = `
out vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
`;

export const mainFragment = `
// Image pass — Raymarch with debug lines using Buffer C steering
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D iChannel0; // Buffer A (positions)
uniform sampler2D iChannel1; // Buffer B (voxel owners)
uniform sampler2D iChannel2; // Buffer C (steering for debug)
uniform vec2 iResolution;
uniform float iTime;
uniform float iFrame;
uniform vec4 iMouse;

// Visual controls
uniform float cellOpacity;
uniform float edgeOpacity;
uniform float edgeSharpness;
uniform float edgeThickness;
uniform float showSitePoints;
uniform float sitePointSize;
uniform float useSmoothEdges;
uniform float useTemporalDither;
uniform float ditherScale;
uniform float autoRotate;
uniform float rotateSpeed;
uniform float zoom;
uniform float iActiveSites;
uniform float useVoxelGrid; // 1=use BufferB, 0=brute-force fallback

// from common
ivec2 to2D(ivec3 coord3D);
vec4 getSiteData(sampler2D siteSampler, int id);
vec3 voxelToWorld(ivec3 coord3D);
float bayer4x4(vec2 pos);
float boundaryDist(vec3 a, vec3 b, float spaceSize);

ivec4 getVoxelData(vec3 p) {
    ivec3 c = ivec3(floor((p / (cubeSize * 2.0) + 0.5) * float(VOXEL_DIM)));
    ivec4 v = ivec4(texelFetch(iChannel1, to2D(clamp(c,0,VOXEL_DIM-1)), 0));
    // If voxel not initialized yet, mark invalid
    if (v.x == 0 && v.y == 0 && v.z == 0 && v.w == 0) return ivec4(-1);
    return v;
}

float map(vec3 p, vec3 p1, vec3 p2, vec3 p3, vec3 p4) {
    float ss = cubeSize * 2.0;
    float d12 = 0.5 * (boundaryDist(p, p1, ss) - boundaryDist(p, p2, ss));
    float d13 = 0.5 * (boundaryDist(p, p1, ss) - boundaryDist(p, p3, ss));
    float d14 = 0.5 * (boundaryDist(p, p1, ss) - boundaryDist(p, p4, ss));
    return max(d12, max(d13, d14));
}

float getEdgeWeight(vec3 p, vec3 p1, vec3 p2, vec3 p3, vec3 p4) {
    float ss = cubeSize * 2.0;
    float d1 = boundaryDist(p, p1, ss);
    float d2 = boundaryDist(p, p2, ss);
    float d3 = boundaryDist(p, p3, ss);
    float d4 = boundaryDist(p, p4, ss);
    if (useSmoothEdges > 0.5) {
        float diff12 = abs(d1 - d2);
        float diff13 = abs(d1 - d3);
        float edge12_13 = (1.0 - smoothstep(0.003, edgeThickness, diff12)) * (1.0 - smoothstep(0.003, edgeThickness, diff13));
        float edge12_14 = (1.0 - smoothstep(0.003, edgeThickness, diff12)) * (1.0 - smoothstep(0.003, edgeThickness, abs(d1 - d4)));
        float edge13_14 = (1.0 - smoothstep(0.003, edgeThickness, diff13)) * (1.0 - smoothstep(0.003, edgeThickness, abs(d1 - d4)));
        return max(max(edge12_13, edge12_14), edge13_14);
    } else {
        float diff12 = abs(d1 - d2);
        float diff13 = abs(d1 - d3);
        bool isEdge = (diff12 < edgeThickness && diff13 < edgeThickness) || (diff12 < edgeThickness && abs(d1 - d4) < edgeThickness) || (diff13 < edgeThickness && abs(d1 - d4) < edgeThickness);
        return isEdge ? 1.0 : 0.0;
    }
}

float sdLine(vec3 p, vec3 a, vec3 b, float radius) {
    float ss = cubeSize * 2.0;
    vec3 pa = p - a;
    vec3 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - radius;
}

void main(){
    vec2 fragCoord = gl_FragCoord.xy;
    vec3 backgroundColor = vec3(0.05, 0.05, 0.08);
    float ditherThreshold = bayer4x4(fragCoord * ditherScale);

    // Scale all world distances relative to Shadertoy baseline cube 0.55
    float unitScale = cubeSize / 0.55;
    float edgeSharpnessScaled = edgeSharpness * unitScale;
    float edgeThicknessScaled = edgeThickness * unitScale;
    float sitePointSizeScaled = sitePointSize * unitScale;
    float smallEpsScaled = 0.003 * unitScale;
    float lineRadiusScaled = 0.01 * unitScale;

    float hitDist = edgeSharpnessScaled * 0.1;

    float angleH = 0.0;
    float angleV = 0.0;
    if (iMouse.z > 0.0 || iMouse.w > 0.0) {
        angleH = (iMouse.x / iResolution.x - 0.5) * 6.28318;
        angleV = (iMouse.y / iResolution.y - 0.5) * 3.14159;
        angleV = clamp(angleV, -1.4, 1.4);
    } else if (autoRotate > 0.5) {
        angleH = iTime * rotateSpeed;
    }
    float sh=sin(angleH), ch=cos(angleH); mat3 rotY=mat3(ch,0,-sh,0,1,0,sh,0,ch);
    float sv=sin(angleV), cv=cos(angleV); mat3 rotX=mat3(1,0,0,0,cv,sv,0,-sv,cv);
    mat3 rot=rotX*rotY; mat3 invRot=transpose(rot);
    vec3 ro_world = vec3(0.0, 0.0, zoom);
    vec2 uv = (fragCoord - 0.5 * iResolution) / iResolution.y;
    vec3 rd_world = normalize(vec3(uv, -1.5));
    vec3 ro = ro_world * invRot;
    vec3 rd = rd_world * invRot;

    vec3 tMin=(vec3(-cubeSize)-ro)/rd; vec3 tMax=(vec3(cubeSize)-ro)/rd;
    vec3 t1=min(tMin,tMax); vec3 t2=max(tMin,tMax);
    float tNear=max(max(t1.x,t1.y),t1.z); float tFar=min(min(t2.x,t2.y),t2.z);
    if(tNear > tFar || tFar < 0.0) { fragColor = vec4(backgroundColor,1.0); return; }

    float t = max(0.0, tNear);
    float minStep = max(edgeSharpnessScaled * 0.5, 0.005 * unitScale);
    int maxSteps = int(clamp((tFar - t) * 120.0, 18.0, 80.0));

    for (int i=0; i<80; i++) {
        vec3 p = ro + rd * t;
        ivec4 nIds = ivec4(-1);
        if (useVoxelGrid > 0.5) {
            nIds = getVoxelData(p);
        } else {
            // Brute-force nearest 4 on the fly (cap for perf)
            vec4 bestD = vec4(1e9);
            ivec4 bestI = ivec4(-1);
            int limit = int(min(iActiveSites, 1024.0));
            for (int k=0;k<1024;k++){
                if (k>=limit) break;
                vec3 s = getSiteData(iChannel0, k).xyz;
                float d = length(p - s);
                if (d < bestD.x) { bestD=vec4(d,bestD.xyz); bestI=ivec4(k,bestI.xyz);} else
                if (d < bestD.y) { bestD=vec4(bestD.x,d,bestD.yz); bestI=ivec4(bestI.x,k,bestI.yz);} else
                if (d < bestD.z) { bestD=vec4(bestD.xy,d,bestD.w); bestI=ivec4(bestI.xy,k,bestI.w);} else
                if (d < bestD.w) { bestD.w=d; bestI.w=k; }
            }
            nIds = bestI;
        }
        int id1=nIds.x;
        // fallback if voxel grid not ready: brute-force a small set to get one id
        if(id1 < 0){
            float best = 1e9; int bestId = -1; vec3 pp1 = vec3(0.0);
            for (int k=0;k<128;k++){
                vec3 s = getSiteData(iChannel0, k).xyz;
                float d = length(p - s);
                if (d < best){ best = d; bestId = k; pp1 = s; }
            }
            if (bestId >= 0) { nIds = ivec4(bestId, bestId, bestId, bestId); id1 = bestId; }
        }
        if(id1<0||nIds.y<0||nIds.z<0||nIds.w<0){ t+=0.1; if(t>tFar)break; continue; }
        vec3 p1=getSiteData(iChannel0,id1).xyz; vec3 p2=getSiteData(iChannel0,nIds.y).xyz; vec3 p3=getSiteData(iChannel0,nIds.z).xyz; vec3 p4=getSiteData(iChannel0,nIds.w).xyz;

        if (showSitePoints > 0.5) {
            float ss = cubeSize * 2.0;
            if(boundaryDist(p,p1,ss)<sitePointSizeScaled||boundaryDist(p,p2,ss)<sitePointSizeScaled||boundaryDist(p,p3,ss)<sitePointSizeScaled||boundaryDist(p,p4,ss)<sitePointSizeScaled){
                float fog=smoothstep(tFar,tNear,t); fragColor = vec4(mix(backgroundColor, vec3(1.0), fog), 1.0); return;
            }
        }

        float dist = map(p, p1, p2, p3, p4);
        if (dist < hitDist) {
            vec3 normal_local = normalize(vec3(
                map(p+vec3(edgeSharpnessScaled*0.1,0,0),p1,p2,p3,p4)-map(p-vec3(edgeSharpnessScaled*0.1,0,0),p1,p2,p3,p4),
                map(p+vec3(0,edgeSharpnessScaled*0.1,0),p1,p2,p3,p4)-map(p-vec3(0,edgeSharpnessScaled*0.1,0),p1,p2,p3,p4),
                map(p+vec3(0,0,edgeSharpnessScaled*0.1),p1,p2,p3,p4)-map(p-vec3(0,0,edgeSharpnessScaled*0.1),p1,p2,p3,p4)
            ));
            vec3 normal_world = normal_local * rot;
            // Reuse scaled thickness by temporarily overriding edgeThickness via local
            float edgeWeight = 0.0;
            {
                float ss2 = cubeSize * 2.0;
                float d1 = boundaryDist(p, p1, ss2);
                float d2 = boundaryDist(p, p2, ss2);
                float d3 = boundaryDist(p, p3, ss2);
                float d4 = boundaryDist(p, p4, ss2);
                float diff12 = abs(d1 - d2);
                float diff13 = abs(d1 - d3);
                float edge12_13 = (1.0 - smoothstep(0.003 * unitScale, edgeThicknessScaled, diff12)) * (1.0 - smoothstep(0.003 * unitScale, edgeThicknessScaled, diff13));
                float edge12_14 = (1.0 - smoothstep(0.003 * unitScale, edgeThicknessScaled, diff12)) * (1.0 - smoothstep(0.003 * unitScale, edgeThicknessScaled, abs(d1 - d4)));
                float edge13_14 = (1.0 - smoothstep(0.003 * unitScale, edgeThicknessScaled, diff13)) * (1.0 - smoothstep(0.003 * unitScale, edgeThicknessScaled, abs(d1 - d4)));
                edgeWeight = max(max(edge12_13, edge12_14), edge13_14);
            }

            // base color from id hue
            float h = fract(float(id1)*.618);
            vec3 color = 0.5 + 0.5 * cos(6.28318*(h+vec3(0.0, 0.33, 0.67)));

            vec3 lightDir1=normalize(vec3(0.8,0.9,0.6)); vec3 lightDir2=normalize(vec3(-0.5,0.3,-0.8));
            float diff1=max(0.0,dot(normal_world,lightDir1)); float diff2=max(0.0,dot(normal_world,lightDir2))*0.4;
            float ambient=0.2; float totalLight=ambient+diff1+diff2;
            vec3 viewDir=normalize(-rd_world); float rim=1.0-max(0.0,dot(viewDir,normal_world)); rim=pow(rim,2.0)*0.3;
            vec3 cellColor=color*totalLight+vec3(rim);
            vec3 edgeColor=vec3(0.95,0.95,1.0); float edgeIntensity=max(0.5,dot(normal_world,lightDir1)); vec3 finalEdgeColor=edgeColor*edgeIntensity;
            vec3 surfaceColor = mix(cellColor, finalEdgeColor, edgeWeight);

            // debug steering line
            vec3 steering_vector=texelFetch(iChannel2,ivec2(id1%10,id1/10),0).xyz;
            vec3 line_start=p1-steering_vector*0.5; vec3 line_end=p1+steering_vector*0.5;
            float line_dist=sdLine(p,line_start,line_end,lineRadiusScaled);
            vec3 debug_color=vec3(1.000,0.733,0.000);
            surfaceColor = mix(debug_color, surfaceColor, smoothstep(0.0, 0.05, line_dist));

            float effectiveOpacity = mix(cellOpacity, edgeOpacity, edgeWeight);
            if(effectiveOpacity < ditherThreshold){ t+=minStep; if(t>tFar)break; continue; }
            float fog = smoothstep(tFar, tNear, t);
            fragColor = vec4(mix(backgroundColor, surfaceColor, fog), 1.0);
            return;
        }
        t += max(dist, minStep);
        if(t > tFar) break;
        if(i >= maxSteps) break;
    }
    fragColor = vec4(backgroundColor, 1.0);
}
`;


