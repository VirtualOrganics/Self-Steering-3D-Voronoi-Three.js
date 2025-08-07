export const bufferAFragment = `
uniform float iTime;
uniform float iFrame;
uniform float movementSpeed;
uniform float movementScale;

out vec4 fragColor;

vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return -1.0 + 2.0 * fract(vec3((p3.x + p3.y) * p3.z, (p3.x + p3.z) * p3.y, (p3.y + p3.z) * p3.x));
}

vec3 noise3D_vec(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    
    return mix(mix(mix(hash33(i + vec3(0,0,0)), hash33(i + vec3(1,0,0)), u.x),
                   mix(hash33(i + vec3(0,1,0)), hash33(i + vec3(1,1,0)), u.x), u.y),
               mix(mix(hash33(i + vec3(0,0,1)), hash33(i + vec3(1,0,1)), u.x),
                   mix(hash33(i + vec3(0,1,1)), hash33(i + vec3(1,1,1)), u.x), u.y), u.z);
}

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    int siteId = p.y * 10 + p.x;
    if (siteId >= MAX_SITES) {
        fragColor = vec4(0);
        return;
    }
    
    vec3 basePos = vec3(
        hash33(vec3(float(siteId), 0, 0)).x,
        hash33(vec3(0, float(siteId), 0)).y,
        hash33(vec3(0, 0, float(siteId))).z
    );
    
    vec3 movement = noise3D_vec(basePos * 2.0 + vec3(iTime * movementSpeed));
    vec3 localPos = basePos + movement * movementScale;
    
    float edgeDist = 0.85;
    float repelStrength = 2.0;
    
    if (abs(localPos.x) > edgeDist) {
        float excess = abs(localPos.x) - edgeDist;
        float repel = 1.0 - excess * repelStrength;
        repel = max(repel, 0.0);
        localPos.x *= repel;
    }
    if (abs(localPos.y) > edgeDist) {
        float excess = abs(localPos.y) - edgeDist;
        float repel = 1.0 - excess * repelStrength;
        repel = max(repel, 0.0);
        localPos.y *= repel;
    }
    if (abs(localPos.z) > edgeDist) {
        float excess = abs(localPos.z) - edgeDist;
        float repel = 1.0 - excess * repelStrength;
        repel = max(repel, 0.0);
        localPos.z *= repel;
    }
    
    localPos = clamp(localPos, -0.95, 0.95);
    fragColor = vec4(localPos, float(siteId));
}
`; 