# VOP native Android (Flutter)

This directory is a **real Flutter/Android app**. It does not use Tauri,
Capacitor, a WebView, or a copy of the React DOM.

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

**Important scope:** This is the Android learner app first implementation,
not yet a feature-by-feature reproduction of the organisation and Super Admin
editor, all games, radio, certificates, payments, passkeys or offline
synchronisation. Those modules require their own native UI, API contract,
permission/security tests and device verification. Do not market the current
build as full parity.

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
Copy-Item Vop_Android_Config.example.env Vop_Android_Config.env
# Fill in the public Firebase Android client configuration in the file.
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

The script then runs `flutter pub get` and the native application with
public values provided as `--dart-define`. Android's `INTERNET` permission,
backup protections and cleartext-traffic restrictions are checked into
`android/app/src/main/AndroidManifest.xml`.

## Build an APK

After one-time Flutter scaffold generation, from `native_android`:

```powershell
flutter analyze
flutter test
flutter build apk --debug --dart-define-from-file=android-config.json
```

The JSON file must contain the same public Dart defines from the example env
file, with JSON key/value pairs and no private credentials. Never commit that
file. A release build requires Android signing credentials and a configured
Firebase Android OAuth registration; a CI-generated debug APK is for testing
only and must not be confused with a Play Store release.

CI workflow `VOP native Android` runs static analysis, widget tests and an
Android debug APK compilation. It uploads `vop-native-debug-apk` as an
Actions artifact. Its placeholder Firebase public values only test compilation;
they cannot authenticate against production.

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
