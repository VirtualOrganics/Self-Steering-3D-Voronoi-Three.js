export const commonShader = `
// Core configuration
#define CUBE_SIZE 0.55

// Voxel Grid configuration
const int VOXEL_DIM = 64;
const int SLICES_PER_ROW = 8;

// Helper functions for voxel grid texture packing
ivec2 to2D(ivec3 coord3D) {
    int slice = coord3D.z;
    int sliceX = slice % SLICES_PER_ROW;
    int sliceY = slice / SLICES_PER_ROW;
    return ivec2(sliceX * VOXEL_DIM + coord3D.x, 
                 sliceY * VOXEL_DIM + coord3D.y);
}

ivec3 from2D(ivec2 coord2D) {
    int sliceX = coord2D.x / VOXEL_DIM;
    int sliceY = coord2D.y / VOXEL_DIM;
    int slice = sliceY * SLICES_PER_ROW + sliceX;
    return ivec3(coord2D.x % VOXEL_DIM,
                 coord2D.y % VOXEL_DIM,
                 slice);
}

vec3 voxelToWorld(ivec3 voxelCoord) {
    vec3 normalized = vec3(voxelCoord) / float(VOXEL_DIM - 1);
    return (normalized - 0.5) * 2.0 * CUBE_SIZE;
}

vec4 getSiteData(sampler2D siteSampler, int siteId) {
    int x = siteId % 10;
    int y = siteId / 10;
    return texelFetch(siteSampler, ivec2(x, y), 0);
}

// 4x4 Bayer dithering matrix
float bayer4x4(vec2 pos) {
    mat4 bayerMatrix = mat4(
        0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,
        12.0/16.0, 4.0/16.0, 14.0/16.0,  6.0/16.0,
        3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0,
        15.0/16.0, 7.0/16.0, 13.0/16.0,  5.0/16.0
    );
    ivec2 p = ivec2(mod(pos, 4.0));
    return bayerMatrix[p.x][p.y];
}
`; 