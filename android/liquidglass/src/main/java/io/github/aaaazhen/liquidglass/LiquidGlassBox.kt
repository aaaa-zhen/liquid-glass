package io.github.aaaazhen.liquidglass

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier

/**
 * A box that draws the liquid-glass material behind [content]. Size it
 * with the usual layout modifiers (`size`, `fillMaxWidth`, padding);
 * children are composed on top of the glass and are not part of the
 * refraction (same split as the Web demo's DOM overlay).
 */
@Composable
fun LiquidGlass(
    backdrop: LiquidGlassBackdrop,
    modifier: Modifier = Modifier,
    style: LiquidGlassStyle = LiquidGlassStyle(),
    contentAlignment: Alignment = Alignment.Center,
    content: @Composable BoxScope.() -> Unit
) {
    Box(
        modifier = modifier.liquidGlass(backdrop, style),
        contentAlignment = contentAlignment,
        content = content
    )
}
