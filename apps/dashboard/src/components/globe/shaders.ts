/* Programmer: Lalith Satheesh / Date: 09/05/2026 */

// Shaders live in template strings because Turbopack has no raw loader for .glsl by
// default and one more build rule is not worth four small programs.

export const EARTH_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const EARTH_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uLightDir;
uniform vec3 uRim;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
  vec3 base = texture2D(uMap, vUv).rgb;
  float ndl = dot(vNormal, normalize(uLightDir));
  // Soft terminator; the night side stays readable rather than black.
  float light = 0.5 + 0.5 * smoothstep(-0.4, 0.55, ndl);
  float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 3.0);
  vec3 col = base * light + uRim * fresnel * 0.4;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export const ATMOSPHERE_VERTEX = /* glsl */ `
varying vec3 vNormalView;

void main() {
  vNormalView = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Rendered on the back faces of a slightly larger sphere with additive blending: only the
// sliver outside the planet's silhouette survives the depth test, which reads as a halo.
export const ATMOSPHERE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;

varying vec3 vNormalView;

void main() {
  float rim = pow(clamp(0.66 - dot(vNormalView, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 2.4);
  gl_FragColor = vec4(uColor * rim * uIntensity, 1.0);
  #include <colorspace_fragment>
}
`;

export const MARKER_VERTEX = /* glsl */ `
attribute float aMagnitude;
attribute float aPhase;
attribute float aShape;
attribute float aTone;
attribute float aSelected;
attribute float aAge;

uniform float uTime;
uniform float uSize;
uniform float uPulse;

varying vec2 vUv;
varying float vShape;
varying float vTone;
varying float vSelected;
varying float vPulse;
varying float vAge;

void main() {
  vUv = uv;
  vShape = aShape;
  vTone = aTone;
  vSelected = aSelected;
  vAge = aAge;
  vPulse = fract(uTime * 0.45 + aPhase);
  float breathe = 1.0 + uPulse * 0.18 * aMagnitude * sin(uTime * 2.2 + aPhase * 6.2831);
  float size = uSize * (0.35 + aMagnitude) * breathe * (1.0 + 0.7 * aSelected);
  vec4 world = modelMatrix * instanceMatrix * vec4(position * size, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

// Shape carries the event kind so colour is never the only encoding:
// 0 ring with ripple (earthquake), 1 disc (wildfire, volcano), 2 diamond (storm, ice),
// 3 dot with halo (ISS).
export const MARKER_FRAGMENT = /* glsl */ `
uniform vec3 uAccent;
uniform vec3 uNeutral;
uniform float uPulse;

varying vec2 vUv;
varying float vShape;
varying float vTone;
varying float vSelected;
varying float vPulse;
varying float vAge;

void main() {
  vec2 p = vUv - 0.5;
  float d = length(p);
  float core = 0.0;
  float ring = 0.0;
  if (vShape < 0.5) {
    core = 1.0 - smoothstep(0.09, 0.15, d);
    float rr = 0.16 + 0.30 * vPulse;
    ring = (1.0 - smoothstep(0.0, 0.05, abs(d - rr))) * (1.0 - vPulse) * uPulse;
    ring += (1.0 - smoothstep(0.0, 0.03, abs(d - 0.2))) * (1.0 - uPulse) * 0.6;
  } else if (vShape < 1.5) {
    core = 1.0 - smoothstep(0.15, 0.21, d);
  } else if (vShape < 2.5) {
    float m = abs(p.x) + abs(p.y);
    core = 1.0 - smoothstep(0.17, 0.24, m);
  } else {
    core = 1.0 - smoothstep(0.07, 0.11, d);
    ring = 1.0 - smoothstep(0.0, 0.03, abs(d - 0.28));
  }
  float alpha = max(core, ring * 0.85) * (0.45 + 0.55 * vAge);
  // Discs and diamonds sit in dense clusters (fires across a region); keep them quieter.
  if (vShape > 0.5 && vShape < 2.5) alpha *= 0.7;
  alpha = max(alpha, core * vSelected);
  if (alpha < 0.02) discard;
  vec3 col = mix(uNeutral, uAccent, vTone) * (1.0 + 0.5 * vSelected);
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;
