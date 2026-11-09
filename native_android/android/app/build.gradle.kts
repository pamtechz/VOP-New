import java.util.Properties

plugins {
    id("com.android.application")
    id("dev.flutter.flutter-gradle-plugin")
}

val releaseKeyPropertiesFile = rootProject.file("key.properties")
val releaseKeyProperties = Properties()
if (releaseKeyPropertiesFile.isFile) {
    releaseKeyPropertiesFile.inputStream().use { releaseKeyProperties.load(it) }
}
val requestedRelease = gradle.startParameter.taskNames.any {
    it.contains("Release", ignoreCase = true)
}
val compressNativeLibraries = providers.gradleProperty("vopCompressNativeLibraries")
    .map { it.toBooleanStrict() }.getOrElse(false)
if (requestedRelease) {
    logger.lifecycle("VOP native library compression requested: $compressNativeLibraries")
}
if (requestedRelease && !releaseKeyPropertiesFile.isFile) {
    throw GradleException(
        "Android release signing is not configured. " +
        "Provide ignored android/key.properties with the release keystore credentials."
    )
}

android {
    namespace = "com.sda.vop"
    // Google Play requires API 36+ for app updates as of August 2026.
    compileSdk = maxOf(36, flutter.compileSdkVersion)
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.sda.vop"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        // Fail at build time if the runner lacks the Android 16 SDK.
        targetSdk = 36
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (releaseKeyPropertiesFile.isFile) {
            create("release") {
                keyAlias = releaseKeyProperties.getProperty("keyAlias")
                    ?: throw GradleException("Release keyAlias is missing.")
                keyPassword = releaseKeyProperties.getProperty("keyPassword")
                    ?: throw GradleException("Release keyPassword is missing.")
                storePassword = releaseKeyProperties.getProperty("storePassword")
                    ?: throw GradleException("Release storePassword is missing.")
                val location = releaseKeyProperties.getProperty("storeFile")
                    ?: throw GradleException("Release storeFile is missing.")
                storeFile = rootProject.file(location).also {
                    if (!it.isFile) {
                        throw GradleException("The configured release keystore was not found.")
                    }
                }
            }
        }
    }

    packaging {
        jniLibs {
            // Compress native libraries for direct APK downloads when requested.
            // Play bundles retain their normal packaging for store delivery.
            useLegacyPackaging = compressNativeLibraries
        }
    }

    buildTypes {
        getByName("release") {
            // Shrink unused Java/Kotlin code and Android resources.
            isMinifyEnabled = true
            isShrinkResources = true
            if (releaseKeyPropertiesFile.isFile) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}

// Set the APK variant property consumed by packaging tasks as well as the DSL.
androidComponents {
    onVariants(selector().withBuildType("release")) { variant ->
        variant.packaging.jniLibs.useLegacyPackaging.set(compressNativeLibraries)
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
