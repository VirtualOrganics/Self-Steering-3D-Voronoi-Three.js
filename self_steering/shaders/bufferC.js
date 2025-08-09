export const bufferCFragment = `
// Buffer C — Steering axis estimator (edge-tensor/PCA hybrid from provided code)
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D iChannel0; // self/previous Buffer C
uniform sampler2D iChannel1; // Buffer A (site positions)
uniform sampler2D iChannel2; // Buffer B (voxel owners)
uniform float iFrame;
uniform float iActiveSites;

// Declarations coming from common chunk
ivec3 from2D(ivec2 texCoord);
ivec2 to2D(ivec3 coord3D);
vec3 voxelToWorld(ivec3 coord3D);
vec4 getSiteData(sampler2D siteSampler, int id);
vec3 boundaryDelta(vec3 a, vec3 b, float spaceSize);

// Local helpers
int ownerAtVoxel(ivec3 v){
    v = ivec3(((v.x%VOXEL_DIM)+VOXEL_DIM)%VOXEL_DIM, ((v.y%VOXEL_DIM)+VOXEL_DIM)%VOXEL_DIM, ((v.z%VOXEL_DIM)+VOXEL_DIM)%VOXEL_DIM);
    return ivec4(texelFetch(iChannel2, to2D(v), 0)).x;
}

ivec3 worldToVoxel(vec3 wp){
    vec3 t = (wp / (cubeSize*2.0) + 0.5) * float(VOXEL_DIM);
    ivec3 v = ivec3(floor(t));
    v = ivec3(((v.x%VOXEL_DIM)+VOXEL_DIM)%VOXEL_DIM, ((v.y%VOXEL_DIM)+VOXEL_DIM)%VOXEL_DIM, ((v.z%VOXEL_DIM)+VOXEL_DIM)%VOXEL_DIM);
    return v;
}

int ownerAtWorld(vec3 wp){ return ownerAtVoxel(worldToVoxel(wp)); }

vec3 dirFromIndex(int i, int n){
    float fi = float(i) + 0.5;
    float u  = fi / float(n);
    float z  = 1.0 - 2.0 * u;
    float r  = sqrt(max(0.0, 1.0 - z*z));
    float phi = 2.39996323 * fi; // golden angle
    return vec3(r * cos(phi), r * sin(phi), z);
}

bool rayBoundaryPoint(vec3 O, vec3 dir, int siteId, out vec3 hit){
    float spaceSize = cubeSize * 2.0;
    if(ownerAtWorld(O) != siteId){
        for(int s=0;s<3;s++){
            O = mod(O - dir * 0.002 + cubeSize, spaceSize) - cubeSize;
            if(ownerAtWorld(O) == siteId) break;
        }
        if(ownerAtWorld(O) != siteId) return false;
    }
    float rIn = 0.0;
    float rOut = 0.003;
    int ownerOut = siteId;
    for(int e=0;e<6;++e){
        vec3 P = mod(O + dir * rOut + cubeSize, spaceSize) - cubeSize;
        ownerOut = ownerAtWorld(P);
        if(ownerOut != siteId) break;
        rOut *= 2.0;
    }
    if(ownerOut == siteId) return false;
    for(int b=0;b<5;++b){
        float rMid = 0.5 * (rIn + rOut);
        vec3  P    = mod(O + dir * rMid + cubeSize, spaceSize) - cubeSize;
        int ownMid = ownerAtWorld(P);
        if(ownMid == siteId) rIn = rMid; else rOut = rMid;
    }
    hit = mod(O + dir * rIn + cubeSize, spaceSize) - cubeSize;
    return true;
}

float axis_sign(vec3 a, vec3 rel[64], int M){
    if(M<3) return 1.0;
    float m3=0.0;
    for(int i=0;i<M;++i){ float p=dot(rel[i],a); m3+=p*p*p; }
    return (m3>=0.0)?1.0:-1.0;
}

void main(){
    ivec2 p = ivec2(gl_FragCoord.xy);
    ivec2 tsA = textureSize(iChannel1, 0);
    int siteId = p.y * tsA.x + p.x;
    if (siteId >= MAX_SITES) { fragColor = vec4(0.0); return; }

    vec3 prev = texelFetch(iChannel0, p, 0).xyz;
    if ((int(iFrame) & 1) == 1) { fragColor = vec4(prev, 1.0); return; }

    float spaceSize = cubeSize * 2.0;
    float unitScale = cubeSize / 0.55;
    vec3  sitePos   = getSiteData(iChannel1, siteId).xyz;

    vec3 pts[64];
    int  M = 0;

    // initial K0=16 rays (+ opposite) — step sizes scale with cube size internally
    for(int k=0; k<16 && M<64 && M<24; ++k){
        vec3 d = dirFromIndex(k, 16);
        vec3 h;
        if(rayBoundaryPoint(sitePos, d, siteId, h)){ pts[M++] = h; }
        if(M<64 && M<24){ vec3 h2; if(rayBoundaryPoint(sitePos, -d, siteId, h2)){ pts[M++] = h2; } }
    }

    vec3 steering = prev;
    if (M > 10) {
        vec3 C = vec3(0.0);
        for(int i=0;i<M;++i) C += pts[i];
        C /= float(M);

        vec3 rel[64];
        for(int i=0;i<M;++i) rel[i] = boundaryDelta(pts[i], C, spaceSize);

        // 2-step power iteration on covariance
        float cxx=0., cxy=0., cxz=0., cyy=0., cyz=0., czz=0.;
        for(int i=0;i<M;++i){ vec3 d = rel[i]; cxx+=d.x*d.x; cxy+=d.x*d.y; cxz+=d.x*d.z; cyy+=d.y*d.y; cyz+=d.y*d.z; czz+=d.z*d.z; }
        vec3 v = normalize(vec3(1.0,0.0,0.0));
        for(int it=0; it<2; ++it){
            vec3 Cv = vec3(cxx*v.x + cxy*v.y + cxz*v.z,
                           cxy*v.x + cyy*v.y + cyz*v.z,
                           cxz*v.x + cyz*v.y + czz*v.z);
            float invLen = inversesqrt(max(dot(Cv,Cv), 1e-20));
            v = Cv * invLen;
        }
        float sgn = axis_sign(v, rel, M);
        vec3 axis = v * sgn;
        float lo=1e9, hi=-1e9;
        for(int i=0;i<M;++i){ float t = dot(rel[i], axis); lo=min(lo,t); hi=max(hi,t); }
        vec3 wide_end   = C + lo * axis;
        vec3 narrow_end = C + hi * axis;
        steering = boundaryDelta(narrow_end, wide_end, spaceSize);
    }

    fragColor = vec4(steering, 1.0);
}
`;


