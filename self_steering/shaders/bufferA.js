export const bufferAFragment = `
// Buffer A — Physics State Machine (positions)
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform float iTime;
uniform float iFrame;
uniform float iActiveSites; // number of active seeds from UI

// Inputs
uniform sampler2D iChannel0; // previous Buffer A (positions)
uniform sampler2D iChannel1; // Buffer D (state: smoothed steering xyz, steps_left w)
uniform sampler2D iChannel2; // Buffer B (voxel owners)

// Tunable uniforms (from UI)
uniform float invertSteering;          // 0 or 1
uniform float steeringStrength;        // e.g., 2.5
uniform float friction;                // e.g., 0.025
uniform float minSpeed;                // e.g., 0.0004
uniform float maxSpeed;                // e.g., 0.0035
uniform float minRepulsionRadius;      // e.g., 0.015
uniform float repulsionStrength;       // e.g., 0.015
uniform float movementFactor;          // e.g., 0.001 (relax jump scale)
uniform float relaxRepulsionStrength;  // e.g., 0.05

// Cycle uniforms
uniform float relaxDuration;           // seconds
uniform float steerDuration;           // seconds
uniform float relaxStepsPerSecond;     // e.g., 30.0

// From common
ivec2 to2D(ivec3 coord3D);
vec3 voxelToWorld(ivec3 coord3D);
vec3 boundaryDelta(vec3 a, vec3 b, float spaceSize);
float boundaryDist(vec3 a, vec3 b, float spaceSize);

vec4 fetchTexelById(sampler2D tex, int id){
    ivec2 ts = textureSize(tex, 0);
    int w = max(1, ts.x);
    return texelFetch(tex, ivec2(id % w, id / w), 0);
}
vec4 getParticleState(int id) { return fetchTexelById(iChannel1, id); }
vec3 getSitePositionPrev(int id) { return fetchTexelById(iChannel0, id).xyz; }
ivec4 getVoxelData(vec3 p) {
    ivec3 c = ivec3(floor((p / (cubeSize * 2.0) + 0.5) * float(VOXEL_DIM)));
    return ivec4(texelFetch(iChannel2, to2D(clamp(c,0,VOXEL_DIM-1)), 0));
}

vec3 hash33(vec3 p3){p3=fract(p3*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yxz+33.33);return-1.+2.*fract(vec3((p3.x+p3.y)*p3.z,(p3.x+p3.z)*p3.y,(p3.y+p3.z)*p3.x));}

void main(){
    ivec2 p = ivec2(gl_FragCoord.xy);
    ivec2 ts = textureSize(iChannel0, 0);
    int siteId = p.y * ts.x + p.x;
    if (siteId >= int(iActiveSites)) { fragColor = vec4(0); return; }

    float spaceSize = cubeSize * 2.0;
    // Scale factors relative to baseline 0.55 to keep motion feel consistent
    float unitScale = cubeSize / 0.55;
    float minRepulsionRadiusScaled = minRepulsionRadius * unitScale;
    float movementFactorScaled = movementFactor * unitScale;
    vec3 pos;

    if (int(iFrame) < 5) {
        pos = hash33(vec3(float(siteId), float(siteId)*0.1, float(siteId)*0.2)) * cubeSize;
    } else {
        pos = getSitePositionPrev(siteId);
        vec4 state = getParticleState(siteId);
        vec3 smoothed_steering = state.xyz;
        float steps_left = state.w;

        bool isRelaxNow = false;
        {
            float total = relaxDuration + steerDuration;
            isRelaxNow = mod(iTime, total) < relaxDuration;
        }

        if (isRelaxNow && steps_left > 0.0) {
            // Geometric relaxation
            vec3 force = vec3(0.0);
            ivec4 closestIDs = getVoxelData(pos);
            int p1_id = -1;
            for (int i = 0; i < 4; i++) {
                int cid = closestIDs[i];
                if (cid == -1 || cid == siteId) continue;
                if (p1_id == -1) p1_id = cid;
                vec3 otherPos = getSitePositionPrev(cid);
                vec3 delta = boundaryDelta(pos, otherPos, spaceSize);
                force += normalize(delta) / (dot(delta, delta) + 0.001) * relaxRepulsionStrength;
            }
            vec3 jump = vec3(0.0);
            if (length(force) > 1e-6 && p1_id != -1) {
                float breathing_room = boundaryDist(pos, getSitePositionPrev(p1_id), spaceSize);
                jump = normalize(force) * breathing_room * movementFactorScaled;
            }
            pos += jump;
        } else {
            // Steering phase
            float steering_direction = (invertSteering < 0.5) ? 1.0 : -1.0;
            vec3 desired_velocity = smoothed_steering * steering_direction * steeringStrength;

            // Repulsion
            vec3 correction_force = vec3(0.0);
            ivec4 closestIDs = getVoxelData(pos);
            for (int i = 0; i < 4; i++) {
                int cid = closestIDs[i];
                if (cid == -1 || cid == siteId) continue;
                vec3 otherPos = getSitePositionPrev(cid);
                float dist = boundaryDist(pos, otherPos, spaceSize);
                if (dist < minRepulsionRadiusScaled) {
                    float overlap = minRepulsionRadiusScaled - dist;
                    vec3 delta = boundaryDelta(pos, otherPos, spaceSize);
                    correction_force += normalize(delta) * overlap * repulsionStrength;
                }
            }

            vec3 vel = desired_velocity + correction_force;
            vel *= (1.0 - friction);
            float speed = length(vel);
            if (speed > 0.0) {
                float clamped_speed = clamp(speed, minSpeed, maxSpeed);
                vel = vel * (clamped_speed / speed);
            }
            pos += vel;
        }
    }

    pos = mod(pos + cubeSize, spaceSize) - cubeSize;
    fragColor = vec4(pos, float(siteId));
}
`;


