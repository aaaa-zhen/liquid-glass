package io.github.aaaazhen.liquidglass.demo

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import io.github.aaaazhen.liquidglass.LiquidGlass
import io.github.aaaazhen.liquidglass.LiquidGlassBackdrop
import io.github.aaaazhen.liquidglass.LiquidGlassStyle
import io.github.aaaazhen.liquidglass.demo.ui.theme.LiquidglassTheme
import io.github.aaaazhen.liquidglass.liquidGlassBackdrop
import io.github.aaaazhen.liquidglass.rememberLiquidGlassBackdrop

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.statusBars())
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        setContent {
            LiquidglassTheme {
                GlassDemoScreen()
            }
        }
    }
}

@Composable
fun GlassDemoScreen() {
    val backdrop = rememberLiquidGlassBackdrop()

    var widthPct by remember { mutableFloatStateOf(96f) }
    var heightPct by remember { mutableFloatStateOf(17f) }
    var cornerPct by remember { mutableFloatStateOf(69f) }
    var blur by remember { mutableFloatStateOf(5f) }
    var refraction by remember { mutableFloatStateOf(80f) }
    var refractionHeight by remember { mutableFloatStateOf(26f) }
    var dispersion by remember { mutableFloatStateOf(0.49f) }
    var contentDark by remember { mutableFloatStateOf(1f) }
    var contentDarkHeight by remember { mutableFloatStateOf(341f) }
    var highlightGain by remember { mutableFloatStateOf(0.67f) }
    var foregroundStop by remember { mutableFloatStateOf(1f) }
    var shadow by remember { mutableFloatStateOf(0.47f) }
    var shadowSoft by remember { mutableFloatStateOf(1.86f) }
    var backdropKind by remember { mutableStateOf(BackdropKind.Wallpaper) }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        DemoBackdrop(
            kind = backdropKind,
            modifier = Modifier
                .fillMaxSize()
                .liquidGlassBackdrop(backdrop)
        )

        val capsuleW = maxWidth * (widthPct / 100f)
        val capsuleH = maxHeight * (heightPct / 100f)
        val capsuleCorner = minOf(capsuleW, capsuleH) * 0.5f * (cornerPct / 100f)

        LiquidGlass(
            backdrop = backdrop,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 12.dp)
                .width(capsuleW)
                .height(capsuleH)
                .clipToBounds(),
            style = LiquidGlassStyle(
                cornerRadius = capsuleCorner,
                blurRadius = blur.dp,
                refractionHeight = refractionHeight.dp,
                refractionAmount = refraction.dp,
                dispersion = dispersion,
                contentDarkAlpha = contentDark,
                contentDarkHeight = contentDarkHeight.dp,
                highlightGain = highlightGain,
                foregroundMaskStop = foregroundStop,
                shadow = shadow,
                shadowSoftness = shadowSoft
            ),
            contentAlignment = Alignment.Center
        ) {}

        ControlPanel(
            backdrop = backdrop,
            widthPct = widthPct, onWidth = { widthPct = it },
            heightPct = heightPct, onHeight = { heightPct = it },
            cornerPct = cornerPct, onCorner = { cornerPct = it },
            blur = blur, onBlur = { blur = it },
            refraction = refraction, onRefraction = { refraction = it },
            refractionHeight = refractionHeight, onRefractionHeight = { refractionHeight = it },
            dispersion = dispersion, onDispersion = { dispersion = it },
            contentDark = contentDark, onContentDark = { contentDark = it },
            contentDarkHeight = contentDarkHeight, onContentDarkHeight = { contentDarkHeight = it },
            highlightGain = highlightGain, onHighlightGain = { highlightGain = it },
            foregroundStop = foregroundStop, onForegroundStop = { foregroundStop = it },
            shadow = shadow, onShadow = { shadow = it },
            shadowSoft = shadowSoft, onShadowSoft = { shadowSoft = it },
            backdropKind = backdropKind, onBackdropKind = { backdropKind = it },
            onApplyPreset = { preset ->
                blur = preset.blurRadius.value
                refraction = preset.refractionAmount.value
                refractionHeight = preset.refractionHeight.value
                dispersion = preset.dispersion
                contentDark = preset.contentDarkAlpha
                contentDarkHeight = preset.contentDarkHeight.value
                highlightGain = preset.highlightGain
                foregroundStop = preset.foregroundMaskStop
                shadow = preset.shadow
                shadowSoft = preset.shadowSoftness
            }
        )
    }
}

@Composable
private fun BoxScope.ControlPanel(
    backdrop: LiquidGlassBackdrop,
    widthPct: Float, onWidth: (Float) -> Unit,
    heightPct: Float, onHeight: (Float) -> Unit,
    cornerPct: Float, onCorner: (Float) -> Unit,
    blur: Float, onBlur: (Float) -> Unit,
    refraction: Float, onRefraction: (Float) -> Unit,
    refractionHeight: Float, onRefractionHeight: (Float) -> Unit,
    dispersion: Float, onDispersion: (Float) -> Unit,
    contentDark: Float, onContentDark: (Float) -> Unit,
    contentDarkHeight: Float, onContentDarkHeight: (Float) -> Unit,
    highlightGain: Float, onHighlightGain: (Float) -> Unit,
    foregroundStop: Float, onForegroundStop: (Float) -> Unit,
    shadow: Float, onShadow: (Float) -> Unit,
    shadowSoft: Float, onShadowSoft: (Float) -> Unit,
    backdropKind: BackdropKind, onBackdropKind: (BackdropKind) -> Unit,
    onApplyPreset: (LiquidGlassStyle) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }

    LiquidGlass(
        backdrop = backdrop,
        modifier = Modifier
            .align(Alignment.BottomCenter)
            .navigationBarsPadding()
            .padding(horizontal = 14.dp, vertical = 10.dp)
            .fillMaxWidth(),
        style = LiquidGlassStyle(
            cornerRadius = 26.dp,
            blurRadius = 8.dp,
            refractionAmount = 32.dp,
            contentDarkAlpha = 0.35f,
            contentDarkHeight = 120.dp,
            shadow = 0.6f
        )
    ) {
        Column(Modifier.padding(horizontal = 18.dp, vertical = 10.dp)) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Settings",
                    color = Color.White,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .weight(1f)
                        .clickable { expanded = !expanded }
                )
                Text(
                    backdropKind.label(),
                    color = Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier
                        .clickable { onBackdropKind(backdropKind.next()) }
                        .padding(horizontal = 12.dp, vertical = 4.dp)
                )
                Text(
                    if (expanded) "收起" else "展开",
                    color = Color.White.copy(alpha = 0.7f),
                    fontSize = 13.sp,
                    modifier = Modifier.clickable { expanded = !expanded }
                )
            }
            AnimatedVisibility(
                visible = expanded,
                enter = expandVertically(),
                exit = shrinkVertically()
            ) {
                Column(
                    Modifier
                        .heightIn(max = 420.dp)
                        .verticalScroll(rememberScrollState())
                ) {
                    Row(
                        Modifier.padding(bottom = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            "Default",
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier
                                .clickable { onApplyPreset(LiquidGlassStyle.Default) }
                                .padding(end = 16.dp, top = 4.dp, bottom = 4.dp)
                        )
                        Text(
                            "铬",
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier
                                .clickable { onApplyPreset(LiquidGlassStyle.Chrome) }
                                .padding(top = 4.dp, bottom = 4.dp)
                        )
                    }
                    ParamSlider("Width", widthPct, 28f..150f, onWidth)
                    ParamSlider("Height", heightPct, 12f..45f, onHeight)
                    ParamSlider("Corner", cornerPct, 50f..100f, onCorner)
                    ParamSlider("Blur", blur, 0f..30f, onBlur)
                    ParamSlider("Refract", refraction, 0f..140f, onRefraction)
                    ParamSlider("Refract H", refractionHeight, 0f..48f, onRefractionHeight)
                    ParamSlider("Dispersion", dispersion, 0f..1f, onDispersion)
                    ParamSlider("Dark top", contentDark, 0f..1f, onContentDark)
                    ParamSlider("Dark H", contentDarkHeight, 0f..512f, onContentDarkHeight)
                    ParamSlider("Highlight", highlightGain, 0f..3f, onHighlightGain)
                    ParamSlider("FG stop", foregroundStop, 0.2f..1f, onForegroundStop)
                    ParamSlider("Shadow", shadow, 0f..1f, onShadow)
                    ParamSlider("Shadow soft", shadowSoft, 0.25f..3f, onShadowSoft)
                }
            }
        }
    }
}

@Composable
private fun ParamSlider(
    label: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    onChange: (Float) -> Unit
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            label,
            color = Color.White.copy(alpha = 0.85f),
            fontSize = 12.sp,
            modifier = Modifier.width(88.dp)
        )
        Slider(
            value = value,
            onValueChange = onChange,
            valueRange = range,
            modifier = Modifier
                .weight(1f)
                .height(32.dp),
            colors = SliderDefaults.colors(
                thumbColor = Color.White,
                activeTrackColor = Color.White.copy(alpha = 0.9f),
                inactiveTrackColor = Color.White.copy(alpha = 0.25f)
            )
        )
        Text(
            if (range.endInclusive <= 3f) "%.2f".format(value) else "%.0f".format(value),
            color = Color.White.copy(alpha = 0.7f),
            fontSize = 12.sp,
            textAlign = TextAlign.End,
            modifier = Modifier.width(40.dp)
        )
    }
}
