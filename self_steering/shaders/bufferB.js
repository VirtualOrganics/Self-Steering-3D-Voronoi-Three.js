export const bufferBFragment = `
// Buffer B — Voxel grid (Self-Steering version)
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D iChannel0; // Buffer A (site positions)
uniform sampler2D iChannel1; // Previous Buffer B
uniform float iFrame;
uniform float iActiveSites;

// from common
ivec3 from2D(ivec2 texCoord);
ivec2 to2D(ivec3 coord3D);
vec3 voxelToWorld(ivec3 coord3D);
vec4 getSiteData(sampler2D siteSampler, int id);
float boundaryDist(vec3 a, vec3 b, float spaceSize);

void updateClosest4(inout ivec4 ids, inout vec4 dists, vec3 p, int newId, sampler2D siteSampler) {
    if (newId < 0 || newId == ids.x || newId == ids.y || newId == ids.z || newId == ids.w) return;
    float d = boundaryDist(p, getSiteData(siteSampler, newId).xyz, cubeSize * 2.0);
    if (d < dists.x) { dists=vec4(d,dists.xyz); ids=ivec4(newId,ids.xyz);
    } else if (d < dists.y) { dists=vec4(dists.x,d,dists.yz); ids=ivec4(ids.x,newId,ids.yz);
    } else if (d < dists.z) { dists=vec4(dists.xy,d,dists.w); ids=ivec4(ids.xy,newId,ids.w);
    } else if (d < dists.w) { dists.w=d; ids.w=newId; }
}

void main(){
    ivec2 fragCoord = ivec2(gl_FragCoord.xy);
    ivec2 texSize = ivec2(SLICES_PER_ROW * VOXEL_DIM, VOXEL_DIM * (VOXEL_DIM / SLICES_PER_ROW));
    if (any(greaterThanEqual(fragCoord, texSize))) { fragColor = vec4(-1); return; }

    ivec3 coord3D = from2D(fragCoord);
    vec3 p = voxelToWorld(coord3D);

    int updateInterval = 10; // throttle voxel rebuild (per original)
    if (int(iFrame) % updateInterval != 0) {
        fragColor = texelFetch(iChannel1, fragCoord, 0);
        return;
    }

    ivec4 bestIds = ivec4(-1);
    vec4 bestDists = vec4(1e6);

    int limit = int(iActiveSites);
    for (int i = 0; i < MAX_SITES; i++) {
        if (i >= limit) break;
        float rough = boundaryDist(p, getSiteData(iChannel0, i).xyz, cubeSize * 2.0);
        if (rough < bestDists.w) {
            updateClosest4(bestIds, bestDists, p, i, iChannel0);
        }
    }

    int stepSizes[4] = int[4](8,4,2,1);
    for (int pass=0; pass<4; pass++) {
        int stepSize = stepSizes[pass];
        for (int z=-1; z<=1; z++) for (int y=-1; y<=1; y++) for (int x=-1; x<=1; x++) {
            if (x==0 && y==0 && z==0) continue;
            ivec3 nCoord = coord3D + ivec3(x,y,z) * stepSize;
            if (any(lessThan(nCoord, ivec3(0))) || any(greaterThanEqual(nCoord, ivec3(VOXEL_DIM)))) continue;
            if (int(iFrame) > 0) {
                ivec4 nIds = ivec4(texelFetch(iChannel1, to2D(nCoord), 0));
                updateClosest4(bestIds, bestDists, p, nIds.x, iChannel0);
                updateClosest4(bestIds, bestDists, p, nIds.y, iChannel0);
                updateClosest4(bestIds, bestDists, p, nIds.z, iChannel0);
                updateClosest4(bestIds, bestDists, p, nIds.w, iChannel0);
            }
        }
    }

    fragColor = vec4(bestIds);
}
`;


