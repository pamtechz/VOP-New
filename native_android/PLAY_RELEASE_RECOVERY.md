# VOP existing Google Play app: signed AAB recovery plan

App: Voice of Prophecy (com.sda.vop), connected Play account pamtechzambia@gmail.com.
Verified Play track codes on 2026-11-02: production 1; beta 2. Prepared Flutter version 1.1.0+3.
This is a NEW RELEASE of the existing package, never a second app. Debug APKs from VOP native CI are NOT suitable for Play updates.

1. Open Play Console > Voice of Prophecy > Protected with Play > Play Store protection > Manage Play app signing. Inspect the current **Upload key certificate**, not the distinct app-signing certificate. The historical August 2024 upload-key reset is not proof of the certificate currently registered.
2. If a private keystore is still available in encrypted backup or on KASAINSTITUTE, compare its SHA-256 fingerprint with that shown for the upload key in Play Console using keytool -list -v. If it matches and you still know its alias/password, do NOT reset the key.
3. If the private upload key is truly lost, use Android Studio or Java keytool LOCALLY to generate a new RSA 3072-bit upload keystore and export its PUBLIC certificate. In Play Console, select Upload key certificate > Request upload key reset; upload only the PEM certificate. The Play Console account administrator must complete and await confirmation. Never change the app-signing certificate simply because you lost the upload key.
4. Set the following SIX encrypted Actions secrets in pamtechz/VOP-New, after reset approval:
    VOP_RELEASE_KEYSTORE_BASE64 -- base64 of the new private JKS. In local Windows PowerShell, copy with: [Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\private\vop-upload-key.jks')) | Set-Clipboard
    VOP_RELEASE_KEY_ALIAS -- the JKS alias
    VOP_RELEASE_STORE_PASSWORD -- JKS store password
    VOP_RELEASE_KEY_PASSWORD -- JKS key password
    VOP_RELEASE_UPLOAD_CERT_SHA256 -- the CURRENT approved upload certificate SHA-256 from Play Console
    VOP_RELEASE_SYMBOLS_DIR -- a PRIVATE persistent Windows runner directory for Dart obfuscation symbol maps (prefer an encrypted backed-up volume outside the public repository)
   Put secrets ONLY in GitHub Actions encrypted secrets, not repository files, a ticket, a screenshot or chat. Maintain a separate offline encrypted backup of the JKS and passwords.
5. After this PR is reviewed and merged, manually run GitHub Actions > VOP signed Google Play AAB (manual) on MAIN. It runs only on trusted KASAINSTITUTE; it aborts if secrets are missing or the certificate differs; it removes temporary JKS and key.properties after completion. The only downloadable output is the signed AAB. The workflow DOES NOT publish anything.
6. Through the already-connected Google Play Account Connection plugin: inspect tracks and readiness for com.sda.vop, upload the signed AAB to an uncommitted edit, confirm versionCode 3, prepare INTERNAL TESTING first and obtain explicit final approval before any commit or staged production rollout. Current plugin production writes are disabled.
7. Check Google Play policy declarations, the application's actual targetSdk >= 36, Firebase Google sign-in certificate fingerprints, and currently registered Upload key certificate before release.

Official guides:
https://support.google.com/googleplay/android-developer/answer/9842756
https://support.google.com/googleplay/android-developer/answer/11926878

## AAB optimization and compatibility

The signed bundle is built with Flutter `--obfuscate --split-debug-info` and icon tree shaking. Dart symbol maps are copied to the configured private runner directory and are **never** uploaded as public artifacts. Preserve encrypted backups: crash stack traces cannot be fully deobfuscated without the symbols.

The workflow enforces the requested **8 MiB (8,388,608 bytes) maximum AAB**. A bundle larger than that fails before artifact upload; no release is published. This is an acceptance gate, **not proof that the current Flutter/Firebase/WebView application can physically fit inside 8 MiB**. Google's Play delivery uses device-specific APK splits so installed/downloaded sizes differ from the submitted AAB. Do not remove 32-bit/64-bit support or essential authentication/payments functionality merely to pass this budget without explicit approval. If it fails, inspect real dependencies/assets and review the size target before changing supported devices.
