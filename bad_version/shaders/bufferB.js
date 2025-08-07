export const bufferBFragment = `
uniform sampler2D iChannel0;  // Buffer A - site positions
uniform sampler2D iChannel1;  // Buffer B - previous frame
uniform float iFrame;
uniform float numSites;

out vec4 fragColor;

void main() {
    ivec3 voxelCoord = from2D(ivec2(gl_FragCoord.xy));
    
    const int updateInterval = 5;
    int updateCycle = int(iFrame) / updateInterval;
    int cycleFrame = int(iFrame) % updateInterval;
    
    if (cycleFrame == 0) {
        // Complete all JFA passes in one frame
        int closestSite = -1;
        float minDist = 1e10;
        vec3 voxelPos = (vec3(voxelCoord) + 0.5) / float(VOXEL_DIM) * 2.0 - 1.0;
        voxelPos *= CUBE_SIZE;
        
        // Initial search - find closest site (limit to reasonable number for performance)
        int texSize = int(ceil(sqrt(numSites)));
        int maxCheck = min(int(numSites), 1000); // Limit initial brute force search
        
        for (int i = 0; i < maxCheck; i++) {
            int tx = i % texSize;
            int ty = i / texSize;
            vec4 siteData = texelFetch(iChannel0, ivec2(tx, ty), 0);
            vec3 sitePos = siteData.xyz * CUBE_SIZE;
            float d = distance(voxelPos, sitePos);
            if (d < minDist) {
                minDist = d;
                closestSite = i;
            }
        }
        
        // JFA passes (6 iterations for 64^3 grid)
        for (int pass = 0; pass < 6; pass++) {
            int step = 1 << (5 - pass);
            
            // Check neighbors at current step size
            if (iFrame > 0.0) {
                for (int dz = -1; dz <= 1; dz++) {
                    for (int dy = -1; dy <= 1; dy++) {
                        for (int dx = -1; dx <= 1; dx++) {
                            if (dx == 0 && dy == 0 && dz == 0) continue;
                            
                            ivec3 neighborCoord = voxelCoord + ivec3(dx, dy, dz) * step;
                            if (any(lessThan(neighborCoord, ivec3(0))) || 
                                any(greaterThanEqual(neighborCoord, ivec3(VOXEL_DIM)))) continue;
                            
                            ivec4 neighborData = ivec4(texelFetch(iChannel1, to2D(neighborCoord), 0));
                            int neighborSite = neighborData.x;
                            
                            if (neighborSite >= 0 && neighborSite < int(numSites)) {
                                int tx = neighborSite % texSize;
                                int ty = neighborSite / texSize;
                                vec4 siteData = texelFetch(iChannel0, ivec2(tx, ty), 0);
                                vec3 sitePos = siteData.xyz * CUBE_SIZE;
                                float d = distance(voxelPos, sitePos);
                                if (d < minDist) {
                                    minDist = d;
                                    closestSite = neighborSite;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Find 3 next closest sites for edge detection
        int site2 = -1, site3 = -1, site4 = -1;
        float dist2 = 1e10, dist3 = 1e10, dist4 = 1e10;
        
        // For edge detection, only check nearby sites (limit for performance)
        int edgeCheckLimit = min(int(numSites), 200);
        
        for (int i = 0; i < edgeCheckLimit; i++) {
            if (i == closestSite) continue;
            int tx = i % texSize;
            int ty = i / texSize;
            vec4 siteData = texelFetch(iChannel0, ivec2(tx, ty), 0);
            vec3 sitePos = siteData.xyz * CUBE_SIZE;
            float d = distance(voxelPos, sitePos);
            
            if (d < dist2) {
                dist4 = dist3; site4 = site3;
                dist3 = dist2; site3 = site2;
                dist2 = d; site2 = i;
            } else if (d < dist3) {
                dist4 = dist3; site4 = site3;
                dist3 = d; site3 = i;
            } else if (d < dist4) {
                dist4 = d; site4 = i;
            }
        }
        
        fragColor = vec4(float(closestSite), float(site2), float(site3), float(site4));
    } else {
        // On non-update frames, just copy the previous complete result
        fragColor = texelFetch(iChannel1, ivec2(gl_FragCoord.xy), 0);
    }
}
`; 