package io.github.aaaazhen.liquidglass.demo

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

enum class BackdropKind {
    Wallpaper,
    Checker,
    News
}

fun BackdropKind.label(): String = when (this) {
    BackdropKind.Wallpaper -> "壁纸"
    BackdropKind.Checker -> "方格"
    BackdropKind.News -> "新闻"
}

fun BackdropKind.next(): BackdropKind = when (this) {
    BackdropKind.Wallpaper -> BackdropKind.Checker
    BackdropKind.Checker -> BackdropKind.News
    BackdropKind.News -> BackdropKind.Wallpaper
}

@Composable
fun DemoBackdrop(
    kind: BackdropKind,
    modifier: Modifier = Modifier
) {
    when (kind) {
        BackdropKind.Wallpaper -> {
            Image(
                painter = painterResource(R.drawable.demo_wallpaper_gold),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = modifier.fillMaxSize()
            )
        }
        BackdropKind.Checker -> CheckerBackdrop(modifier)
        BackdropKind.News -> NewsBackdrop(modifier)
    }
}

@Composable
private fun CheckerBackdrop(modifier: Modifier) {
    val motion = rememberInfiniteTransition(label = "checker")
    val pass by motion.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(12_000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "pass"
    )
    Canvas(modifier.fillMaxSize()) {
        val cell = 92.dp.toPx()
        val shiftY = pass * cell * 2f
        val cols = (size.width / cell).toInt() + 2
        val rows = (size.height / cell).toInt() + 4
        val light = Color(0xFFF4F4F4)
        val dark = Color(0xFF111111)
        for (row in -1..rows) {
            for (col in 0..cols) {
                drawRect(
                    color = if ((col + row) and 1 == 0) dark else light,
                    topLeft = Offset(col * cell, row * cell - shiftY),
                    size = Size(cell + 1f, cell + 1f)
                )
            }
        }
    }
}

private data class NewsLine(
    val kicker: String,
    val title: String,
    val time: String
)

private val NewsLines = listOf(
    NewsLine("WORLD", "Golden Gate Bridge to close two lanes overnight", "2m ago"),
    NewsLine("科技", "苹果秋季发布会定档九月 新机外观再引猜测", "5m ago"),
    NewsLine("MARKETS", "Yields ease as futures point to a higher open", "8m ago"),
    NewsLine("本地", "香洲今夜有强对流 气象台发布暴雨黄色预警", "12m ago"),
    NewsLine("CULTURE", "The bridge is painted a color known as International Orange", "18m ago"),
    NewsLine("体育", "国家队热身赛今晚开战 首发名单刚刚公布", "21m ago"),
    NewsLine("SCIENCE", "Researchers map the oldest light still reaching Earth", "27m ago"),
    NewsLine("财经", "人民币汇率午后走强 北向资金净流入超百亿", "33m ago"),
    NewsLine("DESIGN", "Liquid glass is easiest to read against hard type edges", "41m ago"),
    NewsLine("社会", "高铁晚高峰加开临客 热门方向仍一票难求", "48m ago"),
    NewsLine("PHOTO", "Fog pours through the strait and breaks on the towers", "55m ago"),
    NewsLine("评论", "城市需要更多可走的岸线 而不是更多的围栏", "1h ago")
)

@Composable
private fun NewsBackdrop(modifier: Modifier) {
    val motion = rememberInfiniteTransition(label = "news")
    val pass by motion.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(22_000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "pass"
    )
    var columnH by remember { mutableIntStateOf(0) }
    Box(
        modifier
            .fillMaxSize()
            .clipToBounds()
            .background(Color(0xFF0B0B0C))
    ) {
        val shift = if (columnH == 0) 0f else pass * columnH
        NewsColumn(
            Modifier
                .fillMaxWidth()
                .onSizeChanged { columnH = it.height }
                .graphicsLayer { translationY = -shift }
        )
        if (columnH > 0) {
            NewsColumn(
                Modifier
                    .fillMaxWidth()
                    .graphicsLayer { translationY = columnH - shift }
            )
        }
    }
}

@Composable
private fun NewsColumn(modifier: Modifier) {
    Column(
        modifier
            .background(Color(0xFF0B0B0C))
            .padding(horizontal = 22.dp, vertical = 28.dp)
    ) {
        NewsLines.forEachIndexed { index, line ->
            if (index > 0) {
                Spacer(
                    Modifier
                        .padding(vertical = 16.dp)
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(Color(0xFF2A2A2C))
                )
            }
            Text(
                line.kicker,
                color = Color(0xFFFFB38A),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.2.sp
            )
            Spacer(Modifier.height(6.dp))
            Text(
                line.title,
                color = Color(0xFFF5F5F5),
                fontSize = 26.sp,
                fontWeight = FontWeight.SemiBold,
                lineHeight = 32.sp
            )
            Spacer(Modifier.height(8.dp))
            Text(
                line.time,
                color = Color(0xFF9A9A9E),
                fontSize = 13.sp
            )
        }
    }
}
