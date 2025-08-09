export const bufferDFragment = `
// Buffer D — State manager (smoothed steering + relax steps)
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D iChannel0; // Buffer C raw steering
uniform sampler2D iChannel1; // Buffer D previous state
uniform float iTime;
uniform float iFrame;

// Common constants mirrored
// Cycle control
#define ALTERNATE_MODE 1
const float RELAX_DURATION = 0.0002;
const float STEER_DURATION = 0.0004;
const float RELAX_STEPS_PER_SECOND = 30.0;

#define DAMPING_FACTOR 0.1

void main(){
    ivec2 p = ivec2(gl_FragCoord.xy);
    ivec2 ts = textureSize(iChannel1, 0);
    int siteId = p.y * ts.x + p.x;

    if (siteId >= MAX_SITES) { fragColor = vec4(0.0); return; }
    if (int(iFrame) < 5) { fragColor = vec4(0.0); return; }

    vec4 prevState = texelFetch(iChannel1, p, 0);
    vec3 prev = prevState.xyz;
    float steps_left = prevState.w;

    vec3 raw = texelFetch(iChannel0, p, 0).xyz;
    vec3 smoothed = mix(prev, raw, DAMPING_FACTOR);

    #if ALTERNATE_MODE == 1
        float total = RELAX_DURATION + STEER_DURATION;
        float cycle_time = mod(iTime, total);
        float prev_time  = iTime - (1.0/60.0);
        float prev_cycle = mod(prev_time, total);
        bool isRelax = cycle_time < RELAX_DURATION;
        bool switched = isRelax && (prev_cycle >= RELAX_DURATION || prev_cycle > cycle_time);
        if (switched) {
            steps_left = float(int(RELAX_DURATION * RELAX_STEPS_PER_SECOND));
        }
        if (isRelax && steps_left > 0.0) {
            steps_left -= 1.0;
        }
    #endif

    fragColor = vec4(smoothed, steps_left);
}
`;


