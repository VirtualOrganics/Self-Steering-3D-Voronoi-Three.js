export const commonShader = `
#define MAX_SITES 50000  // Maximum supported
#define CUBE_SIZE 0.55
#define AUTO_ROTATE_SPEED 0.3

// --- PERIODIC BOUNDARY TOGGLE AND HELPERS ---
#define USE_PERIODIC_BOUNDARIES 0  // Default off, will be controlled by uniform

// Calculates the shortest displacement vector from p2 to p1, accounting for wrapping.
// This is the replacement for (p1 - p2).
vec3 periodic_diff(vec3 p1, vec3 p2, float usePeriodicBoundaries, float cubeSize) {
    vec3 d = p1 - p2;
    // If periodic boundaries are enabled and any component is more than half the box size, wrap
    if (usePeriodicBoundaries > 0.5) {
        vec3 cubeDiameter = vec3(2.0 * cubeSize);
        return d - cubeDiameter * round(d / cubeDiameter);
    }
    return d;
}

// Calculates the shortest scalar distance between p1 and p2 using the periodic vector.
// This is the replacement for distance(p1, p2).
float periodic_dist(vec3 p1, vec3 p2, float usePeriodicBoundaries, float cubeSize) {
    if (usePeriodicBoundaries > 0.5) {
        return length(periodic_diff(p1, p2, 1.0, cubeSize));
    }
    return distance(p1, p2);
}

const int VOXEL_DIM = 64;
const int SLICES_PER_ROW = 8;

vec4 getSiteData(sampler2D siteSampler, int id) {
    if (id < 0) return vec4(1e6, 1e6, 1e6, -1.0);
    return texelFetch(siteSampler, ivec2(id % 224, id / 224), 0);  // 224x224 for up to 50000 sites
}

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

vec3 voxelToWorld(ivec3 coord3D, float cubeSize) {
    return (vec3(coord3D) + 0.5) / float(VOXEL_DIM) * 2.0 * cubeSize - cubeSize;
}

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