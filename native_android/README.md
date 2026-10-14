# VOP Flutter learner app — Android and browser

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


## Run this Flutter learner app in a browser (same Flutter UI, not the Vite portal)

The Android and web previews use the **same Flutter screens**. This is
different from opening the deployed React/Vite VOP site in Chrome. The
Flutter web preview is intended for learner UI validation on a desktop
or phone browser; it does not imply that every Android-only capability
can be reproduced by a browser.

VOP imports PUBLIC Firebase web client settings from your linked Vercel
`vop-new` project (`VITE_FIREBASE_API_KEY`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`,
`VITE_FIREBASE_AUTH_DOMAIN`). The Firebase web app ID is **not**
the Android app ID. No Firebase Admin credentials, signing keys or payment
secrets are exported to Flutter. The Vercel CLI temporarily downloads the
environment into a randomly named OS temporary file, filters only the
public allowlist, and removes it.

On a trusted Windows development machine, first link Vercel (only once):

    cd "C:\Users\user\Pictures\VOP New"
    vercel login
    vercel link --project vop-new

Then start the Flutter UI in its stable web-server mode:

    .\run_web.ps1
    # Open http://127.0.0.1:7357 in Chrome/Edge/Firefox/Safari

Optional modes:

    .\run_web.ps1 -ChromeInspector
    .\run_web.ps1 -ShareOnNetwork
    .\run_web.ps1 -WebPort 7358
    .\run_web.ps1 -VercelEnvironment preview
    .\run_web.ps1 -ConfigPath ".\native_android\Vop_Web_Config.env"
    .\run_web.ps1 -ApiBaseUrl "https://your-approved-vop-api.example"

`-ChromeInspector` enables the browser-specific Flutter DWDS
debugger, but may show execution-context warnings after reloads; it is not
the default. `-ShareOnNetwork` binds Flutter's web preview
to the LAN and prints possible phone URLs. Use **only trusted private
Wi-Fi**. Phone IP-based HTTP origins may be denied by Firebase Google
OAuth and browser secure-context APIs. Do not expose the development port
to the public internet. Keep the terminal open; Ctrl+C stops the server.

**Browser API limitation:** the Flutter web preview and production VOP
backend are different origins. The backend's CORS policy must explicitly
authorize the development origin for authenticated API requests; otherwise
sign-in might work, but protected data can fail to load with browser CORS
errors. VOP never disables TLS/certificate validation or exposes server
secrets as a workaround. For production, a same-origin deployment or
approved API CORS policy is required.

**Platform boundaries:** email/password and Google Firebase popup sign-in
use the browser's registered Firebase app and require its authorized
domain. Native Android passkeys/biometric identity verification, sensitive
account actions requiring that verification, and encrypted offline study
downloads are **not** silently emulated with insecure browser storage.
Live online study, learner navigation, translation, programmes and
approved provider iframe media remain shared. Provider embedding rules
(YouTube/AudioVerse/etc.) remain in force. Android offline functionality
and native hardware security must still be tested on real devices.

The web directory is tracked at `native_android/web/`;
if web platform files are missing, the launcher generates the standard
Flutter scaffold with `flutter create --platforms=web`.
CI compiles a separate Flutter browser artifact as well as the Android APK.
The default port can be customized with `-WebPort`.

## Run the SAME Flutter learner app in a browser

The same Dart/Flutter learner application can be run on Android or as Flutter
Web. This is NOT a redirect to the existing VOP React web portal.

The root-level PowerShell launcher defaults to a `web-server` on port 7357,
which avoids the Chrome DWDS/AppInspector execution-context churn.
If port 7357 is already occupied, the launcher checks approved fallback ports
7358 and 7359 **before** downloading Vercel settings or launching Flutter.
It chooses the first available port, reports the exact address, and never
terminates another process. An explicitly requested `-WebPort` fails with
an actionable message if that port cannot be bound; explicit port selections
are never silently changed. This eliminates the Windows socket error 10048
caused by a listener already using the default port. A port might still become
occupied between the probe and Flutter binding it; in that rare case, retry.

The launcher uses your **linked vop-new Vercel** project's existing public
Firebase WEB registration (not the Android application ID).

Open a trusted PowerShell window in your checkout:

```powershell
cd "C:\Users\user\Pictures\VOP New"
git switch main
git pull --ff-only
.\run_web.ps1

# For a non-default port:
.\run_web.ps1 -WebPort 7358

# Chrome Inspector/DWDS (optional):
.\run_web.ps1 -ChromeInspector

# Preview from a phone on your trusted local network:
.\run_web.ps1 -ShareOnNetwork
```

Open the exact URL printed by the launcher, usually
`http://127.0.0.1:7357`, `http://127.0.0.1:7358`, or
`http://127.0.0.1:7359`. Press Ctrl+C in PowerShell to stop.
If an explicitly chosen port is unavailable, inspect it without killing other
applications:

```powershell
Get-NetTCPConnection -LocalPort 7357 -State Listen |
  Select-Object LocalAddress,LocalPort,OwningProcess
```
Your computer's Vercel CLI must be authenticated and linked to the correct
existing project. The launcher can also take `-ConfigPath` pointing to
a local ignored public-client env file, based on
`native_android/Vop_Web_Config.example.env`, or
`-ApiBaseUrl` with an approved HTTPS API origin.

**Firebase web credentials:** the web build takes `VITE_FIREBASE_API_KEY`,
`VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_PROJECT_ID` and
`VITE_FIREBASE_AUTH_DOMAIN`. Its messaging sender ID is
derived from the registered web app ID if a separate public value is absent.
Firebase Admin, payment and private service-account credentials are excluded.
Vercel CLI briefly downloads the full environment to a randomly named
temporary file which is deleted in a finally block; use only a trusted
development workstation.

**Authorize your local browser preview** to call the deployed backend.
Set Vercel server environment variable `VOP_FLUTTER_WEB_ALLOWED_ORIGINS` for
the vop-new deployment to an exact comma-separated list of trusted preview
origins. The default approved Windows preview ports use the exact values
`http://127.0.0.1:7357,http://127.0.0.1:7358,http://127.0.0.1:7359`.
The server still requires valid Firebase bearer tokens for protected APIs;
it never accepts arbitrary local ports or wildcard browser origins. For a
custom `-WebPort`, explicitly configure that exact origin in Vercel before
expecting API access. This is opt-in: without it, browser CORS
preflight to VOP API routes is denied, although Flutter may compile and render.
After changing production Vercel environment variables, redeploy the API
service so the configuration is loaded. The API uses exact-origin matching,
allows only GET/POST/OPTIONS, never enables cross-origin credentials, and
continues enforcing bearer-token authentication and tenant permissions.

Add your local development hostname to Firebase Authentication's approved
domains if the provider supports it. Google popup sign-in only works when
the current browser hostname is Firebase-authorized. The trusted localhost
origin and LAN HTTP preview are not equivalent to a production HTTPS origin.

For `-ShareOnNetwork`, connect phone and computer to trusted Wi-Fi;
the app lists possible private IPv4 addresses. These HTTP LAN previews
are **UI-only**: protected VOP backend APIs reject all insecure non-loopback
origins, even when included in `VOP_FLUTTER_WEB_ALLOWED_ORIGINS`.
Browser authentication and protected study actions must be tested from an
approved HTTPS preview origin that is also authorized by Firebase.
Do not enter real credentials into an HTTP phone preview.

Browser support boundaries: native device biometrics and Android Credential
Manager passkeys are deliberately not represented as browser capabilities.
The Android offline cache uses encrypted device-bound storage; the browser
version currently does not store protected studies or queue quiz/progress
mutations offline. This prevents inventing completion records or placing
private downloads into unencrypted browser storage. Provider media embeds
respect upstream frame policies. Browser API calls require the configured
CORS origin and an active Firebase account.

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

## Choose where to run VOP (USB, Wi-Fi, emulator or browser)

Use the native Android Flutter project directory, **not** the repository root:

```powershell
cd "C:\Users\user\Pictures\VOP New"
git switch main
git pull --ff-only
cd native_android
.\run_vop.ps1
```

The interactive launcher supports:

| Mode | Command | What actually runs |
| --- | --- | --- |
| USB | `.\run_vop.ps1 -Mode USB` | Native Flutter APK on an authorized USB-connected Android phone |
| Wi-Fi | `.\run_vop.ps1 -Mode WiFi` | Same Android APK on a phone connected with secure ADB wireless debugging |
| Emulator | `.\run_vop.ps1 -Mode Emulator` | Native APK on a local Android Studio virtual device |
| Browser | `.\run_vop.ps1 -Mode Browser -Browser Chrome` | Existing VOP web portal; **not** the Android APK |
| Cloud | `.\run_vop.ps1 -Mode Cloud -CloudProvider Appetize` | Build native APK and open an in-browser Android emulator provider for manual upload |
| List | `.\run_vop.ps1 -Mode List` | See Flutter/ADB devices and configured Android emulators |

**USB:** Set Developer options > USB debugging; connect the phone; accept the
computer's authorization prompt. `flutter devices` shows the **actual** ID.
For example, the Samsung SM A145F has been reported as `R58W313YEMB`:

```powershell
.\run_vop.ps1 -Mode USB -DeviceId "R58W313YEMB"
# Equivalent direct launch:
.\run_android.ps1 -DeviceId "R58W313YEMB"
```

**Wi-Fi:** Android 11 or newer. The PC and phone must be connected to the
same Wi-Fi network. On the Samsung, open Settings > Developer options >
Wireless debugging and enable it. Choose **Pair device with pairing code**,
then note its temporary pairing IP:port and pairing code. Also note the
**different** IP:port on the main Wireless debugging screen.

```powershell
.\run_vop.ps1 -Mode WiFi -PairAddress "192.168.1.10:37123" -ConnectAddress "192.168.1.10:39001"
# Pairing code is prompted by adb, not stored by the script.
# To reconnect after initial pairing:
.\run_vop.ps1 -Mode WiFi -ConnectAddress "192.168.1.10:39001"
```

Replace both example IPs/ports with the values on **your** phone.
ADB also supports pairing from Android Studio > Pair Devices Using Wi-Fi.
Only use a trusted network and turn Wireless debugging off when finished.

**Emulator:** Open Android Studio > Device Manager > Create device; install an
Android system image, preferably one with Google Play services when testing
Google sign-in. Then run `.\run_vop.ps1 -Mode Emulator`. The launcher chooses a running
Android emulator or offers configured AVDs to start. You may also specify
`-EmulatorId` from `flutter emulators`.

**In a browser there are two different choices:**

1. `-Mode Browser` opens `https://vopafrica.vercel.app`, the **web portal**;
   it does not claim the Android APK or device-specific biometric behavior.
2. `-Mode Cloud` builds `build/app/outputs/flutter-apk/app-debug.apk` with
   the existing public client configuration, then opens Appetize or
   BrowserStack App Live. Manually upload the APK to run the **actual Android
   application** inside a cloud Android device streamed to the browser.
   Cloud emulators may have mocked or unsupported hardware biometric features;
   test passkeys and fingerprint unlock on a physical Android device.

```powershell
.\run_vop.ps1 -Mode Cloud -CloudProvider Appetize
.\run_vop.ps1 -Mode Cloud -CloudProvider BrowserStack
.\run_vop.ps1 -Mode Browser -Browser Edge
.\run_vop.ps1 -Mode List
```

Do not upload production secrets, private keystores or service-account
credentials to third-party cloud testing systems. Google authentication and
passkeys may require provider-appropriate signing fingerprints and validated
domain association. Browser testing is not a substitute for device tests.

## Reuse the Vercel project's public Firebase settings

VOP can opt into pulling the *public client* configuration from your already
linked **vop-new** Vercel project. The Vercel VITE_FIREBASE_APP_ID identifies
the web app and must **never** be used as the Android Firebase app ID.

First link this working copy of VOP-New to its existing Vercel project:

    cd "C:\Users\user\Pictures\VOP New"
    npm install -g vercel
    vercel login
    vercel link --project vop-new

Then run from the native_android directory:

    .\run_vop.ps1 -Mode Emulator -EmulatorId "Pixel10" -UseVercelEnv -VercelEnvironment production

The existing VITE_FIREBASE_PROJECT_ID is checked against the package-matched
Android google-services.json. If they disagree, the build fails rather than
mixing Firebase projects. Android app ID, sender ID and Android-authorized API
key still come from that existing Android registration, unless matching public
Android-specific Vercel settings are configured as
VOP_FIREBASE_ANDROID_APP_ID, VOP_FIREBASE_SENDER_ID and
VOP_FIREBASE_ANDROID_API_KEY. VOP_API_BASE_URL may also be set in Vercel.
Local ignored Vop_Android_Config.env settings remain optional and take
precedence where nonempty; its example now contains placeholders only.

Security: Vercel CLI env pull downloads the full set of Vercel environment
variables to a random local temporary file, including server-side secrets.
The launcher immediately filters the public allowlist and deletes the temporary
file in a finally block. Use this option only on a trusted machine. NEVER
pass FIREBASE_ADMIN_PRIVATE_KEY, service account credentials, payment keys,
Vercel tokens or other server secrets through Flutter --dart-define. CI still
builds using the already-registered public Android Firebase client.

## Android emulator IDs can change between sessions

Flutter's emulator device serial (for example emulator-5554 or emulator-5556)
is not the Android Studio AVD name. It may change between restarts.
The VOP Android launcher now checks online Android devices immediately before
flutter run, after Flutter has resolved dependencies. When a stale emulator
serial was supplied, it uses the new serial **only if exactly one emulator
is currently online**. It never guesses among two or more virtual devices.

From the VOP-New repository root, after pulling the latest changes:

    .\run_android.ps1 -DeviceId "emulator"
    .\run_android.ps1 -DeviceId "emulator-5556"
    .\run_android.ps1 -DeviceId "auto"

Use the emulator alias to automatically pick the sole online emulator.
The second form also handles emulator serial changes when unambiguous. With
auto, the launcher prompts for the device if both a Wi-Fi phone and emulator
are connected.

Additional supported identifiers:

    .\run_android.ps1 -DeviceId "wifi"
    .\run_android.ps1 -DeviceId "usb"
    .\run_android.ps1 -DeviceId "SM-A145F"

Wi-Fi device IP ports can also rotate; an old IP:port resolves to the same
unique online IP address when available. Ambiguous choices abort rather than
launching VOP on another device. Both root and native_android launchers work.

IMPORTANT: avoid unreviewed Flutter major package upgrades. The native app
currently needs its existing Google sign-in, Firebase Auth, and biometric API
versions. Migrate the app calls and tests before upgrading their major versions.

## Emulator exits immediately with code 1

If Flutter prints "The Android emulator exited with code 1", the Android
**virtual device process failed to start**. This occurs before VOP builds or
reads the Vercel/Firebase client environment. The launcher must stop at once
rather than keep polling an Android VM that does not exist.

Start by ensuring Pixel10 is fully stopped in Android Studio Device Manager,
then try a cold boot with software GPU rendering:

    cd "C:\Users\user\Pictures\VOP New\native_android"
    .\run_vop.ps1 -Mode Emulator -EmulatorId "Pixel10" -ColdBoot -SoftwareGraphics

These flags change only the emulator's startup configuration; they do not
wipe any virtual device data. The launcher captures emulator stdout/stderr
under your Windows temporary folder and prints recent diagnostics if the
Android SDK process fails.

To see the underlying Android emulator engine error directly, use the SDK
binary in PowerShell (this can reveal hardware acceleration, graphics driver,
disk space or missing system-image errors):

    $emulatorExe = Join-Path $env:LOCALAPPDATA "Android\Sdk\emulator\emulator.exe"
    & $emulatorExe -avd Pixel10 -verbose -no-snapshot-load -gpu software

Check the installed SDK emulator/hypervisor tooling with:

    & $emulatorExe -accel-check
    & $emulatorExe -list-avds
    adb devices -l

If Pixel10 is damaged, try the other existing AVD:
RSSEDURMS_API_35, or use Android Studio Device Manager to repair its system
image. Android hardware virtualization must be available for accelerated
emulator operation. Never disable security features or wipe AVD data just to
silence a launch error.

For native Firebase values, the optional -UseVercelEnv flag will take effect
**after** the selected AVD starts successfully, not during Android startup.

## Recover a Pixel emulator stuck offline

If flutter devices says that emulator-5554 is offline, the virtual phone has
started but Android is not ready. Wait for its home screen to appear and check:

    adb devices -l
    adb -s emulator-5554 shell getprop sys.boot_completed
    flutter devices --device-timeout 60

If it remains offline for several minutes, open Android Studio > Device
Manager > Pixel10 > Cold Boot Now. If needed, close the emulator and restart
the ADB server:

    adb kill-server
    adb start-server
    flutter emulators --launch Pixel10

As a last resort, Wipe Data in Device Manager can reset an AVD, but this
**erases that virtual device's applications and data**. The launcher now waits
for sys.boot_completed=1 and starts an explicitly selected Pixel10 even when
Flutter's emulator table cannot be parsed. The Android SDK's emulator.exe
-list-avds provides a fallback for the interactive device picker.

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
