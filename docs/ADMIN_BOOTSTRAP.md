# VOP administrator bootstrap

The repository now contains a server-authoritative, one-time administrator bootstrap under `functions/`.

## Security model

- Firebase Authentication identifies the actor.
- `vopAdminSetup` is a Firebase callable Cloud Function.
- The first successful bootstrap sets exactly one authenticated account to `super_admin`.
- Bootstrap state is recorded in `system/security` and is permanently locked after success.
- The bootstrap secret is stored in Firebase Secret Manager as `VOP_BOOTSTRAP_SECRET`; it is never committed to GitHub or exposed as a Vite environment variable.
- The super administrator can assign scoped `union_admin`, `conference_admin`, `district_admin`, and `church_admin` roles to existing Firebase accounts.
- Role and scope are stored in Firestore and mirrored into Firebase Auth custom claims for future server-side authorization.
- Browser localStorage/demo users are not used for administrator authority.

## One-time setup

1. Create the intended first administrator's real Firebase Authentication account using the VOP web sign-in page.
2. Put a long random value into Firebase Secret Manager under `VOP_BOOTSTRAP_SECRET`.
3. Upgrade the Firebase project to Blaze before deploying Cloud Functions. Firebase documents that Cloud Functions requires Blaze; it still has a no-cost usage tier, but billing is enabled. Set budget alerts/spend controls before deployment.
4. From a machine with Firebase CLI authenticated to the **voiceofprophecy** project:
   `firebase use voiceofprophecy`
5. Deploy the function:
   `cd functions && npm install && npm run build && cd .. && firebase deploy --only functions:vopAdminSetup`
6. Sign in to the VOP web app as the intended first administrator.
7. Select **Administrator setup**, enter the one-time secret, and initialize the super administrator.
8. After successful bootstrap, the setup action cannot bootstrap another super administrator.
9. Use **Assign Administrator** to give existing accounts their exact organization scope.

Do not commit a service-account JSON file, private key, or the bootstrap secret.

The implementation is code-complete for this setup flow, but deployment and real Firebase account testing remain external release gates.
