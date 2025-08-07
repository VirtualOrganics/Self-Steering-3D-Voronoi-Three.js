export const bufferBFragment = `
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform float iFrame;

out vec4 fragColor;

void updateClosest4(inout ivec4 ids, inout vec4 dists, vec3 p, int newId, sampler2D siteSampler) {
    if (newId < 0 || newId == ids.x || newId == ids.y || newId == ids.z || newId == ids.w) return;
    float d = distance(p, getSiteData(siteSampler, newId).xyz);
    if (d < dists.x) {
        dists = vec4(d, dists.xyz);
        ids = ivec4(newId, ids.xyz);
    } else if (d < dists.y) {
        dists = vec4(dists.x, d, dists.yz);
        ids = ivec4(ids.x, newId, ids.yz);
    } else if (d < dists.z) {
        dists = vec4(dists.xy, d, dists.w);
        ids = ivec4(ids.xy, newId, ids.w);
    } else if (d < dists.w) {
        dists.w = d;
        ids.w = newId;
    }
}

void main() {
    ivec2 texSize = ivec2(SLICES_PER_ROW * VOXEL_DIM, VOXEL_DIM * (VOXEL_DIM / SLICES_PER_ROW));
    ivec2 fragCoord = ivec2(gl_FragCoord.xy);
    
    if (any(greaterThanEqual(fragCoord, texSize))) {
        discard;
    }

    ivec3 coord3D = from2D(fragCoord);
    vec3 p = voxelToWorld(coord3D);
    
    int updateInterval = 5;
    int frameInt = int(iFrame);
    
    if (frameInt % updateInterval != 0) {
        fragColor = texelFetch(iChannel1, fragCoord, 0);
        return;
    }
    
    ivec4 bestIds = ivec4(-1);
    vec4 bestDists = vec4(1e6);
    
    for (int i = 0; i < MAX_SITES; i++) {
        updateClosest4(bestIds, bestDists, p, i, iChannel0);
    }
    
    int stepSizes[6] = int[6](32, 16, 8, 4, 2, 1);
    
    for (int pass = 0; pass < 6; pass++) {
        int stepSize = stepSizes[pass];
        
        for (int z = -1; z <= 1; z++) {
            for (int y = -1; y <= 1; y++) {
                for (int x = -1; x <= 1; x++) {
                    if (x == 0 && y == 0 && z == 0) continue;
                    
                    ivec3 nCoord = coord3D + ivec3(x, y, z) * stepSize;
                    
                    if (any(lessThan(nCoord, ivec3(0))) || 
                        any(greaterThanEqual(nCoord, ivec3(VOXEL_DIM)))) continue;
                    
                    if (frameInt > 0) {
                        ivec4 nIds = ivec4(texelFetch(iChannel1, to2D(nCoord), 0));
                        updateClosest4(bestIds, bestDists, p, nIds.x, iChannel0);
                        updateClosest4(bestIds, bestDists, p, nIds.y, iChannel0);
                        updateClosest4(bestIds, bestDists, p, nIds.z, iChannel0);
                        updateClosest4(bestIds, bestDists, p, nIds.w, iChannel0);
                    }
                }
            }
        }
    }
    
    updateClosest4(bestIds, bestDists, p, bestIds.x, iChannel0);
    updateClosest4(bestIds, bestDists, p, bestIds.y, iChannel0);
    updateClosest4(bestIds, bestDists, p, bestIds.z, iChannel0);
    updateClosest4(bestIds, bestDists, p, bestIds.w, iChannel0);
    
    fragColor = vec4(bestIds);
}
`; 