export const commonShader = `
// Common utilities and constants for Self-Steering Voronoi
// Converted from Shadertoy to work with Three.js uniforms

#define MAX_SITES 50000  // 224x224 texture can hold up to 50176 sites
const int VOXEL_DIM = 64;
const int SLICES_PER_ROW = 8;

uniform float cubeSize;                 // half-size of the cube in world units
uniform float usePeriodicBoundaries;    // 1.0 = periodic, 0.0 = closed box

// Shortest wrapped delta
vec3 boundaryDelta(vec3 a, vec3 b, float spaceSize) {
    if (usePeriodicBoundaries > 0.5) {
        vec3 d = a - b;
        vec3 diameter = vec3(spaceSize);
        return d - diameter * round(d / diameter);
    }
    return a - b;
}

float boundaryDist(vec3 a, vec3 b, float spaceSize) {
    return length(boundaryDelta(a, b, spaceSize));
}

// 3D slice packing helpers for voxel grid
ivec3 from2D(ivec2 texCoord) {
    int sliceX = texCoord.x / VOXEL_DIM;
    int sliceY = texCoord.y / VOXEL_DIM;
    int z = sliceY * SLICES_PER_ROW + sliceX;
    return ivec3(texCoord.x % VOXEL_DIM, texCoord.y % VOXEL_DIM, z);
}

ivec2 to2D(ivec3 coord3D) {
    int sliceX = coord3D.z % SLICES_PER_ROW;
    int sliceY = coord3D.z / SLICES_PER_ROW;
    return ivec2(sliceX * VOXEL_DIM + coord3D.x, sliceY * VOXEL_DIM + coord3D.y);
}

vec3 voxelToWorld(ivec3 coord3D) {
    // world = ((voxel+0.5)/VOXEL_DIM) * (2*cubeSize) - cubeSize
    return (vec3(coord3D) + 0.5) / float(VOXEL_DIM) * (2.0 * cubeSize) - cubeSize;
}

// Site data decoding: dynamic width using textureSize (works for 224x224 or others)
vec4 getSiteData(sampler2D siteSampler, int id) {
    if (id < 0) return vec4(1e6, 1e6, 1e6, -1.0);
    ivec2 ts = textureSize(siteSampler, 0);
    int w = max(1, ts.x);
    return texelFetch(siteSampler, ivec2(id % w, id / w), 0);
}

// Bayer dither
float bayer4x4(vec2 pos) {
    const mat4 bayerMatrix = mat4(
        0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,
        12.0/16.0, 4.0/16.0, 14.0/16.0,  6.0/16.0,
        3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0,
        15.0/16.0, 7.0/16.0, 13.0/16.0,  5.0/16.0
    );
    ivec2 p = ivec2(mod(pos, 4.0));
    return bayerMatrix[p.x][p.y];
}
`;


