precision highp float;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform vec2 uTexel;
uniform vec2 uDirection;
uniform float uRadius;
uniform float uDecodeSrgb;

vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(hi, lo, step(c, vec3(0.04045)));
}
vec3 readColor(vec2 uv) {
  vec3 c = texture2D(uTexture, clamp(uv, 0.0, 1.0)).rgb;
  return mix(c, srgbToLinear(c), uDecodeSrgb);
}
void main() {
  vec2 d = uTexel * uDirection * uRadius;
  vec3 c = readColor(vUv) * 0.2270270270;
  c += readColor(vUv + d * 1.3846153846) * 0.3162162162;
  c += readColor(vUv - d * 1.3846153846) * 0.3162162162;
  c += readColor(vUv + d * 3.2307692308) * 0.0702702703;
  c += readColor(vUv - d * 3.2307692308) * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}
