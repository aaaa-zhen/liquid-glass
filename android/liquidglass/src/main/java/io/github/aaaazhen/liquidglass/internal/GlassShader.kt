package io.github.aaaazhen.liquidglass.internal

/**
 * AGSL implementation of the shared liquid-glass material (spec/material.md).
 *
 * `content` is the backdrop crop after a native RenderEffect Gaussian
 * (blur the recorded backdrop, then lens). This pass adds
 * refraction, face matrix, contour bias, content gradient and highlight.
 *
 * Output is premultiplied.
 */
internal const val GLASS_SHADER = """
uniform shader content;

uniform float2 size;             // glass rect, px
uniform float padding;           // recorded margin around the rect, px
uniform float cornerRadius;      // px
uniform float density;           // px per dp
uniform float refractionHeight;  // px, spec 16.667pt
uniform float refractionAmount;  // px, spec 80pt
uniform float dispersion;        // 0..1 extra RGB split
uniform float contentDarkAlpha;  // 0..1
uniform float contentDarkHeight; // px, spec 64pt
uniform float highlightGain;     // spec 1.2
uniform float foregroundMaskStop;// spec 0.67
uniform float shadow;            // 0..1, spec §9
uniform float shadowSoftness;    // 1 = recipe default

float3 srgbToLinear(float3 c) {
    float3 lo = c / 12.92;
    float3 hi = pow((c + 0.055) / 1.055, float3(2.4));
    return mix(hi, lo, step(c, float3(0.04045)));
}
float3 linearToSrgb(float3 c) {
    c = max(c, float3(0.0));
    float3 lo = c * 12.92;
    float3 hi = 1.055 * pow(c, float3(1.0 / 2.4)) - 0.055;
    return mix(hi, lo, step(c, float3(0.0031308)));
}
float luma(float3 c) { return dot(c, float3(0.2126, 0.7152, 0.0722)); }

float sdRoundRect(float2 p, float2 halfSize, float radius) {
    float2 q = abs(p) - halfSize + radius;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}
float2 sdfGradient(float2 p, float2 halfSize, float radius) {
    float e = 1.0;
    float dx = sdRoundRect(p + float2(e, 0.0), halfSize, radius)
             - sdRoundRect(p - float2(e, 0.0), halfSize, radius);
    float dy = sdRoundRect(p + float2(0.0, e), halfSize, radius)
             - sdRoundRect(p - float2(0.0, e), halfSize, radius);
    float2 g = float2(dx, dy);
    float m = dot(g, g);
    return m > 1e-8 ? g * inversesqrt(m) : float2(0.0);
}

// Ease-in-out timing = cubic-bezier(.42, 0, .58, 1)
float bezierX(float t) {
    float o = 1.0 - t;
    return 3.0 * o * o * t * 0.42 + 3.0 * o * t * t * 0.58 + t * t * t;
}
float bezierDx(float t) {
    float o = 1.0 - t;
    return 3.0 * o * o * 0.42 + 6.0 * o * t * 0.16 + 3.0 * t * t * 0.42;
}
float easeInOutTiming(float x) {
    x = clamp(x, 0.0, 1.0);
    float t = x;
    for (int i = 0; i < 6; i++) {
        float err = bezierX(t) - x;
        float slope = max(bezierDx(t), 0.0001);
        t = clamp(t - err / slope, 0.0, 1.0);
    }
    float o = 1.0 - t;
    return 3.0 * o * t * t + t * t * t;
}

float3 sampleLinear(float2 px, float2 bounds) {
    float2 q = clamp(px, float2(0.5), bounds);
    return srgbToLinear(content.eval(q).rgb);
}

float3 faceMatrix(float3 c) {
    float y = luma(c);
    float a = clamp(1.0 - y * 0.25, 0.0, 1.0);
    float ex = 1.0 + (1.0 - a) * 0.3;
    float3 p = mix(float3(a * y), a * c, float3(ex));
    return float3(
        dot(p, float3( 0.978739977, -0.071594179, -0.007145844)) + 0.1,
        dot(p, float3(-0.021254689,  0.928496599, -0.007241920)) + 0.1,
        dot(p, float3(-0.021311775, -0.071468234,  0.992779970)) + 0.1);
}

float keyFillBand(float d, float keyAA, float height, float profileMix) {
    float halfAA = 0.5 * keyAA;
    if (height <= 0.0 || d >= halfAA || d <= -height - halfAA) return 0.0;
    float u = 1.0 - clamp((-d) / height, 0.0, 1.0);
    float extent = u > 0.0 ? mix(1.0, u, profileMix) : 0.0;
    float innerFade = clamp((d + height) / keyAA + 0.5, 0.0, 1.0);
    float outerFade = clamp((-d) / keyAA + 0.5, 0.0, 1.0);
    return extent * innerFade * outerFade;
}
float2 keyFillLobes(float2 grad, float2 dir, float spread, float amount, float band) {
    float invSpread = 1.0 / max(1.0 - spread, 0.00001);
    float nd = dot(dir, grad);
    float2 lobes = clamp((float2(nd, -nd) - float2(spread)) * invSpread,
                         float2(0.0), float2(1.0));
    lobes *= band;
    lobes /= max(float2(1.0) + amount * (float2(1.0) - lobes), float2(0.00001));
    return lobes;
}

float legacyShadowGradient(float materialDistance) {
    float softnessScale = max(shadowSoftness, 0.25);
    float shifted = (materialDistance - 8.0 * softnessScale) / softnessScale;
    if (shifted < 0.0) {
        return smoothstep(-128.0, 0.0, shifted);
    }
    return 1.0 - smoothstep(0.0, 64.0, shifted);
}

half4 main(float2 coord) {
    float2 halfSize = size * 0.5;
    float2 p = (coord - float2(padding)) - halfSize;
    float radius = min(cornerRadius, min(halfSize.x, halfSize.y));
    float sd = sdRoundRect(p, halfSize, radius);
    float d = sd / max(density, 0.0001);
    float coverage = 1.0 - smoothstep(-0.85, 0.85, sd);

    float outsideOnly = smoothstep(-1.0, 1.0, d);
    float shadowAlpha = 0.0;
    if (shadow > 0.0 && d < 72.0) {
        shadowAlpha = clamp(
            0.58 * legacyShadowGradient(d) * outsideOnly * shadow * 0.34,
            0.0, 1.0);
    }

    if (coverage < 0.0001) {
        return half4(half3(0.0), shadowAlpha);
    }

    float2 bounds = size + float2(padding * 2.0) - 0.5;
    float2 grad = sdfGradient(p, halfSize, radius);
    float keyAA = 1.0 / max(density, 0.0001);

    // Sphere-cap inner refraction, blended to undistorted over d in [-1, 0].
    float heightPt = max(refractionHeight / density, 0.0001);
    float amountPt = refractionAmount / max(density, 0.0001);
    float x = clamp(-d / heightPt, 0.0, 1.0);
    float sphere = clamp(sqrt(max(x * (2.0 - x), 0.0)), 0.0, 1.0);
    float deltaPt = -amountPt * (1.0 - sphere);
    float2 innerCoord = coord + grad * deltaPt * density;
    float edgeT = clamp(d + 1.0, 0.0, 1.0);

    float3 innerT = sampleLinear(innerCoord, bounds);
    if (dispersion > 0.0) {
        float split = dispersion * abs(deltaPt) * density * 0.3;
        float3 cr = sampleLinear(innerCoord - grad * split, bounds);
        float3 cb = sampleLinear(innerCoord + grad * split, bounds);
        innerT = float3(cr.r, innerT.g, cb.b);
    }
    float3 outerT = edgeT > 0.001 ? sampleLinear(coord, bounds) : innerT;
    float3 glass = mix(innerT, outerT, edgeT);

    // Pipeline order (spec §6): face matrix -> contour bias -> holding tone.
    glass = faceMatrix(glass);
    float keyBand = keyFillBand(d, keyAA, 1.0, 0.75);
    float2 sideLobes = keyFillLobes(grad, float2(1.0, 0.0), 0.5, 0.0, keyBand);
    float sideMask = sideLobes.x + sideLobes.y;
    glass = glass * (float3(1.0) + (-0.6) * sideMask * (float3(3.0) - 2.0 * glass));
    float inside = 1.0 - clamp(d * 10000.0, 0.0, 1.0);
    glass = mix(glass, glass * 0.96, inside);
    glass = clamp(glass, float3(-0.75), float3(1.0696));

    // 64pt black content gradient from the top edge (spec §7).
    float topPx = p.y + halfSize.y;
    float contentOpacity = 0.0;
    if (contentDarkAlpha > 0.0) {
        float t = clamp(topPx / max(contentDarkHeight, 0.0001), 0.0, 1.0);
        contentOpacity = clamp(contentDarkAlpha * (1.0 - easeInOutTiming(t)), 0.0, 1.0);
        glass = mix(glass, float3(0.0), contentOpacity);
    }

    // Specular key/fill, fill angle 165deg (spec §8).
    float2 dirFill = float2(0.2588221, 0.9659250);
    float2 sharp = keyFillLobes(grad, dirFill, -0.0472761, 0.0, keyBand);
    float diffuseBand = keyFillBand(d, keyAA, 8.0, 1.0);
    float2 diffuse = keyFillLobes(grad, dirFill, 0.4960534, 11.3333333, diffuseBand);
    float stop = max(foregroundMaskStop, 0.0001);
    float foregroundMask = min((topPx / max(size.y, 1.0)) / stop, 1.0);
    float highlight = clamp((sharp.x + sharp.y + diffuse.x + diffuse.y) * highlightGain, 0.0, 1.0)
                    * foregroundMask * coverage;
    glass = mix(glass, float3(1.0), highlight);

    float3 srgb = linearToSrgb(glass);
    float alpha = 1.0 - (1.0 - coverage) * (1.0 - shadowAlpha);
    return half4(half3(srgb * coverage), alpha);
}
"""
