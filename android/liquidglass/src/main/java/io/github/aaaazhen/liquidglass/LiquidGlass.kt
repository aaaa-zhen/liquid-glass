package io.github.aaaazhen.liquidglass

import android.graphics.BlurMaskFilter
import android.graphics.RuntimeShader
import android.os.Build
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.neverEqualPolicy
import androidx.compose.runtime.setValue
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.CompositingStrategy as DrawCompositingStrategy
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.layer.CompositingStrategy
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.Measurable
import androidx.compose.ui.layout.MeasureResult
import androidx.compose.ui.layout.MeasureScope
import androidx.compose.ui.node.DrawModifierNode
import androidx.compose.ui.node.GlobalPositionAwareModifierNode
import androidx.compose.ui.node.LayoutModifierNode
import androidx.compose.ui.node.ModifierNodeElement
import androidx.compose.ui.node.invalidateDraw
import androidx.compose.ui.node.invalidatePlacement
import androidx.compose.ui.node.requireGraphicsContext
import androidx.compose.ui.platform.InspectorInfo
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import io.github.aaaazhen.liquidglass.internal.GLASS_SHADER

/**
 * Parameters of the liquid-glass material, in compositor points (dp).
 * Constructor defaults provide the tuned reference capsule.
 */
@Immutable
data class LiquidGlassStyle(
    val cornerRadius: Dp = 28.dp,
    /** Native backdrop-blur radius on the recorded behind-content. */
    val blurRadius: Dp = 5.dp,
    /** Inner refraction band height. */
    val refractionHeight: Dp = 26.dp,
    /** Inner displacement amount; the default capsule uses 80. */
    val refractionAmount: Dp = 80.dp,
    /** Extra RGB split along the rim, 0..1. */
    val dispersion: Float = 0.49f,
    /** Opacity of the black content gradient at the top edge, 0..1. */
    val contentDarkAlpha: Float = 1f,
    /** Local height of the black content gradient layer. */
    val contentDarkHeight: Dp = 341.dp,
    /**
     * Drop shadow outside the shape, 0..1. Drawn by a sibling modifier
     * so [placeWithLayer] clip does not hide it.
     */
    val shadow: Float = 0.47f,
    val shadowSoftness: Float = 1.86f,
    /** Specular key/fill highlight gain. */
    val highlightGain: Float = 0.67f,
    /** Foreground glass mask reaches full strength at this height fraction. */
    val foregroundMaskStop: Float = 1f
) {
    companion object {
        /** Reference capsule — same values as the constructor defaults. */
        val Default = LiquidGlassStyle()

        /**
         * Window-chrome glass with gentler refraction and a stronger dual
         * highlight. This is intentionally distinct from [Default].
         */
        val Chrome = LiquidGlassStyle(
            cornerRadius = 28.dp,
            blurRadius = 2.dp,
            refractionHeight = 12.5.dp,
            refractionAmount = 40.dp,
            dispersion = 0f,
            contentDarkAlpha = 0.78f,
            contentDarkHeight = 512.dp,
            highlightGain = 1.35f,
            foregroundMaskStop = 1f,
            shadow = 0.40f,
            shadowSoftness = 1.5f
        )
    }
}

/**
 * Draws the liquid-glass material behind this node's content, sampling
 * [backdrop] for what lies underneath.
 *
 * Capability ladder:
 *  - API 33+: record what's behind, BlurEffect the
 *    crop, then AGSL lens / face / highlight on that same layer.
 *  - API 31-32: RenderEffect blur + translucent surface and rim, no refraction.
 *  - below 31: plain translucent surface so layouts remain usable.
 */
fun Modifier.liquidGlass(
    backdrop: LiquidGlassBackdrop,
    style: LiquidGlassStyle = LiquidGlassStyle()
): Modifier = this
    .then(LiquidGlassShadowElement(style))
    .then(LiquidGlassElement(backdrop, style))

private class LiquidGlassShadowElement(
    val style: LiquidGlassStyle
) : ModifierNodeElement<LiquidGlassShadowNode>() {

    override fun create(): LiquidGlassShadowNode = LiquidGlassShadowNode(style)

    override fun update(node: LiquidGlassShadowNode) {
        node.style = style
        node.invalidateDraw()
    }

    override fun InspectorInfo.inspectableProperties() {
        name = "liquidGlassShadow"
        properties["style"] = style
    }

    override fun equals(other: Any?): Boolean =
        other is LiquidGlassShadowElement && other.style == style

    override fun hashCode(): Int = style.hashCode()
}

private class LiquidGlassShadowNode(
    var style: LiquidGlassStyle
) : DrawModifierNode, Modifier.Node() {

    private val shadowPaint = Paint()

    override fun ContentDrawScope.draw() {
        if (style.shadow > 0f) {
            val radius = style.cornerRadius.toPx()
                .coerceAtMost(minOf(size.width, size.height) / 2f)
            val blur = 14.dp.toPx() * style.shadowSoftness.coerceAtLeast(0.05f)
            val offsetY = 4.dp.toPx()
            drawIntoCanvas { canvas ->
                val paint = shadowPaint.asFrameworkPaint()
                paint.color = android.graphics.Color.argb(
                    (style.shadow * 0.30f * 255).toInt().coerceIn(0, 255), 0, 0, 0
                )
                paint.maskFilter = BlurMaskFilter(blur, BlurMaskFilter.Blur.NORMAL)
                canvas.nativeCanvas.drawRoundRect(
                    0f, offsetY, size.width, size.height + offsetY, radius, radius, paint
                )
            }
        }
        drawContent()
    }
}

private class LiquidGlassElement(
    val backdrop: LiquidGlassBackdrop,
    val style: LiquidGlassStyle
) : ModifierNodeElement<LiquidGlassNode>() {

    override fun create(): LiquidGlassNode = LiquidGlassNode(backdrop, style)

    override fun update(node: LiquidGlassNode) {
        val cornerChanged = node.style.cornerRadius != style.cornerRadius
        node.backdrop = backdrop
        node.style = style
        if (cornerChanged) node.invalidatePlacement()
        node.invalidateDraw()
    }

    override fun InspectorInfo.inspectableProperties() {
        name = "liquidGlass"
        properties["backdrop"] = backdrop
        properties["style"] = style
    }

    override fun equals(other: Any?): Boolean =
        other is LiquidGlassElement && other.backdrop == backdrop && other.style == style

    override fun hashCode(): Int = 31 * backdrop.hashCode() + style.hashCode()
}

private class LiquidGlassNode(
    var backdrop: LiquidGlassBackdrop,
    var style: LiquidGlassStyle
) : LayoutModifierNode, DrawModifierNode, GlobalPositionAwareModifierNode, Modifier.Node() {

    private var glassLayer: GraphicsLayer? = null
    private var nodeCoordinates: LayoutCoordinates? by mutableStateOf(null, neverEqualPolicy())

    private var runtimeShader: RuntimeShader? = null
    private var shaderBroken = false
    private var boundEffectKey: ShaderBindKey? = null
    private var paddingPx = 0

    private val clipPath = Path()
    private var clipKey: ClipKey? = null

    private data class ClipKey(val size: Size, val corner: Float)

    private data class ShaderBindKey(
        val width: Int,
        val height: Int,
        val padding: Int,
        val style: LiquidGlassStyle
    )

    override fun onAttach() {
        glassLayer = requireGraphicsContext().createGraphicsLayer()
    }

    override fun onDetach() {
        glassLayer?.let { requireGraphicsContext().releaseGraphicsLayer(it) }
        glassLayer = null
        boundEffectKey = null
        clipKey = null
        nodeCoordinates = null
    }

    override fun MeasureScope.measure(
        measurable: Measurable,
        constraints: Constraints
    ): MeasureResult {
        val placeable = measurable.measure(constraints)
        val corner = style.cornerRadius
        return layout(placeable.width, placeable.height) {
            placeable.placeWithLayer(IntOffset.Zero) {
                clip = true
                shape = RoundedCornerShape(corner)
                compositingStrategy = DrawCompositingStrategy.Offscreen
            }
        }
    }

    override fun onGloballyPositioned(coordinates: LayoutCoordinates) {
        if (coordinates.isAttached) {
            nodeCoordinates = coordinates
        }
    }

    override fun ContentDrawScope.draw() {
        val layer = glassLayer
        val backdropCoordinates = backdrop.layerCoordinates
        val coordinates = nodeCoordinates
        val useShader = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !shaderBroken

        if (layer != null && backdropCoordinates != null && coordinates != null &&
            coordinates.isAttached && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
        ) {
            // Kyant: Clamp blur does not pad; the recorded layer is the view
            // size and samples the real backdrop via localPositionOf.
            paddingPx = 0
            bindRenderEffect(layer, useShader)

            val offset = backdropCoordinates.localPositionOf(coordinates, Offset.Zero)
            layer.record(size = IntSize(size.width.toInt(), size.height.toInt())) {
                translate(-offset.x, -offset.y) {
                    drawLayer(backdrop.graphicsLayer)
                }
            }
            layer.topLeft = IntOffset.Zero
            layer.clip = false
            layer.compositingStrategy = CompositingStrategy.Offscreen

            if (useShader) {
                drawLayer(layer)
            } else {
                drawLayer(layer)
                drawSurfaceApproximation()
            }
        } else {
            clipPath(obtainClipPath()) { drawSurfaceApproximation() }
        }

        drawContent()
    }

    @androidx.annotation.RequiresApi(Build.VERSION_CODES.S)
    private fun DrawScope.bindRenderEffect(
        glass: GraphicsLayer,
        useShader: Boolean
    ) {
        val blurPx = style.blurRadius.toPx().coerceAtLeast(0f)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && useShader) {
            try {
                val shader = runtimeShader ?: RuntimeShader(GLASS_SHADER).also {
                    runtimeShader = it
                }
                shader.setFloatUniform("size", size.width, size.height)
                shader.setFloatUniform("padding", paddingPx.toFloat())
                shader.setFloatUniform("cornerRadius", style.cornerRadius.toPx())
                shader.setFloatUniform("density", density)
                shader.setFloatUniform("refractionHeight", style.refractionHeight.toPx())
                shader.setFloatUniform("refractionAmount", style.refractionAmount.toPx())
                shader.setFloatUniform("dispersion", style.dispersion)
                shader.setFloatUniform("contentDarkAlpha", style.contentDarkAlpha)
                shader.setFloatUniform("contentDarkHeight", style.contentDarkHeight.toPx())
                shader.setFloatUniform("highlightGain", style.highlightGain)
                shader.setFloatUniform(
                    "foregroundMaskStop",
                    style.foregroundMaskStop.coerceIn(0.0001f, 1f)
                )
                shader.setFloatUniform("shadow", 0f)
                shader.setFloatUniform("shadowSoftness", style.shadowSoftness)
                val key = ShaderBindKey(
                    width = size.width.toInt(),
                    height = size.height.toInt(),
                    padding = paddingPx,
                    style = style
                )
                if (key != boundEffectKey) {
                    val shaderEffect =
                        android.graphics.RenderEffect.createRuntimeShaderEffect(shader, "content")
                    val effect =
                        if (blurPx > 0.05f) {
                            android.graphics.RenderEffect.createChainEffect(
                                shaderEffect,
                                android.graphics.RenderEffect.createBlurEffect(
                                    blurPx, blurPx, android.graphics.Shader.TileMode.CLAMP
                                )
                            )
                        } else {
                            shaderEffect
                        }
                    glass.renderEffect = effect.asComposeRenderEffect()
                    boundEffectKey = key
                }
                return
            } catch (_: RuntimeException) {
                shaderBroken = true
                boundEffectKey = null
            }
        }

        glass.renderEffect =
            if (blurPx > 0.05f) {
                android.graphics.RenderEffect.createBlurEffect(
                    blurPx, blurPx, android.graphics.Shader.TileMode.CLAMP
                ).asComposeRenderEffect()
            } else {
                null
            }
    }

    private fun DrawScope.obtainClipPath(): Path {
        val corner = style.cornerRadius.toPx()
            .coerceAtMost(minOf(size.width, size.height) / 2f)
        val key = ClipKey(size, corner)
        if (key != clipKey) {
            clipKey = key
            clipPath.reset()
            clipPath.addRoundRect(
                RoundRect(0f, 0f, size.width, size.height, CornerRadius(corner, corner))
            )
        }
        return clipPath
    }

    /** Approximation for devices without RuntimeShader support. */
    private fun DrawScope.drawSurfaceApproximation() {
        val radius = style.cornerRadius.toPx()
            .coerceAtMost(minOf(size.width, size.height) / 2f)
        drawRoundRect(
            color = Color.White.copy(alpha = 0.10f),
            cornerRadius = CornerRadius(radius, radius)
        )
        if (style.contentDarkAlpha > 0f) {
            drawRect(
                brush = Brush.verticalGradient(
                    0f to Color.Black.copy(alpha = style.contentDarkAlpha),
                    1f to Color.Transparent,
                    endY = style.contentDarkHeight.toPx()
                ),
                size = Size(size.width, style.contentDarkHeight.toPx())
            )
        }
        drawRoundRect(
            brush = Brush.verticalGradient(
                0f to Color.White.copy(alpha = 0.35f),
                0.5f to Color.White.copy(alpha = 0.05f),
                1f to Color.White.copy(alpha = 0.25f)
            ),
            cornerRadius = CornerRadius(radius, radius),
            style = Stroke(width = 1.dp.toPx())
        )
    }

}
