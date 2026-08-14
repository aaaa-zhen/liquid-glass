plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "io.github.aaaazhen.liquidglass"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        // Effects degrade by capability: blur needs RenderEffect (API 31+),
        // refraction/dispersion need RuntimeShader (API 33+). Below that the
        // modifier draws a plain translucent fill so layouts stay usable.
        minSdk = 24
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
}
