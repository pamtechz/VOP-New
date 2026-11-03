# VOP existing Google Play app: signed AAB and APK recovery plan

App: Voice of Prophecy (com.sda.vop), connected Play account pamtechzambia@gmail.com.
Verified Play track codes on 2026-11-03: production 1; beta 2. Prepared Flutter version 2.2.0+3, as requested.
This is a NEW RELEASE of the existing package, never a second app. Debug APKs from VOP native CI are NOT suitable for Play updates.

1. Open Play Console > Voice of Prophecy > Protected with Play > Play Store protection > Manage Play app signing. Inspect the current **Upload key certificate**, not the distinct app-signing certificate. The historical August 2024 upload-key reset is not proof of the certificate currently registered.
2. If a private keystore is still available in encrypted backup or on KASAINSTITUTE, compare its SHA-256 fingerprint with that shown for the upload key in Play Console using keytool -list -v. If it matches and you still know its alias/password, do NOT reset the key.
3. If the private upload key is truly lost, use Android Studio or Java keytool LOCALLY to generate a new RSA 3072-bit upload keystore and export its PUBLIC certificate. In Play Console, select Upload key certificate > Request upload key reset; upload only the PEM certificate. The Play Console account administrator must complete and await confirmation. Never change the app-signing certificate simply because you lost the upload key.
   On Windows with a trusted Java JDK available, `native_android/tool/prepare_upload_key.ps1` prepares the JKS outside the repository and exports the public PEM. Password entry happens directly in Java's local prompts. It refuses to overwrite any existing key and does not submit a reset.
4. Set the following SIX encrypted Actions secrets in pamtechz/VOP-New, after reset approval:
    VOP_RELEASE_KEYSTORE_BASE64 -- base64 of the new private JKS. In local Windows PowerShell, copy with: [Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\private\vop-upload-key.jks')) | Set-Clipboard
    VOP_RELEASE_KEY_ALIAS -- the JKS alias
    VOP_RELEASE_STORE_PASSWORD -- JKS store password
    VOP_RELEASE_KEY_PASSWORD -- JKS key password
    VOP_RELEASE_UPLOAD_CERT_SHA256 -- the CURRENT approved upload certificate SHA-256 from Play Console
    VOP_RELEASE_SYMBOLS_DIR -- a PRIVATE persistent Windows runner directory for Dart obfuscation symbol maps (prefer an encrypted backed-up volume outside the public repository)
   Put secrets ONLY in GitHub Actions encrypted secrets, not repository files, a ticket, a screenshot or chat. Maintain a separate offline encrypted backup of the JKS and passwords.
5. After this PR is reviewed and merged, manually run GitHub Actions > VOP signed Android AAB and APK (manual) on MAIN. It runs only on trusted KASAINSTITUTE; it aborts if secrets are missing or either artifact's certificate differs; it removes temporary JKS and key.properties after completion. Outputs are the signed AAB, signed universal release APK and SHA256SUMS.txt. The workflow DOES NOT publish anything. The APK's compiled package, version and target API are verified before upload.
6. Through the already-connected Google Play Account Connection plugin: inspect tracks and readiness for com.sda.vop, upload the signed AAB to an uncommitted edit, confirm versionCode 3, prepare INTERNAL TESTING first and obtain explicit final approval before any commit or staged production rollout. Current plugin production writes are disabled.
7. Check Google Play policy declarations, the application's actual targetSdk >= 36, Firebase Google sign-in certificate fingerprints, and currently registered Upload key certificate before release.

Official guides:
https://support.google.com/googleplay/android-developer/answer/9842756
https://support.google.com/googleplay/android-developer/answer/11926878

## AAB optimization and compatibility

Both formats are built with Flutter `--obfuscate --split-debug-info` and icon tree shaking. Dart symbol maps and R8 mapping files are copied to separate `COMMIT/aab` and `COMMIT/apk` directories under the configured private runner path and are **never** uploaded as public artifacts. Preserve encrypted backups: crash stack traces cannot be fully deobfuscated without the symbols. Building the APK must not overwrite the AAB's crash maps.

The locally built APK uses the upload certificate. Play signs installed APKs with its distinct app-signing certificate. For a direct download that can update an existing Play installation, obtain Google's generated signed universal APK from Play Console after the approved bundle upload. Do not represent an upload-key-signed APK as sharing the Play install signing lineage.

## Verified configuration checkpoint: 3 November 2026

- GitHub's Actions secrets page reports no repository secrets and no environment secrets. None of the six required signing configuration values is currently available to this workflow.
- The existing Play production draft has no new app bundle. The upload-key reset form is available, but no reset has been submitted and no replacement key has been registered.
- Play Console lists current and previous app-signing certificates ending `0C:3F:4C:0D` and `FE:81:1F:66`. The website association now includes both, preserving the existing direct-install certificate. This does not assert that Firebase's Google sign-in certificate configuration has been updated.
- The deployed publisher source hashes match the inspected 0.8.0 source; all 110 tests pass, including account isolation, changed-plan rejection, exact browser approval and replay protection. Testing and production capability flags have now been configured while retaining every per-release approval check; the required redeployment is queued. Confirm live readiness before upload; no release has been approved or committed.
- The production server's Android passkey certificate allowlist is now configured with the same verified app certificates. It becomes effective on the next VOP production deployment; the website association changes still require this branch to pass and merge.

The workflow enforces the requested **8 MB (8,000,000 bytes) maximum AAB**. A bundle larger than that fails before artifact upload; no release is published. This is an acceptance gate, **not proof that the current Flutter/Firebase/WebView application can physically fit inside 8 MB**. Google's Play delivery uses device-specific APK splits so installed/downloaded sizes differ from the submitted AAB. Do not remove 32-bit/64-bit support or essential authentication/payments functionality merely to pass this budget without explicit approval. If it fails, inspect real dependencies/assets and review the size target before changing supported devices.
