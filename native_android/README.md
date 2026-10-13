# VOP native Android (Flutter)

This directory is a **real Flutter/Android app**, not a Tauri,
Capacitor, or React-DOM wrapper. Individual publisher-authorized media
players may use embedded WebViews inside native Flutter screens.

Existing VOP Android Capacitor sources remain in the repository's root
`android/` directory for transition/rollback. This independent native
application targets the Android package **`com.sda.vop`**, the same logical
app ID as the legacy Android package. Install only one signed app for that ID.

## Architecture and implemented scope

- Flutter Material 3 UI; Firebase Authentication for the existing VOP account.
- Firebase ID tokens sent only to a configured **HTTPS VOP API origin**.
- `GET /api/mobile?resource=bootstrap|catalog|guide|lesson|progress|announcements`.
- Server-side tenant-scoped, published-only catalogue and lesson projections.
- The same backend endpoints for completing lessons, saving page positions,
  starting/submitting quizzes, and mentor conversations as the web app.
- Rich Plate/Slate study-page rendering (text styles, basic lists, quotes,
  images, media links, and read-only merged table layouts).
- Responsive native navigation, loading, refresh and errors.

**Important scope:** The learner app now includes a native radio viewer,
certificate viewing, account-security controls and conditional Android passkeys,
plus encrypted offline reading and saved assessment drafts with server-verified
sync. It is **not** yet feature-for-feature parity with the web, organisation,
or Super Admin experiences. Offline audio/video downloads, brand-new offline
quiz attempts, production signing, complete payments/gameplay parity, and
physical-device security verification are not implied by a successful CI build.
Do not market the current build as full parity.

The Android app intentionally does not send private quiz keys, mark
assessments locally, create certificates locally or bypass organisation
subscription entitlements.

## Requirements

1. Flutter stable SDK, Android SDK/Android Studio, Java/JDK, and an emulator
   or an Android phone with USB debugging enabled.
2. An existing VOP Firebase Android application registration with Android
   package `com.sda.vop`. For native Google sign-in add your release/debug
   signing SHA-1/SHA-256 fingerprints to the Firebase Android app and configure
   the Google OAuth Web Client ID if needed.
3. Public Firebase Android client values: API key, Android app ID, sender ID,
   project ID. These are not service-account keys.
4. A deployed VOP backend with `/api/mobile` and existing secured endpoints.

## Windows PowerShell

From `native_android`:

```powershell
# Existing android/app/google-services.json is automatically reused.
# Optional: copy the example env if using a different Firebase app/origin.
flutter doctor
flutter devices
.\run_android.ps1
# Or select a connected device:
.\run_android.ps1 -DeviceId "YOUR_DEVICE_ID"
```

`run_android.ps1` generates the standard Android Gradle files with:

```powershell
flutter create --platforms=android --org com.sda --project-name vop .
```

The script automatically reads the existing public Android Firebase client
from `../android/app/google-services.json` when no local env file is supplied,
then runs `flutter pub get` and the native app with `--dart-define`. This
existing client is registered for `com.sda.vop`.
To override the server origin or Firebase public client, create
`Vop_Android_Config.env` from the example. Android's `INTERNET` permission,
backup protections and cleartext-traffic restrictions are checked into
`android/app/src/main/AndroidManifest.xml`.

## Windows device build: repairing share_plus

If the Android build reports `Unresolved reference 'ShareSuccessManager'` or
`'SharePlusPendingIntent'` during `:share_plus:compileDebugKotlin`, the native
app's Dart source is not the failing compilation unit. A damaged hosted Pub
package or stale Kotlin incremental build can produce those errors even if CI
succeeds.

From PowerShell inside `native_android`:

```powershell
flutter clean
dart pub cache repair
flutter pub get
.\run_android.ps1 -DeviceId "YOUR_DEVICE_ID"
```

The native runner now checks the cached `share_plus` Kotlin sources before
starting Gradle. If required source files are missing, it re-downloads *only*
the verified hosted `share_plus` package and cleans generated outputs. When
all files are present but a local incremental Kotlin build is suspected,
request the same scoped repair explicitly:

```powershell
.\run_android.ps1 -RepairSharePlus -DeviceId "YOUR_DEVICE_ID"
```

Run `flutter devices` for the actual device ID; do not assume the marketed
Samsung model is the adb ID. Repair never modifies the Android SDK, your
Firebase settings, or any project source. The Flutter `android.builtInKotlin`
compatibility flag should be changed only after verifying that **all**
Android plugins support the target migration.

The SDK XML schema warning is distinct from Kotlin compilation and typically
indicates different Android Studio and command-line-tools release dates.
Synchronize SDK tools through Android Studio separately if it persists.

## Android Kotlin Gradle Plugin compatibility

The native application uses `share_plus: ^13.3.1` and `SharePlus.instance.share` with
the newer plugin implementation, which supports Flutter's built-in Kotlin
migration. This also requires a current Dart SDK (>=3.10), Flutter toolchain,
Android Gradle Plugin and Kotlin version. Run `flutter pub get` and rebuild
after upgrading Flutter. If an old `share_plus` warning persists on a developer
computer, run `flutter clean`, `flutter pub get`, then recreate generated
Android files from the documented native workflow. Do **not** globally
suppress Kotlin warnings or override Gradle metadata to hide an incompatible
plugin. CI builds a debug APK but production signing and real-device
credential-manager verification are still separate release requirements.
The app's `MainActivity` must remain a `FlutterFragmentActivity` for Android
biometric integration. Regenerate the Gradle scaffold using the documented
Flutter toolchain rather than replacing it with stale checked-in generated
files or release builds configured with debug signing.

## Native biometric scope

The Android Security screen uses the operating system biometric/device-lock
prompt as a local step before private account exports, account-deletion requests
and global sign-out. Server-side Firebase recent-login requirements still apply.
Passkey enrollment and passwordless sign-in use a separate Android Credential
Manager flow. They are enabled only after signed-app certificate trust, the
VOP domain association, and server-side WebAuthn verification are configured
and independently verified as described below.

## Build an APK

After one-time Flutter scaffold generation, from `native_android`:

```powershell
flutter analyze
flutter test
python tool/prepare_public_config.py
flutter build apk --debug --dart-define-from-file=android-public-config.json
```

The Python helper derives the JSON from the registered Firebase Android
client. It contains public Firebase client identifiers only and is ignored by
Git. Never commit the generated file or private credentials. A release build requires Android signing credentials and a configured
Firebase Android OAuth registration; a CI-generated debug APK is for testing
only and must not be confused with a Play Store release.

CI workflow `VOP native Android` runs static analysis, widget tests and an
Android debug APK compilation. It uploads `vop-native-debug-apk` as an
Actions artifact. The CI-built debug APK uses VOP's existing public Firebase Android registration;
Google OAuth still requires the Android debug signing fingerprints to be
registered. A debug APK is not a signed production release.

## Android release signing

A `flutter build apk --debug` build remains available without a production
keystore. Release targets will **not** silently use a debug certificate.
Copy `android/key.properties.example` to the ignored
`android/key.properties`, provide the local path and credentials for your
release/upload keystore, and then run `flutter build appbundle --release`
when ready for distribution. Do not commit credentials or the keystore.
For Play App Signing, register the **Play app signing certificate**
fingerprint (not just an upload or debug key) for Android passkey verification.

## Native passkeys (Android)

VOP now uses Android's Credential Manager through the `passkeys` Flutter package.
Registration and sign-in use the existing server-owned WebAuthn challenges,
signature/UV verification and Firebase custom tokens. Fingerprints, PINs and
face unlock are verified by the device, not uploaded to VOP.

Native passkeys are **disabled until the server trusts the Android signing
certificate**. To enable them for a release:

1. Obtain the SHA-256 fingerprint of the certificate actually signing the app.
   For Play releases use **Play App Signing**, which can differ from an upload key.
2. Add the exact certificate fingerprint to
   `public/.well-known/assetlinks.json`, under
   `delegate_permission/common.get_login_creds` for `com.sda.vop`.
3. Set the production **server-only** variable
   `PASSKEY_ANDROID_SHA256_FINGERPRINTS` to the same colon-separated SHA-256
   fingerprint. Configure multiple values as a comma-separated list only when
   each certificate is independently trusted. Optionally set
   `VOP_ANDROID_PACKAGE_NAME=com.sda.vop`.
4. Verify `https://vopafrica.vercel.app/.well-known/assetlinks.json` is
   publicly accessible via HTTPS as JSON with no redirect, then deploy the
   updated server and asset links.
5. On a signed physical Android device, sign in with Google/password, open
   Account Security, enroll a passkey, sign out, then sign back in with the
   passkey. Verify a wrong certificate, different account and replayed
   WebAuthn challenges are rejected.

A CI debug APK is signed with a different debug certificate and will not
necessarily have the release signing fingerprint. Do not add unknown debug
certificates to production trust just to make testing pass; use a controlled
test environment and separately configured trust.

If a signing certificate is not configured, the native passkey setup/sign-in
flow stops **before** showing the OS credential prompt and keeps Google and
password sign-in available.

## Mobile API contract (v1)

All reads require `Authorization: Bearer <Firebase ID token>` and return
`Cache-Control: private, no-store`; the server verifies membership, tenant
ownership and publication. The API returns only whitelisted DTOs, not raw
Firestore snapshots or quiz answer banks.

- `GET /api/mobile?resource=bootstrap`: current session/profile metadata.
- `GET /api/mobile?resource=catalog`: accessible published guides/programs.
- `GET /api/mobile?resource=guide&guideId=...`: guide plus published lesson summaries.
- `GET /api/mobile?resource=lesson&guideId=...&lessonId=...`: sanitized study pages.
- `GET /api/mobile?resource=progress`: current user's completed lessons and resume positions.
- `GET /api/mobile?resource=announcements`: accessible published announcements.

Mutations reuse:
`POST /api/study/progress`, `POST /api/mentorship`,
`POST /api/engagement`, and `POST /api/share`.

The API lives in `api_handlers/admin/mobile.ts` and is dispatched via
`api/admin.ts` and `vercel.json` to avoid allocating another Vercel
serverless function.

## Before production release

Check profile/onboarding access for new accounts, membership changes,
offline trust/consent, notification permissions, registration and deep links,
app signing and Play Integrity, crash reporting, accessibility, localization,
right-to-left layout, actual-device performance and parity against every
web module. Never silently award progress while offline.
