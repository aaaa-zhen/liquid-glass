package io.github.aaaazhen.liquidglass

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.neverEqualPolicy
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.node.DrawModifierNode
import androidx.compose.ui.node.GlobalPositionAwareModifierNode
import androidx.compose.ui.node.ModifierNodeElement
import androidx.compose.ui.node.invalidateDraw
import androidx.compose.ui.platform.InspectorInfo
import androidx.compose.ui.unit.IntSize

/**
 * Shared capture of the content glass elements float above. Attach it to the
 * background with [liquidGlassBackdrop]; any number of [liquidGlass] nodes can
 * then sample it.
 */
@Stable
class LiquidGlassBackdrop internal constructor(
    internal val graphicsLayer: GraphicsLayer
) {
    internal var layerCoordinates: LayoutCoordinates? by mutableStateOf(null, neverEqualPolicy())
}

@Composable
fun rememberLiquidGlassBackdrop(): LiquidGlassBackdrop {
    val graphicsLayer = rememberGraphicsLayer()
    return remember(graphicsLayer) { LiquidGlassBackdrop(graphicsLayer) }
}

/**
 * Records this node's content into [backdrop] every frame, in addition to
 * drawing it normally. Apply to the background that should show through the
 * glass; glass elements must be siblings above it, not children.
 */
fun Modifier.liquidGlassBackdrop(backdrop: LiquidGlassBackdrop): Modifier =
    this then LiquidGlassBackdropElement(backdrop)

private class LiquidGlassBackdropElement(
    val backdrop: LiquidGlassBackdrop
) : ModifierNodeElement<LiquidGlassBackdropNode>() {

    override fun create(): LiquidGlassBackdropNode = LiquidGlassBackdropNode(backdrop)

    override fun update(node: LiquidGlassBackdropNode) {
        if (node.backdrop != backdrop) {
            node.backdrop.layerCoordinates = null
            node.backdrop = backdrop
        }
        node.invalidateDraw()
    }

    override fun InspectorInfo.inspectableProperties() {
        name = "liquidGlassBackdrop"
        properties["backdrop"] = backdrop
    }

    override fun equals(other: Any?): Boolean =
        other is LiquidGlassBackdropElement && other.backdrop == backdrop

    override fun hashCode(): Int = backdrop.hashCode()
}

private class LiquidGlassBackdropNode(
    var backdrop: LiquidGlassBackdrop
) : DrawModifierNode, GlobalPositionAwareModifierNode, Modifier.Node() {

    override fun ContentDrawScope.draw() {
        backdrop.graphicsLayer.record(
            size = IntSize(size.width.toInt(), size.height.toInt())
        ) {
            this@draw.drawContent()
        }
        drawLayer(backdrop.graphicsLayer)
    }

    override fun onGloballyPositioned(coordinates: LayoutCoordinates) {
        if (coordinates.isAttached) {
            backdrop.layerCoordinates = coordinates
        }
    }

    override fun onDetach() {
        backdrop.layerCoordinates = null
    }
}
