import {
  VERTEX_SHADER,
  BLUR_FRAGMENT_SHADER,
  GLASS_FRAGMENT_SHADER
} from "./shaders.js";

/**
 * Style knobs of the liquid-glass material, in the "compositor point" (CSS px)
 * space defined by spec/material.md. Defaults are aligned with the Android
 * `LiquidGlassStyle` where the two APIs overlap.
 */
const DEFAULT_STYLE = {
  cornerRadius: 28,
  /** Base blur radius of the backdrop pyramid. */
  blurRadius: 5,
  /** Refraction strength multiplier; 1 = the reference -80pt inner amount. */
  refraction: 1,
  /** Extra RGB split along the rim, 0..1. The recipe ships with 0. */
  dispersion: 0,
  /** Opacity of the black content gradient at the top edge, 0..1. */
  contentDarkAlpha: 0,
  /** Local height of the black content gradient layer, pt. */
  contentDarkHeight: 64,
  /** Drop shadow strength outside the shape, 0..1. */
  shadow: 0,
  shadowSoftness: 16,
  /** Advanced calibration; the defaults evaluate to exactly 1 in the recipe. */
  bevel: 0.48,
  profile: 3.3,
  ior: 1.25,
  foregroundMaskStop: 0.67,
  reflection: 0.32,
  specular: 0,
  caustic: 0.48,
  canopy: 0.97,
  containerScale: 1,
  /** Foreground lensing depth in pt; the reference value is 79. */
  outerDepth: 79,
  roughness: 0.2,
  edgeScatter: 0.2
};

/**
 * Renders the liquid-glass material into a caller-owned WebGL canvas.
 * No bundled controls and no implicit rAF loop — the host drives
 * `render()` (each setter marks state dirty and `render()` is cheap).
 *
 *   const glass = new LiquidGlass(canvas, { cornerRadius: 36 });
 *   glass.resize(cssWidth, cssHeight, devicePixelRatio);
 *   glass.setBackground(image);          // what the lens refracts
 *   glass.setLens(cx, cy, width, height); // CSS px, center + size
 *   glass.render();
 */
export class LiquidGlass {
  constructor(canvas, style = {}) {
    this.canvas = canvas;
    this.style = { ...DEFAULT_STYLE, ...style };

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true
    });
    if (!gl) throw new Error("LiquidGlass requires a WebGL context.");
    if (!gl.getExtension("OES_standard_derivatives")) {
      throw new Error("LiquidGlass requires OES_standard_derivatives.");
    }
    this.gl = gl;

    this._blurProgram = this._program(BLUR_FRAGMENT_SHADER, "blur");
    this._glassProgram = this._program(GLASS_FRAGMENT_SHADER, "glass");
    this._quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    this._backgroundTexture = gl.createTexture();
    this._backgroundSource = null;
    this._backgroundCanvas = null;
    this._targets = [];
    this._blurTargetMode = "";
    this._blurSmall = null;
    this._blurLarge = null;
    this._blurTexturesAreSrgb = 0;
    this._blurDirty = true;
    this._nativeBlurScratch = {
      edge: document.createElement("canvas"),
      filtered: document.createElement("canvas"),
      output: document.createElement("canvas")
    };
    this._nativeBlurAvailable = LiquidGlass._probeNativeBlur();

    this.renderScale = 1;
    this._cssWidth = canvas.width;
    this._cssHeight = canvas.height;

    /**
     * Set true when the background changes every frame (video, animated
     * canvas). Forces the half/quarter-resolution WebGL blur pyramid, which
     * is cheap per frame, instead of the full-resolution Canvas2D blur.
     */
    this.dynamic = false;

    // Lens geometry in CSS px; pointer feeds the press-glow.
    this.center = { x: canvas.width / 2, y: canvas.height / 2 };
    this.lensWidth = 300;
    this.lensHeight = 140;
    this.pointer = { ...this.center };
    this.press = 0;
    this.debugView = 0;
  }

  static _probeNativeBlur() {
    const probe = document.createElement("canvas").getContext("2d");
    if (!probe || !("filter" in probe)) return false;
    try {
      probe.filter = "blur(1px)";
      const supported = probe.filter !== "none";
      probe.filter = "none";
      return supported;
    } catch (_) {
      return false;
    }
  }

  _compile(type, source, label) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`${label} shader: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  }

  _program(fragmentSource, label) {
    const gl = this.gl;
    const p = gl.createProgram();
    gl.attachShader(p, this._compile(gl.VERTEX_SHADER, VERTEX_SHADER, "vertex"));
    gl.attachShader(p, this._compile(gl.FRAGMENT_SHADER, fragmentSource, label));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`${label} program: ${gl.getProgramInfoLog(p)}`);
    }
    p._uniforms = Object.create(null);
    return p;
  }

  _uniform(p, name) {
    return (p._uniforms[name] ??= this.gl.getUniformLocation(p, name));
  }

  _bindQuad(p) {
    const gl = this.gl;
    const loc = gl.getAttribLocation(p, "aPosition");
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quad);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  /** Sets the backing-store size from CSS size + pixel ratio. */
  resize(cssWidth, cssHeight, pixelRatio = window.devicePixelRatio || 1) {
    const w = Math.max(2, Math.round(cssWidth * pixelRatio));
    const h = Math.max(2, Math.round(cssHeight * pixelRatio));
    this._cssWidth = cssWidth;
    this._cssHeight = cssHeight;
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.renderScale = w / cssWidth;
    this._destroyTargets();
    this._uploadBackground();
  }

  /**
   * Sets what the glass refracts: an image / canvas / video frame,
   * cover-fitted to the canvas. Pass null for a flat placeholder.
   */
  setBackground(source) {
    this._backgroundSource = source;
    this._uploadBackground();
  }

  /** Lens center + size in CSS px. */
  setLens(centerX, centerY, width, height) {
    this.center.x = centerX;
    this.center.y = centerY;
    this.lensWidth = width;
    this.lensHeight = height;
  }

  setPointer(x, y) {
    this.pointer.x = x;
    this.pointer.y = y;
  }

  /** Press deformation 0..1 (drive it with a spring for a fluid feel). */
  setPress(press) {
    this.press = press;
  }

  setStyle(partial) {
    const blurAffecting = ["blurRadius", "containerScale"];
    if (blurAffecting.some(key => key in partial && partial[key] !== this.style[key])) {
      this._blurDirty = true;
    }
    Object.assign(this.style, partial);
  }

  _uploadBackground() {
    const gl = this.gl;
    const source = this._backgroundSource;

    // Fast path for animated sources: a canvas already at backing-store size
    // uploads directly, skipping the cover-fit copy.
    if (
      source instanceof HTMLCanvasElement &&
      source.width === this.canvas.width &&
      source.height === this.canvas.height
    ) {
      this._backgroundCanvas = source;
      this._uploadCanvasTexture(this._backgroundTexture, source);
      gl.bindTexture(gl.TEXTURE_2D, this._backgroundTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this._blurDirty = true;
      return;
    }

    const bg = (this._backgroundCanvas ??= document.createElement("canvas"));
    bg.width = this.canvas.width;
    bg.height = this.canvas.height;
    const ctx = bg.getContext("2d", { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (source && source.width && source.height) {
      const sourceAspect = source.width / source.height;
      const targetAspect = bg.width / bg.height;
      let sw = source.width, sh = source.height, sx = 0, sy = 0;
      if (sourceAspect > targetAspect) {
        sw = source.height * targetAspect;
        sx = (source.width - sw) * 0.5;
      } else {
        sh = source.width / targetAspect;
        sy = (source.height - sh) * 0.5;
      }
      ctx.drawImage(source, sx, sy, sw, sh, 0, 0, bg.width, bg.height);
    } else {
      ctx.fillStyle = "#665448";
      ctx.fillRect(0, 0, bg.width, bg.height);
    }

    gl.bindTexture(gl.TEXTURE_2D, this._backgroundTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bg);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this._blurDirty = true;
  }

  _destroyTargets() {
    const gl = this.gl;
    this._targets.forEach(target => {
      if (target.fbo) gl.deleteFramebuffer(target.fbo);
      gl.deleteTexture(target.texture);
    });
    this._targets = [];
    this._blurTargetMode = "";
    this._blurSmall = this._blurLarge = null;
  }

  _makeTarget(w, h) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("LiquidGlass: blur framebuffer incomplete.");
    }
    const target = { texture, fbo, w, h };
    this._targets.push(target);
    return target;
  }

  _ensureTargets(mode, sizes) {
    const matches = this._blurTargetMode === mode &&
      this._targets.length === sizes.length &&
      this._targets.every((t, i) => t.w === sizes[i][0] && t.h === sizes[i][1]);
    if (matches) return;
    this._destroyTargets();
    sizes.forEach(([w, h]) => this._makeTarget(w, h));
    this._blurTargetMode = mode;
  }

  _uploadCanvasTexture(texture, source) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } finally {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
  }

  static _sizeCanvas(surface, w, h) {
    if (surface.width !== w) surface.width = w;
    if (surface.height !== h) surface.height = h;
  }

  // Replicates edge pixels so the browser Gaussian never samples transparent
  // black beyond the background bounds (three standard deviations of margin).
  static _drawEdgeExtended(source, destination, pad) {
    const w = source.width;
    const h = source.height;
    const ctx = destination.getContext("2d", { alpha: false });
    ctx.filter = "none";
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, destination.width, destination.height);
    ctx.drawImage(source, 0, 0, w, h, pad, pad, w, h);
    ctx.drawImage(source, 0, 0, w, 1, pad, 0, w, pad);
    ctx.drawImage(source, 0, h - 1, w, 1, pad, pad + h, w, pad);
    ctx.drawImage(source, 0, 0, 1, h, 0, pad, pad, h);
    ctx.drawImage(source, w - 1, 0, 1, h, pad + w, pad, pad, h);
    ctx.drawImage(source, 0, 0, 1, 1, 0, 0, pad, pad);
    ctx.drawImage(source, w - 1, 0, 1, 1, pad + w, 0, pad, pad);
    ctx.drawImage(source, 0, h - 1, 1, 1, 0, pad + h, pad, pad);
    ctx.drawImage(source, w - 1, h - 1, 1, 1, pad + w, pad + h, pad, pad);
  }

  _uploadNativeBlurLevel(target, radiusPx, pad) {
    const scratch = this._nativeBlurScratch;
    const paddedW = scratch.edge.width;
    const paddedH = scratch.edge.height;
    const filterCtx = scratch.filtered.getContext("2d", { alpha: false });
    filterCtx.clearRect(0, 0, paddedW, paddedH);
    filterCtx.imageSmoothingEnabled = true;
    filterCtx.imageSmoothingQuality = "high";
    filterCtx.filter = `blur(${radiusPx.toFixed(3)}px)`;
    filterCtx.drawImage(scratch.edge, 0, 0);
    filterCtx.filter = "none";

    const outputCtx = scratch.output.getContext("2d", { alpha: false });
    outputCtx.clearRect(0, 0, scratch.output.width, scratch.output.height);
    outputCtx.imageSmoothingEnabled = true;
    outputCtx.imageSmoothingQuality = "high";
    outputCtx.drawImage(
      scratch.filtered,
      pad, pad, this._backgroundCanvas.width, this._backgroundCanvas.height,
      0, 0, this._backgroundCanvas.width, this._backgroundCanvas.height
    );
    this._uploadCanvasTexture(target.texture, scratch.output);
  }

  _updateNativeBlur() {
    const { canvas } = this;
    this._ensureTargets("native", [
      [canvas.width, canvas.height],
      [canvas.width, canvas.height]
    ]);
    const effectiveBlurCss = this.style.blurRadius * this.style.containerScale;
    const farRadiusPx = Math.max(0, effectiveBlurCss * this.renderScale);
    if (farRadiusPx < 0.01) {
      this._uploadCanvasTexture(this._targets[0].texture, this._backgroundCanvas);
      this._uploadCanvasTexture(this._targets[1].texture, this._backgroundCanvas);
    } else {
      const pad = Math.max(1, Math.ceil(farRadiusPx * 3));
      const paddedW = this._backgroundCanvas.width + pad * 2;
      const paddedH = this._backgroundCanvas.height + pad * 2;
      LiquidGlass._sizeCanvas(this._nativeBlurScratch.edge, paddedW, paddedH);
      LiquidGlass._sizeCanvas(this._nativeBlurScratch.filtered, paddedW, paddedH);
      LiquidGlass._sizeCanvas(
        this._nativeBlurScratch.output,
        this._backgroundCanvas.width, this._backgroundCanvas.height
      );
      LiquidGlass._drawEdgeExtended(this._backgroundCanvas, this._nativeBlurScratch.edge, pad);
      this._uploadNativeBlurLevel(this._targets[0], farRadiusPx * 0.5, pad);
      this._uploadNativeBlurLevel(this._targets[1], farRadiusPx, pad);
    }
    this._blurSmall = this._targets[0].texture;
    this._blurLarge = this._targets[1].texture;
    this._blurTexturesAreSrgb = 1;
    this._blurDirty = false;
  }

  _runBlur(source, destination, direction, radius, decodeSrgb) {
    const gl = this.gl;
    const p = this._blurProgram;
    gl.useProgram(p);
    this._bindQuad(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.fbo);
    gl.viewport(0, 0, destination.w, destination.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(this._uniform(p, "uTexture"), 0);
    gl.uniform2f(this._uniform(p, "uTexel"), 1 / destination.w, 1 / destination.h);
    gl.uniform2f(this._uniform(p, "uDirection"), direction[0], direction[1]);
    gl.uniform1f(this._uniform(p, "uRadius"), radius);
    gl.uniform1f(this._uniform(p, "uDecodeSrgb"), decodeSrgb);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  _updateWebGLBlur() {
    const { canvas } = this;
    const halfW = Math.max(2, Math.ceil(canvas.width / 2));
    const halfH = Math.max(2, Math.ceil(canvas.height / 2));
    const quarterW = Math.max(2, Math.ceil(canvas.width / 4));
    const quarterH = Math.max(2, Math.ceil(canvas.height / 4));
    this._ensureTargets("webgl", [
      [halfW, halfH], [halfW, halfH],
      [quarterW, quarterH], [quarterW, quarterH]
    ]);
    const kernelEdge = 3.2307692308;
    const effectiveBlurCss = this.style.blurRadius * this.style.containerScale;
    const middleCss = effectiveBlurCss * 0.5;
    const farCss = effectiveBlurCss;
    const t = this._targets;
    const smallRadiusX = middleCss * this.renderScale / (kernelEdge * (canvas.width / t[0].w));
    const smallRadiusY = middleCss * this.renderScale / (kernelEdge * (canvas.height / t[1].h));
    const largeRadiusX = farCss * this.renderScale / (kernelEdge * (canvas.width / t[2].w));
    const largeRadiusY = farCss * this.renderScale / (kernelEdge * (canvas.height / t[3].h));
    // The full-radius level is built independently from the sharp background;
    // cascading it from radius/2 would compound the radii.
    this._runBlur(this._backgroundTexture, t[0], [1, 0], smallRadiusX, 1);
    this._runBlur(t[0].texture, t[1], [0, 1], smallRadiusY, 0);
    this._runBlur(this._backgroundTexture, t[2], [1, 0], largeRadiusX, 1);
    this._runBlur(t[2].texture, t[3], [0, 1], largeRadiusY, 0);
    this._blurSmall = t[1].texture;
    this._blurLarge = t[3].texture;
    this._blurTexturesAreSrgb = 0;
    this._blurDirty = false;
  }

  _updateBlur() {
    if (!this.dynamic && this._nativeBlurAvailable && this._backgroundCanvas) {
      try {
        this._updateNativeBlur();
        return;
      } catch (error) {
        this._nativeBlurAvailable = false;
        this._destroyTargets();
      }
    }
    this._updateWebGLBlur();
  }

  _setTexture(p, name, texture, unit) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this._uniform(p, name), unit);
  }

  render() {
    const { gl, canvas, style } = this;
    if (!canvas.width || !canvas.height) return;
    if (this._blurDirty) this._updateBlur();

    const rs = this.renderScale;
    const halfX = this.lensWidth * 0.5 * rs * (1 + this.press * 0.032);
    const halfY = this.lensHeight * 0.5 * rs * (1 - this.press * 0.058);
    const corner = Math.min(style.cornerRadius * rs, Math.min(halfX, halfY));
    const p = this._glassProgram;

    gl.useProgram(p);
    this._bindQuad(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    this._setTexture(p, "uScene", this._backgroundTexture, 0);
    this._setTexture(p, "uBlurSmall", this._blurSmall, 1);
    this._setTexture(p, "uBlurLarge", this._blurLarge, 2);
    gl.uniform2f(this._uniform(p, "uResolution"), canvas.width, canvas.height);
    gl.uniform2f(this._uniform(p, "uCenter"), this.center.x * rs, this.center.y * rs);
    gl.uniform2f(this._uniform(p, "uHalfSize"), halfX, halfY);
    gl.uniform2f(this._uniform(p, "uPointer"), this.pointer.x * rs, this.pointer.y * rs);
    gl.uniform1f(this._uniform(p, "uContainerScale"), style.containerScale);
    gl.uniform1f(this._uniform(p, "uCorner"), corner);
    gl.uniform1f(this._uniform(p, "uBevel"), halfY * style.bevel);
    gl.uniform1f(this._uniform(p, "uProfile"), style.profile);
    gl.uniform1f(this._uniform(p, "uIor"), style.ior);
    gl.uniform1f(this._uniform(p, "uInnerDepth"), 110 * rs * style.refraction);
    gl.uniform1f(this._uniform(p, "uOuterDepth"), style.outerDepth * rs);
    // 0.008 is the neutral calibration point; only values above it add split.
    gl.uniform1f(this._uniform(p, "uDispersion"), 0.008 + style.dispersion * 0.012);
    gl.uniform1f(this._uniform(p, "uBlurRadius"), style.blurRadius * style.containerScale);
    gl.uniform1f(this._uniform(p, "uBlurTexturesAreSrgb"), this._blurTexturesAreSrgb);
    gl.uniform1f(this._uniform(p, "uContentDark"), style.contentDarkAlpha);
    gl.uniform1f(this._uniform(p, "uContentHeight"), style.contentDarkHeight);
    gl.uniform1f(this._uniform(p, "uForegroundMaskStop"), style.foregroundMaskStop);
    gl.uniform1f(this._uniform(p, "uRoughness"), style.roughness);
    gl.uniform1f(this._uniform(p, "uEdgeScatter"), style.edgeScatter);
    gl.uniform1f(this._uniform(p, "uTransmission"), 1.0);
    gl.uniform1f(this._uniform(p, "uReflection"), style.reflection);
    gl.uniform1f(this._uniform(p, "uSpecular"), style.specular);
    gl.uniform1f(this._uniform(p, "uCaustic"), style.caustic);
    gl.uniform1f(this._uniform(p, "uCanopy"), style.canopy);
    gl.uniform1f(this._uniform(p, "uShadow"), style.shadow);
    gl.uniform1f(this._uniform(p, "uShadowSoftness"), style.shadowSoftness * rs);
    gl.uniform1f(this._uniform(p, "uRenderScale"), rs);
    gl.uniform1f(this._uniform(p, "uPress"), this.press);
    gl.uniform1i(this._uniform(p, "uDebugView"), this.debugView);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose() {
    const gl = this.gl;
    this._destroyTargets();
    gl.deleteTexture(this._backgroundTexture);
    gl.deleteBuffer(this._quad);
    gl.deleteProgram(this._blurProgram);
    gl.deleteProgram(this._glassProgram);
  }
}
