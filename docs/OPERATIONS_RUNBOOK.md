# VOP Production Operations Runbook

## Purpose

This runbook covers production health checks, Firestore managed backups, recovery validation, and restore operations for VOP.

The application must never claim that backups are healthy merely because backup code exists. Backup readiness is derived from a completed managed Firestore export. Until a real Google Cloud Storage destination and the required IAM permissions are configured, detailed health reports `backup.status = not_configured`.

## Service health

### Public liveness

`GET /api/health`

This endpoint is intentionally narrow. It verifies that the serverless application can initialize Firebase Admin and read Firestore. It returns the deployment SHA and a request ID, but does not expose backup destinations, operation identifiers, or administrative metadata.

A failed database/server health check returns HTTP 503.

### Super Admin readiness

`GET /api/health?detail=1`

Send the signed-in Super Admin Firebase ID token in the `Authorization: Bearer <token>` header.

Detailed readiness reports:

- database availability
- operations-maintenance heartbeat freshness
- managed-backup configuration state
- latest completed backup time/run
- current backup state
- backup staleness against the production policy
- active deployment SHA

A degraded readiness result is returned with HTTP 200 so uptime monitors distinguish application availability from an operational warning. The response field `status` is authoritative for readiness.

## Maintenance schedule

VOP reuses the existing protected `/api/account-lifecycle-cron` schedule rather than creating another Vercel cron/function. The daily run performs account lifecycle work first and then operational maintenance.

Current policy:

- backup recovery-point objective: 24 hours
- backup becomes operationally stale after: 36 hours
- maintenance heartbeat becomes stale after: 48 hours
- duplicate Super Admin operational alerts are suppressed for: 24 hours

These values are operational objectives, not a contractual SLA.

## Enabling managed Firestore backups

### 1. Create the backup destination

Create a dedicated Google Cloud Storage bucket intended only for VOP Firestore exports. Use retention/lifecycle rules appropriate to the organization’s legal and recovery requirements.

Configure the production Vercel variable:

`FIRESTORE_BACKUP_BUCKET=gs://BUCKET_NAME`

An optional namespace prefix is supported:

`FIRESTORE_BACKUP_BUCKET=gs://BUCKET_NAME/vop-production`

Do not put credentials, signed URLs, or HTTP URLs in this setting.

### 2. Configure Google Cloud IAM

The Firebase Admin service account used by the Vercel production deployment must be allowed to start Firestore import/export operations. Grant the minimum role that provides Firestore import/export administration (for example Cloud Datastore Import Export Admin).

Firestore managed export/import uses the Firestore service agent to access Cloud Storage. Grant that service agent the required access to the backup bucket. Use the narrowest bucket-level permissions that support export/import; Cloud Storage Admin is the broad documented role when least-privilege custom permissions are not being used.

Do not grant browser/client identities access to the backup bucket or the operational metadata collections.

### 3. Deploy and verify

After the environment variable and IAM changes are in place, redeploy production or trigger a deployment so the function receives the new environment.

Wait for the existing daily lifecycle cron or invoke it through Vercel’s authenticated cron mechanism.

Then verify:

1. `/api/health` remains `status: ok`.
2. Super Admin detailed health changes from `not_configured` to `pending` while the export is running.
3. After the long-running operation completes, detailed health reports `backup.status: ok`.
4. A new `operationsBackupRuns/YYYY-MM-DD` record is marked `completed`.
5. The reported export prefix exists in the configured Cloud Storage bucket.

The browser cannot read `operationsBackupRuns`, `operationalAlerts`, or `system/operations`; inspect them only with trusted server/Admin tooling.

## Backup state meanings

- `not_configured`: no production backup bucket is configured.
- `configuration_error`: the configured backup destination is invalid.
- `pending`: a managed export has been requested or is running and no completed baseline exists yet.
- `ok`: a completed export is within the 36-hour freshness window.
- `stale`: the latest completed export is older than 36 hours.
- `missing`: backup is configured but there is no completed or current export record.
- `failed`: the latest scheduled export request could not be started.

The daily maintenance job sends a deduplicated in-app security notification to Super Admin accounts for invalid configuration, missing configuration, failed requests, or stale completed backups.

## Restore tool

Restores are never automatic.

The operator command is:

`npm run ops:firestore-restore`

Required variables:

- `VOP_FIRESTORE_RESTORE_PROJECT_ID`
- `VOP_FIRESTORE_RESTORE_INPUT_URI` — the exact `gs://...` output URI prefix from a successfully completed export
- optional `VOP_FIRESTORE_RESTORE_DATABASE_ID` — defaults to `(default)`
- optional `VOP_FIRESTORE_RESTORE_COLLECTIONS` — comma-separated collection-group IDs for a scoped restore

The command defaults to dry-run and prints the resolved target/source.

### Required production restore sequence

1. Identify a completed export and verify the export operation succeeded.
2. Restore that export into a non-production verification project/database first.
3. Run authentication, tenant isolation, curriculum, assessment, certificate, payment, and account-lifecycle smoke tests against the verification restore.
4. Document the incident/restore reason and obtain operational approval.
5. For the intended target project set:
   - `VOP_FIRESTORE_RESTORE_CONFIRM=RESTORE <PROJECT_ID>`
   - `VOP_FIRESTORE_RESTORE_SOURCE_CONFIRMED=YES`
6. Start the import with:
   `npm run ops:firestore-restore -- --apply`
7. The command prints the long-running operation name. Monitor it with:
   `npm run ops:firestore-restore -- --status "<OPERATION_NAME>"`
8. Do not reopen writes or declare recovery complete until the import operation reports success and post-restore smoke tests pass.

Never use a partial/cancelled export as a restore source.

## Recovery objectives and drills

The configured backup policy targets a 24-hour RPO. A practical RTO depends on Firestore dataset size, export/import duration, DNS/deployment state, and the validation workload.

Run a non-production restore drill at least quarterly. Record:

- export run ID and timestamp
- restore start/end time
- target verification project
- operation result
- smoke-test result
- measured RPO/RTO
- defects and follow-up owner

Do not advertise an RTO externally until repeated drills demonstrate it.

## Incident checks

For production incidents:

1. Check Vercel deployment state and exact Git commit SHA.
2. Check `GET /api/health`.
3. Check Super Admin detailed readiness.
4. Review Vercel runtime errors/logs using the response request ID when available.
5. Confirm the latest completed Firestore export before any destructive recovery action.
6. Prefer forward fixes for application defects. Use Firestore restore only for data-loss/corruption scenarios where a validated backup is the correct recovery source.

## Current production prerequisite

As of the operations implementation, VOP production has Firebase Admin credentials and the protected cron secret configured, but no `FIRESTORE_BACKUP_BUCKET` environment variable. Therefore managed backup automation must remain reported as **not configured** until the Cloud Storage destination and IAM grants are completed.

## Production deployment provenance

VOP production should be deployed from reviewed pull-request merges, not direct pushes to `main`.

Vercel's Ignored Build Step must be configured as:

`node scripts/vercel-production-gate.mjs`

For Preview/non-`main` deployments the script allows the build. For Production `main`, it queries GitHub for pull requests associated with `VERCEL_GIT_COMMIT_SHA` and allows the build only when the exact SHA is the merge result of a closed, merged PR targeting `main`. GitHub lookup failure, timeout, repository mismatch, a direct commit, or an unrelated PR fails closed and causes Vercel to ignore the deployment.

This is a deployment backstop, not a replacement for GitHub branch protection. Protect `main` in GitHub and require the hosted verification/validation checks before merge.
