# Credential security

VOP must never commit Google Cloud/Firebase Admin service-account credentials or private keys.

The Android `google-services.json` file is client registration configuration and may contain public Firebase client identifiers. It must never contain `private_key`, `private_key_id`, or service-account `client_email` credentials.

Firebase Admin authentication for Vercel is server-side and must use Vercel environment variables only:

- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY`

If a service-account private key has ever been committed, deleting the file from the latest commit is not sufficient. The exposed key must be disabled/deleted and replaced, and the repository history must be cleaned of the credential before considering the incident closed.
