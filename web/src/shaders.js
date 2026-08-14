// GENERATED FILE - do not edit. Source of truth: src/shaders/*.glsl
// Regenerate with: npm run build:shaders

export const VERTEX_SHADER = `attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const BLUR_FRAGMENT_SHADER = `precision highp float;
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
`;

export const GLASS_FRAGMENT_SHADER = `#extension GL_OES_standard_derivatives : enable
precision highp float;

uniform sampler2D uScene;
uniform sampler2D uBlurSmall;
uniform sampler2D uBlurLarge;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform vec2 uHalfSize;
uniform vec2 uPointer;
uniform float uContainerScale;
uniform float uCorner;
uniform float uBevel;
uniform float uProfile;
uniform float uIor;
uniform float uInnerDepth;
uniform float uOuterDepth;
uniform float uDispersion;
uniform float uBlurRadius;
uniform float uBlurTexturesAreSrgb;
uniform float uContentDark;
uniform float uContentHeight;
uniform float uForegroundMaskStop;
uniform float uRoughness;
uniform float uEdgeScatter;
uniform float uTransmission;
uniform float uReflection;
uniform float uSpecular;
uniform float uCaustic;
uniform float uCanopy;
uniform float uShadow;
uniform float uShadowSoftness;
uniform float uRenderScale;
uniform float uPress;
uniform int uDebugView;

// Reference material constants shared with the Android implementation.
const float PI = 3.141592653589793;
const float REFERENCE_INNER_AMOUNT = -80.0;
const float REFERENCE_INNER_HEIGHT = 16.6666666667;
const float REFERENCE_FOREGROUND_OFFSET = -3.3333333333;
const float REFERENCE_FACE_WHITE = 1.0;
const float REFERENCE_FACE_BLACK = 0.1;
const float REFERENCE_FACE_MAX_LUMA = 0.75;
const float REFERENCE_SDR_WHITE = 0.96;
const float REFERENCE_MAX_HEADROOM = 1.2;
const float REFERENCE_CLAMP = 1.0696;

vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(hi, lo, step(c, vec3(0.04045)));
}
vec3 linearToSrgb(vec3 c) {
  c = max(c, 0.0);
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(hi, lo, step(c, vec3(0.0031308)));
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec2 pixelUv(vec2 px) {
  vec2 uv = vec2(px.x / uResolution.x, 1.0 - px.y / uResolution.y);
  return clamp(uv, vec2(0.001), vec2(0.999));
}
vec3 sampleScene(vec2 px) { return srgbToLinear(texture2D(uScene, pixelUv(px)).rgb); }
vec3 decodeBlurSample(vec3 color) {
  return mix(color, srgbToLinear(color), uBlurTexturesAreSrgb);
}
vec3 sampleSmall(vec2 px) {
  return decodeBlurSample(texture2D(uBlurSmall, pixelUv(px)).rgb);
}
vec3 sampleLarge(vec2 px) {
  return decodeBlurSample(texture2D(uBlurLarge, pixelUv(px)).rgb);
}

float sdRoundRect(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}
vec2 safeNormalize(vec2 v) {
  float m2 = dot(v, v);
  return m2 > 1e-8 ? v * inversesqrt(m2) : vec2(0.0);
}

// The content gradient uses cubic-bezier(.42, 0, .58, 1). Unlike smoothstep,
// a CSS cubic Bezier is evaluated by solving x(t) first and returning y(t).
float cubicBezierCoordinate(float t, float p1, float p2) {
  float oneMinusT = 1.0 - t;
  return 3.0 * oneMinusT * oneMinusT * t * p1
       + 3.0 * oneMinusT * t * t * p2
       + t * t * t;
}
float cubicBezierDerivative(float t, float p1, float p2) {
  float oneMinusT = 1.0 - t;
  return 3.0 * oneMinusT * oneMinusT * p1
       + 6.0 * oneMinusT * t * (p2 - p1)
       + 3.0 * t * t * (1.0 - p2);
}
float easeInOutTiming(float x) {
  x = clamp(x, 0.0, 1.0);
  float t = x;
  for (int i = 0; i < 6; ++i) {
    float error = cubicBezierCoordinate(t, 0.42, 0.58) - x;
    float slope = max(cubicBezierDerivative(t, 0.42, 0.58), 0.0001);
    t = clamp(t - error / slope, 0.0, 1.0);
  }
  return cubicBezierCoordinate(t, 0.0, 1.0);
}
vec2 sdfGradient(vec2 p) {
  float e = 1.0;
  float dx = sdRoundRect(p + vec2(e, 0.0), uHalfSize, uCorner)
           - sdRoundRect(p - vec2(e, 0.0), uHalfSize, uCorner);
  float dy = sdRoundRect(p + vec2(0.0, e), uHalfSize, uCorner)
           - sdRoundRect(p - vec2(0.0, e), uHalfSize, uCorner);
  return safeNormalize(vec2(dx, dy));
}

float detailAt(vec2 px) {
  return abs(luma(sampleScene(px)) - luma(sampleLarge(px)));
}

// The blur curve consumes four knots, packed as
// A=(o0,o0-o1,o1-o2,o2-o3), and computes A0-dot(A1..3,t). D2==D3 is a
// zero-width step and must not be implemented as a divide by zero.
float materialBlurFactor(float warpedDistance) {
  float t0 = clamp((warpedDistance + 80.0) / 63.3333333333, 0.0, 1.0);
  float t1 = clamp((warpedDistance + 16.6666666667) /
                   16.6666666667, 0.0, 1.0);
  // Knots (-80,.4)(-16.667,.2)(0,0)(0,1): the fourth is a zero-width step at
  // the same distance as the third, so the undefined term contributes zero.
  // The factor peaks at .4 deep
  // inside, reaches 0 at the edge, and stays 0 outside -> blurred core, sharp
  // rim. (The old step(0.0,d) term produced factor=1 outside, over-blurring
  // the rim.)
  return clamp(0.40 - 0.20 * t0 - 0.20 * t1, 0.0, 1.0);
}

// Sample a mip pyramid at
// lod=max(0,log2(r<2 ? 1+.5r : r)), r=blurRadius*blurFactor (reference=5).
// WebGL 1 cannot request
// arbitrary LOD portably, so the page builds independent radius/2 and radius
// levels and interpolates between them. The knot/radius mathematics is exact;
// only this continuous three-level reconstruction is a browser approximation.
vec3 sampleBlurPyramid(vec2 px, float blurFactor) {
  vec3 sharp = sampleScene(px);
  if (uBlurRadius <= 0.0001) return sharp;

  float radius = clamp(blurFactor, 0.0, 1.0) * uBlurRadius;
  float q = radius < 2.0 ? 1.0 + 0.5 * radius : radius;
  float lod = max(0.0, log(max(q, 0.00001)) / log(2.0));
  float middleRadius = 0.5 * uBlurRadius;
  float middleQ = middleRadius < 2.0
    ? 1.0 + 0.5 * middleRadius : middleRadius;
  float farQ = uBlurRadius < 2.0
    ? 1.0 + 0.5 * uBlurRadius : uBlurRadius;
  float middleLod = max(0.0, log(max(middleQ, 0.00001)) / log(2.0));
  float farLod = max(middleLod + 0.00001,
                     log(max(farQ, 0.00001)) / log(2.0));
  vec3 middle = sampleSmall(px);
  vec3 far = sampleLarge(px);
  if (lod <= middleLod) {
    return mix(sharp, middle, lod / max(middleLod, 0.00001));
  }
  return mix(middle, far, (lod - middleLod) /
                          max(farLod - middleLod, 0.00001));
}

float angleDistance(float a, float b) {
  return abs(atan(sin(a - b), cos(a - b)));
}

float angularLobe(vec2 contourNormal, float angle, float spread) {
  float theta = atan(contourNormal.y, contourNormal.x);
  float x = angleDistance(theta, angle) / max(spread, 0.001);
  return exp(-2.0 * x * x);
}

// Key/fill coverage. All distances are compositor points. The reference
// preset uses the non-stroke path, height=1, offset=0.
float keyFillBand(float d, float keyAA, float sdfAlpha,
                       float edgeCoverage, float height,
                       float effectOffset, float profileMix) {
  if (height <= 0.0 || sdfAlpha <= 0.0) return 0.0;
  float x = d + effectOffset;
  float halfAA = 0.5 * keyAA;
  if (x >= halfAA || x <= -height - halfAA) return 0.0;
  float u = 1.0 - clamp((-x) / height, 0.0, 1.0);
  // profileMix = curvature: sharp key/fill packs 0.75, the diffuse sheen 1.0
  // (fully-rounded profile for the diffuse key/fill path).
  float extent = u > 0.0 ? mix(1.0, u, profileMix) : 0.0;
  float innerFade = clamp((x + height) / keyAA + 0.5, 0.0, 1.0);
  float outerFade = clamp((-x) / keyAA + 0.5, 0.0, 1.0);
  return extent * sdfAlpha * innerFade * outerFade;
}

vec2 keyFillLobes(vec2 gradient, vec2 packedDirection,
                       float packedSpread, float packedAmount,
                       float band) {
  float inverseSpread = 1.0 / max(1.0 - packedSpread, 0.00001);
  float nd = dot(packedDirection, gradient);
  vec2 lobes = clamp((vec2(nd, -nd) - vec2(packedSpread))
                     * inverseSpread, vec2(0.0), vec2(1.0));
  lobes *= band;
  lobes /= max(vec2(1.0) + packedAmount * (vec2(1.0) - lobes),
               vec2(0.00001));
  return lobes;
}

// A negative contour bias
// darkens the directional side contour; it never mixes a white highlight.
vec3 applyContourBias(vec3 color, float keyMask, float colorBias) {
  return color * (vec3(1.0) + colorBias * keyMask
                  * (vec3(3.0) - 2.0 * color));
}

// Apply max-luma preparation followed by the reference face color matrix.
vec3 applyReferenceFaceMatrix(vec3 color) {
  float y = luma(color);
  float maxLumaComplement = 1.0 - REFERENCE_FACE_MAX_LUMA;
  float a = clamp(1.0 - y * maxLumaComplement, 0.0, 1.0);
  float extrapolation = 1.0 + (1.0 - a) * 0.3;
  vec3 prepared = mix(vec3(a * y), a * color, vec3(extrapolation));
  return vec3(
    dot(prepared, vec3( 0.978739977, -0.071594179, -0.007145844))
      + 0.100000001,
    dot(prepared, vec3(-0.021254689,  0.928496599, -0.007241920))
      + 0.100000009,
    dot(prepared, vec3(-0.021311775, -0.071468234,  0.992779970))
      + 0.100000024
  );
}

// This is a spatial holding tone, not a luminance shoulder. Both gradient
// distances are 0, hence invDistance=10000.
vec3 applyReferenceHoldingTone(vec3 color, float materialDistance) {
  float spatial = 1.0 - clamp(materialDistance * 10000.0, 0.0, 1.0);
  float calibration = clamp(uCanopy / 0.97, 0.0, 1.0);
  vec3 held = mix(color, color * REFERENCE_SDR_WHITE,
                  spatial * calibration);

  // Clamp each unpremultiplied channel independently.
  return clamp(held, vec3(-0.75), vec3(REFERENCE_CLAMP));
}

// The legacy shadow recipe is an independent gradient with
// [clear, black, clear] at [-128, 0, 64] and effect offset 8.  It is disabled
// in the enhanced-shadow branch; the UI control therefore adds it explicitly.
float legacyShadowGradient(float materialDistance) {
  float softnessScale = uShadowSoftness /
                        max(16.0 * uRenderScale, 0.0001);
  float shifted = (materialDistance - 8.0 * softnessScale) /
                  max(softnessScale, 0.25);
  if (shifted < 0.0) {
    return smoothstep(-128.0, 0.0, shifted);
  }
  return 1.0 - smoothstep(0.0, 64.0, shifted);
}

// Inner sphere-cap response. The controls are calibration multipliers only;
// their defaults evaluate to exactly 1.
float referenceInnerDelta(float materialDistance) {
  float geometryHeightScale = uBevel /
                              max(uHalfSize.y * 0.48, 0.0001);
  float innerHeight = REFERENCE_INNER_HEIGHT * geometryHeightScale;
  float x = clamp((-materialDistance) / max(innerHeight, 0.0001),
                  0.0, 1.0);
  float sphere = clamp(sqrt(max(x * (2.0 - x), 0.0)), 0.0, 1.0);
  float response = 1.0 - sphere;
  // Continuous-curvature is an optional study control. At 3.30 this exponent
  // is exactly 1 and leaves the reference response unchanged.
  response = pow(max(response, 0.0),
                 clamp(uProfile / 3.30, 0.5, 2.0));
  float refractionScale = (uIor / 1.25)
                        * (uInnerDepth /
                           max(110.0 * uRenderScale, 0.0001));
  return REFERENCE_INNER_AMOUNT * response * refractionScale;
}

void main() {
  vec2 fragPx = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  // Apply the presentation transform to the complete local material subtree.
  // Keep the recipe in local coordinates,
  // then convert only screen-space distances and sampling offsets below.
  float containerScale = max(uContainerScale, 0.0001);
  vec2 p = (fragPx - uCenter) / containerScale;
  float capsuleY = clamp((p.y + uHalfSize.y) /
                         max(2.0 * uHalfSize.y, 1.0), 0.0, 1.0);
  float foregroundStop = clamp(uForegroundMaskStop, 0.0001, 1.0);
  // Gradient mask: clear at 0, white at .67, white at 1.
  float foregroundMask = min(capsuleY / foregroundStop, 1.0);
  float localSd = sdRoundRect(p, uHalfSize, uCorner);
  float screenSd = localSd * containerScale;
  float aa = max(fwidth(screenSd), 0.72);
  float coverage = 1.0 - smoothstep(-aa, aa, screenSd);

  vec3 scene = sampleScene(fragPx);
  float materialDistance = localSd / max(uRenderScale, 1.0);
  float localDetail = detailAt(fragPx);
  float shadowAdaptive = mix(0.72, 1.24,
                             smoothstep(0.018, 0.125, localDetail));
  float shadowGradient = legacyShadowGradient(materialDistance);
  float outsideOnly = smoothstep(-1.0, 1.0, materialDistance);
  float outsideShadow = shadowGradient * outsideOnly * uShadow
                      * shadowAdaptive * 0.34;
  vec3 sceneSeparated = mix(scene, scene * 0.42, outsideShadow);

  if (materialDistance > 72.0 && uDebugView == 0) {
    gl_FragColor = vec4(linearToSrgb(scene), 1.0);
    return;
  }

  vec2 grad = sdfGradient(p);
  float innerDelta = referenceInnerDelta(materialDistance)
                   * (1.0 + 0.025 * uPress);
  float innerDistance = materialDistance + innerDelta;
  vec2 offsetG = grad * innerDelta * uRenderScale * containerScale;
  vec2 innerPx = fragPx + offsetG;

  // outerAmount=0 and outerHeight=0, so the outer path samples the undistorted
  // coordinate. The -1..0 threshold blend prevents a folded rim at d=0.
  float outerDistance = materialDistance;
  float edgeT = clamp((materialDistance - (-1.0)) / (0.0 - (-1.0)),
                      0.0, 1.0);
  float innerBlurFactor = materialBlurFactor(innerDistance);
  float outerBlurFactor = materialBlurFactor(outerDistance);
  float blurFactor = mix(innerBlurFactor, outerBlurFactor, edgeT);
  float shoulder = clamp(abs(innerDelta) /
                         max(abs(REFERENCE_INNER_AMOUNT), 0.0001), 0.0, 1.0);

  // Foreground lensing uses a separate field:
  // amount=-80, height=16.667, offset=-3.333, edge=-1..1.5, aberration=0.
  // This page has no foreground content to displace, so the field is exposed
  // in diagnostics and used only to align the SDF highlight, not sampled twice.
  float foregroundScale = uOuterDepth /
                          max(79.0 * uRenderScale, 0.0001);
  float foregroundDistance = materialDistance
                           - REFERENCE_FOREGROUND_OFFSET;
  float foregroundX = clamp((-foregroundDistance) /
                            REFERENCE_INNER_HEIGHT, 0.0, 1.0);
  float foregroundResponse = 1.0 -
    clamp(sqrt(max(foregroundX * (2.0 - foregroundX), 0.0)), 0.0, 1.0);
  float foregroundEdgeOpacity = smoothstep(-1.0, 1.5,
                                            materialDistance);
  vec2 foregroundField = grad * REFERENCE_INNER_AMOUNT * foregroundResponse
                       * foregroundScale * foregroundEdgeOpacity
                       * uRenderScale * containerScale * foregroundMask;

  // The reference recipe has aberrationHeight=0. The 0.008 UI default is
  // treated as the neutral calibration point; only values above it add an
  // explicitly experimental RGB split.
  float extraAberration = max(uDispersion - 0.008, 0.0)
                         * shoulder * 24.0 * uRenderScale * containerScale;
  vec3 neutralInner = sampleBlurPyramid(innerPx, innerBlurFactor);
  vec3 innerTransmission = neutralInner;
  if (extraAberration > 0.0001) {
    vec3 splitR = sampleBlurPyramid(innerPx - grad * extraAberration,
                                    innerBlurFactor);
    vec3 splitB = sampleBlurPyramid(innerPx + grad * extraAberration,
                                    innerBlurFactor);
    innerTransmission = vec3(splitR.r, innerTransmission.g, splitB.b);
  }
  vec3 dispersionDifference = abs(innerTransmission - neutralInner);
  vec3 outerTransmission = sampleBlurPyramid(fragPx, outerBlurFactor);
  vec3 transmission = mix(innerTransmission, outerTransmission, edgeT);
  transmission = applyReferenceFaceMatrix(transmission);
  transmission *= uTransmission;
  float keyAA = max(fwidth(materialDistance), 0.00001);
  float edgeCoverage = clamp(0.5 - materialDistance / keyAA,
                              0.0, 1.0);
  float keyBand = keyFillBand(materialDistance, keyAA, 1.0,
                              edgeCoverage, 1.0, 0.0, 0.75);

  // Built-in glassBackground key/fill: angle=PI/2 packs to direction=(1,0),
  // spread=cos(PI/3)=.5, amount=.5 packs to 1/amount-2=0. Its -0.6 bias
  // darkens the side contour in the opaque path; it is not a white rim.
  vec2 backdropLobes = keyFillLobes(grad, vec2(1.0, 0.0),
                                    0.5, 0.0, keyBand);
  float backdropKeyMask = backdropLobes.x + backdropLobes.y;

  // Pipeline order: face matrix -> contour bias -> holding tone -> clamp.
  // The -0.6 bias runs on the pre-holding-tone colour and the clamp inside the
  // holding tone bounds the result. Biasing after holding tone (the old order)
  // over-darkens the deepest contour by ~12% against a white backdrop.
  vec3 glass = applyContourBias(transmission, backdropKeyMask, -0.6);
  glass = applyReferenceHoldingTone(glass, materialDistance);

  // The caller-owned content gradient has local bounds fixed to 64pt high. A
  // parent presentation scale therefore changes its displayed height together
  // with the material, without changing this local 64pt recipe.
  float contentHeightPx = max(uContentHeight * uRenderScale, 0.0001);
  float contentFromTopPx = max(p.y + uHalfSize.y, 0.0);
  float contentT = clamp(contentFromTopPx / contentHeightPx, 0.0, 1.0);
  float contentShape = (1.0 - easeInOutTiming(contentT))
                     * step(0.0001, uContentHeight);
  float contentOpacity = clamp(uContentDark * contentShape, 0.0, 1.0);
  glass = mix(glass, vec3(0.0), contentOpacity);

  // Foreground key/fill specular. Key and fill colours are both opaque white,
  // so the 165 deg fill lobe and the
  // exactly-opposite 345 deg key lobe both paint white (sharpLobes.x / .y). A
  // second "diffuse" pass adds a wide soft sheen (8x band, cos(0.65*spread),
  // amount 1/(a*0.15)-2, fully-rounded profile). Packing: dir=(sin a,-cos a),
  // spread=cos(angle), amount=1/a-2. The global gain is 1.2.
  vec2 dirFill = vec2(0.2588221, 0.9659250);        // (sin165, -cos165)
  vec2 sharpLobes = keyFillLobes(grad, dirFill,
                                 -0.0472761, 0.0, keyBand);
  float diffuseBand = keyFillBand(materialDistance, keyAA, 1.0,
                                  edgeCoverage, 8.0, 0.0, 1.0);
  vec2 diffuseLobes = keyFillLobes(grad, dirFill,
                                   0.4960534, 11.3333333, diffuseBand);
  float specularSum = sharpLobes.x + sharpLobes.y
                    + diffuseLobes.x + diffuseLobes.y;
  // uCaustic / uReflection remain as calibration knobs; the fixed 1.2 factor
  // is the reference highlight gain.
  float fillCalibration = clamp(uCaustic / 0.48, 0.0, 2.0);
  float rimCalibration = clamp(uReflection / 0.32, 0.0, 3.0);
  float systemHighlight =
    clamp(specularSum * 1.2 * fillCalibration * rimCalibration, 0.0, 1.0)
    * foregroundMask;
  vec3 vibrantWhite = vec3(1.0);
  glass = mix(glass, vibrantWhite, systemHighlight * coverage);

  // Optional manual specular remains separate from the reference fill.
  float extraSpecular = uSpecular * keyBand
                      * angularLobe(grad, -PI * 0.25, PI * 0.22);
  glass += vec3(1.04, 1.02, 1.0) * extraSpecular;

  float touchRadius = max(uHalfSize.y * 0.48 * containerScale, 1.0);
  vec2 touchDelta = fragPx - uPointer;
  float touchGlow = exp(-dot(touchDelta, touchDelta) /
                        (2.0 * touchRadius * touchRadius)) * uPress;
  glass += vec3(0.075, 0.105, 0.16) * touchGlow * (0.35 + 0.65 * shoulder);

  vec3 finalLinear = mix(sceneSeparated, glass, coverage);

  if (uDebugView == 1) {
    vec3 n = vec3(grad * 0.5 + 0.5, shoulder);
    finalLinear = mix(scene * 0.12, n, coverage);
  } else if (uDebugView == 2) {
    vec2 combinedField = offsetG + foregroundField * 0.25;
    float magnitude = clamp(length(combinedField) /
                            max(uHalfSize.y * containerScale * 0.55, 1.0),
                            0.0, 1.0);
    vec3 field = vec3(combinedField /
                      max(uHalfSize.y * containerScale, 1.0)
                      * 1.8 + 0.5, magnitude);
    finalLinear = mix(scene * 0.12, field, coverage);
  } else if (uDebugView == 3) {
    vec3 layers = vec3(blurFactor,
                       clamp(systemHighlight, 0.0, 1.0),
                       max(clamp(outsideShadow * 4.0, 0.0, 1.0),
                           contentOpacity));
    finalLinear = mix(scene * 0.12, layers, coverage);
  } else if (uDebugView == 4) {
    finalLinear = mix(scene * 0.08, dispersionDifference * 7.0,
                      coverage);
  } else if (uDebugView == 5) {
    finalLinear = fragPx.x < uResolution.x * 0.5
      ? sampleSmall(fragPx)
      : sampleLarge(fragPx);
  } else if (uDebugView == 6) {
    // R = local-64pt black content alpha, G = foreground glass mask,
    // B = their overlap. This makes the two independent layers visible.
    vec3 masks = vec3(contentOpacity, foregroundMask,
                      min(contentOpacity, foregroundMask));
    finalLinear = mix(scene * 0.08, masks, coverage);
  }

  gl_FragColor = vec4(linearToSrgb(finalLinear), 1.0);
}
`;
