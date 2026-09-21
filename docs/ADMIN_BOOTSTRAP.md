# VOP administrator bootstrap

The VOP web application is hosted on Vercel. Administrator bootstrap is handled by a Vercel serverless API route and Firebase Admin SDK; Firebase Hosting and Firebase Cloud Functions are not required.

## Security model

- Firebase Authentication identifies the signed-in actor.
- The web client sends the Firebase ID token to `/api/admin/bootstrap`.
- The Vercel serverless endpoint verifies the ID token with Firebase Admin SDK.
- The one-time bootstrap secret is stored only as the Vercel environment variable `VOP_BOOTSTRAP_SECRET`.
- Firebase Admin credentials are stored only as server-side Vercel environment variables:
  - `FIREBASE_ADMIN_PROJECT_ID`
  - `FIREBASE_ADMIN_CLIENT_EMAIL`
  - `FIREBASE_ADMIN_PRIVATE_KEY`
- None of these server credentials use the `VITE_` prefix and none are exposed to browser JavaScript.
- The first successful bootstrap sets the authenticated account to `super_admin`.
- Bootstrap state is recorded in `system/security` and is permanently locked after success.
- The super administrator can assign scoped `union_admin`, `conference_admin`, `district_admin`, and `church_admin` roles to existing Firebase accounts.
- Role and scope are stored in Firestore and mirrored into Firebase Auth custom claims.
- Browser localStorage/demo users are not used for administrator authority.

## One-time setup

1. Create the intended first administrator's real Firebase Authentication account using the VOP web sign-in page.
2. In the Vercel project, create a long random `VOP_BOOTSTRAP_SECRET` environment variable for the Production/Preview environment where setup will run.
3. Add the Firebase Admin server variables listed above to Vercel. Obtain them from a securely managed Firebase service account; never commit a service-account JSON file or private key.
4. Deploy the VOP web project through Vercel.
5. Sign in to VOP as the intended first administrator.
6. Open Administrator Setup and enter the one-time bootstrap secret.
7. After successful bootstrap, the setup action cannot bootstrap another super administrator.
8. Use Assign Administrator to give existing accounts their exact organization scope.
9. After bootstrap, remove or rotate the bootstrap secret in Vercel if the setup route is no longer needed. The Firestore lock remains authoritative, so the route cannot bootstrap a second account.

The implementation must be validated against the real Vercel environment before the PR is merged.