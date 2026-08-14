# Liquid Glass material — shared recipe

Single source of truth for both platform implementations (`web/`, `android/`).
The math below defines the material's behavior; each platform re-expresses it
in its own shading language (WebGL 1 GLSL / AGSL).

All distances are **compositor points** in the material's local space. A parent
presentation transform (`containerScale`) scales the rendered result without
changing any local constant. `renderScale` converts points to physical pixels.

## 1. Geometry / SDF

- Shape: rounded rectangle, signed distance
  `sdRoundRect(p, halfSize, corner)`; the SDF normal comes from central
  differences with a 1-point epsilon.
- Everything downstream is driven by `materialDistance = localSd / renderScale`
  (negative inside, 0 at the edge).
- Fragments with `materialDistance > 72` are pure scene (early out).

## 2. Backdrop blur (glass_background_r_lpf)

Blur factor over distance, four knots packed as
`A = (o0, o0−o1, o1−o2, o2−o3)`, evaluated `A0 − dot(A1..3, t)`:

| knot distance | opacity |
|---:|---:|
| −80 | 0.40 |
| −16.667 | 0.20 |
| 0 | 0.00 |
| 0 (zero-width step) | never contributes (saturate(NaN) = 0) |

→ `blurFactor = clamp(0.40 − 0.20·t0 − 0.20·t1, 0, 1)` with
`t0 = sat((d+80)/63.333)`, `t1 = sat((d+16.667)/16.667)`.
Blurred core, sharp rim, zero outside.

Sampling: mip pyramid at `lod = max(0, log2(r < 2 ? 1 + 0.5r : r))` where
`r = blurRadius · blurFactor`. **Reference preset: blurRadius = 5.**
(WebGL 1 reconstructs the pyramid with radius/2 and radius levels; AGSL can use
`RenderEffect.createBlurEffect` chains or SkSL mips.)

## 3. Inner refraction (sphere cap)

- `innerHeight = 16.667`, `innerAmount = −80`, applied along the SDF normal.
- Response: `x = sat(−d / innerHeight)`; `sphere = sqrt(x(2−x))`;
  `response = 1 − sphere`.
- Displacement `= innerAmount · response · (ior/1.25) · depthCalibration`
(all calibration multipliers are exactly 1 at the reference preset).
- Outer path is undistorted (`outerAmount = 0`); blend inner→outer over
  `d ∈ [−1, 0]` to avoid a folded rim at d = 0.
- Foreground lensing is a *separate* filter: amount −80, height 16.667,
  offset −3.333, edge fade −1..1.5, aberration 0.
- Chromatic aberration ships **disabled** (aberrationHeight = 0).

## 4. Face matrix (glass_background_minimal_lpf)

Max-luma preparation with `maxLuma = 0.75`:
`a = sat(1 − y·(1−maxLuma))`, `prepared = mix(vec3(a·y), a·color, 1 + (1−a)·0.3)`,
then apply the following color matrix:

```
r' = dot(p, ( 0.978739977, −0.071594179, −0.007145844)) + 0.1
g' = dot(p, (−0.021254689,  0.928496599, −0.007241920)) + 0.1
b' = dot(p, (−0.021311775, −0.071468234,  0.992779970)) + 0.1
```

## 5. Contour bias (key/fill, backdrop pass)

- Packing: angle a → `direction = (sin a, −cos a)`, `spread = cos(angle)`,
  `amount = 1/a − 2`.
- Built-in glassBackground pass: angle = π/2 → direction (1, 0), spread 0.5,
  amount 0.
- Bias is **−0.6**, applied as `c · (1 + bias·mask·(3 − 2c))` — it darkens the
  directional side contour; it is *not* a white rim.

## 6. Holding tone + clamp

- Spatial holding tone: `spatial = 1 − sat(d · 10000)`,
  `held = mix(c, c · 0.96, spatial)` (SDR white 0.96; headroom opacity 1 on
  SDR).
- Per-channel clamp to `[−0.75, 1.0696]` (inputClampPreserveHue = false).
- **Pipeline order matters**: face matrix → contour bias → holding tone/clamp.
  Biasing after the holding tone over-darkens the deepest contour ~12% on
  white.

## 7. Black content gradient (StageView.contentGlassGradientView)

- Caller-owned gradient inside the glass content view, local bounds
  fixed at **64 pt** high, top-anchored, black → clear.
- Interpolation: `cubic-bezier(0.42, 0, 0.58, 1)` — evaluated by
  solve x(t) for t (Newton, ~6 iterations), then return y(t). This is *not*
  smoothstep.
- `opacity(t) = 1 − easeInOut(sat(distanceFromTop / 64pt))`, scaled with the
  parent presentation transform.

## 8. Specular highlight

- Sharp pass: fill angle **165°**, key exactly opposite (345°); both lobes
  paint opaque white. Packing per §5.
- Diffuse pass: 8× band height, `spread = cos(0.65 · spreadAngle)`,
  `amount = 1/(a·0.15) − 2`, fully-rounded profile (curvature forced to 1).
- Band profile: `extent = mix(1, u, profile)` with sharp profile 0.75; inner /
  outer AA fades over one `fwidth`.
- Global highlight gain: **1.2**.

## 9. Drop shadow (legacy recipe)

Independent shadow gradient: stops `[clear, black, clear]` at distances
`[−128, 0, 64]`, effect offset 8. Disabled in the enhanced-shadow branch, so a
component exposes it as an explicit knob. Scene is darkened toward
`scene · 0.42` weighted by the gradient, outside only, base weight 0.34,
adaptive 0.72–1.24 with local backdrop detail.

## 10. Color management

All mixing happens in **linear** light; sRGB decode on sample, encode on
output (exact piecewise curve, not gamma 2.2).

## Reference preset constants

| constant | value |
|---|---:|
| REFERENCE_INNER_AMOUNT | −80 |
| REFERENCE_INNER_HEIGHT | 16.6667 |
| REFERENCE_FOREGROUND_OFFSET | −3.3333 |
| REFERENCE_FACE_MAX_LUMA | 0.75 |
| REFERENCE_SDR_WHITE | 0.96 |
| REFERENCE_CLAMP | 1.0696 |
| blur radius | 5 |
| content gradient height | 64 pt |
| highlight fill angle | 165° |
| highlight gain | 1.2 |

Reference implementation: `web/demo/index.html` (WebGL 1, complete
and interactive — treat it as executable documentation of this spec).
