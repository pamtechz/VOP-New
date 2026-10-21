# Public Firebase client registrations

`web-public.json` contains the existing VOP browser Firebase registration and API origin. The Firebase values were read from the project's existing public Vite client configuration. `google-services.json` restores the existing `com.sda.vop` Android registration from repository history, previously located at `android/app/google-services.json`. Both registrations reference the same Firebase project.

These files contain public client identifiers. They contain no Firebase Admin credentials, service-account private keys, gateway credentials, signing keys, or user records. Authentication and authorization remain enforced by the existing VOP backend and Firestore rules. Operational content, organizations, prices, quotas, permissions, and dashboard counts are retrieved from the backend.

The Android workflow uses `tool/prepare_public_config.py`; the browser build uses `--dart-define-from-file=config/web-public.json`. For another environment, supply that environment's registered public Firebase client and HTTPS API origin. Do not substitute placeholder Firebase settings to make a build pass.
