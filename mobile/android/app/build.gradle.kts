plugins {
    id("com.android.application")
    id("dev.flutter.flutter-gradle-plugin")
    id("kotlin-android")
}

android {
    namespace = "com.pamtechz.store_marketplace"
    
    // Target SDK 36 (Android 16) for Google Play Compliance
    compileSdk = 36
    ndkVersion = "26.1.10909125" // NDK r26+ for 16 KB page-size alignment

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.pamtechz.store_marketplace"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"

        // 16 KB Page Alignment linker flags for native binary compliance (.so files)
        externalNativeBuild {
            cmake {
                cppFlags("")
                arguments("-DCMAKE_SHARED_LINKER_FLAGS=-Wl,-z,max-page-size=16384")
            }
        }
    }

    packaging {
        jniLibs {
            useLegacyPackaging = false
            pickFirsts += listOf("**/*.so")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
