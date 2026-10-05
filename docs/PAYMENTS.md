# VOP Payments

VOP payments are provider-neutral. Lenco, direct MTN MoMo Collections and direct Airtel Money Zambia Collections implement the same server-side adapter contract; additional gateways plug into the same checkout, verification, receipt and fulfilment core.

## Security boundary

The browser never decides that a payment is successful. It sends only the payable-item selection, payment-method choice, and payer information needed for checkout. Provider routing is selected server-side from the Super Admin configuration. The server loads the authoritative payable item from Firestore, determines amount/currency/scope, creates the transaction, and independently verifies provider state before fulfilment.

### Finance administration boundary

Platform finance controls are **Super Admin-only**. Organization, church, district, conference and union administrators cannot read or mutate the administrative payable-item catalog, provider configuration, reconciliation state or provider-facing refund controls. Their finance view is restricted to authorized transaction outcomes and receipts; provider transaction IDs/references, webhook state, reconciliation state, provider attempts and provider audit remain platform-only.

Consumer checkout receives a safe projection of an available charge: display name, description, amount/currency and currently available payment methods. Provider names, credentials, environments, callback configuration and routing priority are not returned. VOP selects the enabled provider on the server.

These collections are server-authoritative and denied to client Firestore access:

- `payableItems`
- `paymentProviderConfigs`
- `paymentTransactions` and attempt/audit subcollections
- `paymentWebhookEvents`
- `paymentRefunds`
- `paymentReceipts`
- `paymentFulfilments`
- `paymentLocks`
- `paymentRateLimits`
- `paymentEntitlements`
- `programEnrollments`
- `eventRegistrations`

## Provider adapter

Implement `PaymentProviderAdapter` from `server/payments/providers.ts` and register the adapter using `registerPaymentProvider(adapter)`.

Adapters declare capabilities and implement:

- `configured()`
- `publicConfiguration()`
- `createPayment()`
- `verifyPayment()`
- `parseWebhook()` only when that provider uses callbacks

VOP checkout, verification, receipts, reconciliation, audit and fulfilment do not depend on the provider implementation.

## Lenco

Server environment:

```
LENCO_API_TOKEN=
LENCO_PUBLIC_KEY=
LENCO_ENVIRONMENT=sandbox
CRON_SECRET=
```

`LENCO_API_TOKEN` is server-only. `LENCO_PUBLIC_KEY` is supplied to the authenticated checkout page only after VOP has created a server-authoritative payment transaction.

Webhook URL:

```
https://vopafrica.vercel.app/api/payments/webhooks/lenco
```

Lenco webhook verification uses `X-Lenco-Signature`; VOP derives the signing key by SHA-256 hashing the API token and verifies the HMAC-SHA512 payload signature using a timing-safe comparison.

Lenco mobile money maps VOP methods to Zambia operators:

- `airtel_money` → `airtel`
- `mtn_money` → `mtn`
- `zamtel_money` → `zamtel`

Card checkout uses Lenco's hosted/inline widget. VOP does not collect raw PAN/CVV data.

## API routes

All routes are consolidated in one Vercel function to stay within the project's serverless-function budget.

Authenticated learner/member routes:

- `POST /api/payments/catalog`
- `POST /api/payments/checkout`
- `POST /api/payments/verify`
- `POST /api/payments/status`
- `POST /api/payments/history`
- `POST /api/payments/receipt`

Provider route:

- `POST /api/payments/webhooks/lenco`
- `POST|PUT /api/payments/webhooks/mtn-momo`
- `POST /api/payments/webhooks/airtel-money`

Protected scheduled reconciliation:

- `GET|POST /api/payments/reconcile-cron`

Administrative routes:

- `POST /api/payments/admin/transactions` — organization/hierarchy scoped; provider internals are redacted outside Super Admin.
- `POST /api/payments/admin/transaction` — organization/hierarchy scoped; provider internals are redacted outside Super Admin.
- `POST /api/payments/admin/export` — scoped export; provider/reconciliation columns are Super Admin-only.
- `POST /api/payments/admin/payable-items` — **Super Admin-only**.
- `POST /api/payments/admin/providers` — **Super Admin-only**.
- `POST /api/payments/admin/reconcile` — **Super Admin-only**.
- `POST /api/payments/admin/refunds` — **Super Admin-only**.

Subscription package administration uses `POST /api/admin/plans`. Full package listing and all create/update/delete/assignment actions are Super Admin-only. Organization owners/admins may read active package offers and consume them for their own organization.

## Payable items

Prices and payment requirements are configured in Firestore, never hard-coded in UI code. Supported item types:

- programme registration
- event registration
- organization subscription
- training
- material
- ministry service
- donation
- custom charge

Amounts are stored in integer minor units plus a decimal snapshot. Transactions snapshot the item name, description, amount, currency, organization context and fulfilment configuration so historical receipts do not change when administrators later edit pricing.

The complete payable-item catalog is administered only by Super Admin. Organization-facing checkout never exposes the administrative record or provider-routing configuration.

## Organization subscription packages

Subscription packages are platform products stored under `system/plans/catalog` and managed only by Super Admin. The management form uses named fields for package name, description, price, currency, billing interval, quotas and included capabilities; package IDs are generated automatically.

When Super Admin saves an active paid package, VOP automatically synchronizes an internal platform payable item named `subscription_<packageId>` with type `organization_subscription`. Deactivating/freeing/deleting the package deactivates or removes that checkout offer without deleting historical payment records.

Only an organization's **owner or administrator** can see and purchase an organization subscription offer. Ordinary learners do not see those offers. After a server-verified payment, VOP applies the package plan, quotas and feature entitlements to that organization and records the current subscription period and payment provenance. Provider choice remains invisible to the organization and is selected server-side.

The SaaS domain has one source of truth:
- **Plan** — the platform catalog template: price, interval, limits and capabilities.
- **Subscription** — the organization's active commercial term, payment/manual activation provenance and an immutable entitlement snapshot for that term.
- **Usage** — live server-measured consumption checked against the subscription snapshot.

Organization settings cannot directly edit `plan`, `quotas` or `featureEntitlements`. A plan edit changes future activations; it does not silently shrink an already-active organization's current entitlement snapshot. Downgrades and manual assignments are rejected when current usage is above the target plan. Cancellation defaults to end-of-period; immediate cancellation is a Super Admin operation and suspends paid feature access.

### Currency and daily FX

Plan catalog prices remain canonical USD. VOP also supports method-specific settlement quotes for every payable item. The consumer catalog returns only payment methods whose provider is both configured and enabled. For each visible method, the server determines the provider settlement currency and issues the amount for that method; provider names and routing remain hidden from consumers.

When the configured mobile-money provider settles in a different currency from the item price, VOP obtains the current direct currency-pair rate from the public Frankfurter API and caches the verified pair under `system/billing/rates`. For example, a USD charge routed to a Zambia mobile-money provider is quoted and charged in ZMW. The browser never supplies an authoritative exchange rate, amount, or settlement currency: checkout recalculates the quote server-side immediately before the transaction is created.

Fresh pair quotes are reused for up to 26 hours. If the upstream daily feed is temporarily unavailable, VOP may use only a previously verified rate no more than 72 hours old; otherwise that payment method is hidden from the consumer catalog and checkout fails closed. Subscription pricing keeps its institutional billing-country policy, while the final provider settlement quote applies consistently to subscriptions, programmes, events, materials, services, donations and custom charges.

## Payment lifecycle

Internal statuses:

`draft → initiated → pending/requires_action/processing → paid/failed/cancelled/expired`

A paid transaction may later become `partially_refunded` or `refunded` when a configured provider supports refunds. Status transitions are non-regressing; a late pending webhook cannot move a verified paid transaction back to pending.

Payment state, settlement state, verification state, webhook state, reconciliation state and fulfilment state are tracked separately.

## Duplicate protection and recovery

- A durable payment lock prevents duplicate checkout for the same non-repeatable user/item entitlement.
- Each provider request has a separate attempt record.
- Webhook events are deduplicated using a deterministic event hash.
- Fulfilment uses an expiring transaction claim and deterministic entitlement/receipt IDs.
- Ambiguous network timeouts remain pending instead of being declared failed, then reconciliation independently queries the provider.
- Scheduled reconciliation rechecks initiated/pending/requires-action/processing transactions. The current Vercel Hobby deployment runs this fallback once daily; webhook processing and authenticated status/verification checks remain immediate. On a plan or external scheduler that permits it, call the protected reconciliation route every 30 minutes.

## Fulfilment

Only a server-verified paid transaction can fulfil.

- Programme/guide payment → programme/course enrolment
- Event payment → event registration
- Organization subscription → plan, quotas, feature entitlements and subscription period
- Training/material/ministry/custom charge → payment entitlement
- Donation → receipt only

Receipts use immutable payment snapshots.

## Manual subscription activation

The legacy Super Admin plan API remains available for complimentary, migration or explicit manual overrides. Non-payment activation now requires an audit reason and records `activationSource`. Normal paid activation must come from payment fulfilment.

## Direct Airtel/MTN providers

Consumer pages remain provider-blind when adding a direct provider. Add a provider adapter, register it, declare supported methods/capabilities, configure its server-only credentials, and add its callback route through the consolidated payment function. Only Super Admin sees provider administration.


## Refunds and partial refunds

Refunds are separate immutable finance records. VOP reserves the requested amount immediately so concurrent refund requests cannot exceed the remaining refundable balance.

A provider adapter may implement automated `refundPayment` and `verifyRefund` methods. When the provider does not expose a documented refund API, VOP records the request as `manual_action_required`: an authorized finance administrator performs the refund in the provider's official merchant interface and then records the external reversal/refund reference plus an audit note. Only that confirmation changes the VOP payment to `partially_refunded` or `refunded`.

For Lenco, the current public v2 collection documentation exposes collection initiation/status, webhooks and settlement information but does not document a collection-refund endpoint. Therefore the Lenco adapter deliberately does not invent one.

A full refund reverses payment-created access: programme/course enrolments are marked revoked, event registrations are cancelled, generic payment entitlements are revoked, and a refunded organization subscription is suspended until a Super Admin assigns a replacement/complimentary plan with an audit reason. Partial refunds do not automatically revoke fulfilled access.


## Direct MTN MoMo Collections

MTN's Collections API is asynchronous. VOP sends `POST /collection/v1_0/requesttopay` with an MTN UUID in `X-Reference-Id`, VOP's immutable transaction reference as `externalId`, and the configured callback URL in `X-Callback-Url`.

Environment:

```
MTN_MOMO_SUBSCRIPTION_KEY=
MTN_MOMO_API_USER=
MTN_MOMO_API_KEY=
MTN_MOMO_ENVIRONMENT=sandbox
MTN_MOMO_TARGET_ENVIRONMENT=sandbox
MTN_MOMO_CALLBACK_URL=https://vopafrica.vercel.app/api/payments/webhooks/mtn-momo
MTN_MOMO_BASE_URL=
```

For Zambia production, the MTN target environment is `mtnzambia`. The production base URL and API credentials must come from MTN onboarding/Partner Portal rather than being guessed by VOP.

### Sandbox API user and API key

The sandbox API key is not displayed on the developer portal. Generate it using:

```
MTN_MOMO_SUBSCRIPTION_KEY=your_collections_primary_key npm run payments:mtn:provision-sandbox
```

On PowerShell:

```powershell
$env:MTN_MOMO_SUBSCRIPTION_KEY="your_collections_primary_key"
$env:MTN_MOMO_CALLBACK_URL="https://vopafrica.vercel.app/api/payments/webhooks/mtn-momo"
npm run payments:mtn:provision-sandbox
```

The script creates a UUID API user with `POST /v1_0/apiuser`, registers the callback host, then creates the secret with `POST /v1_0/apiuser/{apiUser}/apikey`. It prints `MTN_MOMO_API_USER` and `MTN_MOMO_API_KEY` once for you to place in secret storage.

### Callback security model

MTN RequestToPay does not document a cryptographic signature header comparable to Lenco's `X-Lenco-Signature`. VOP therefore never trusts the MTN callback status. The callback is treated only as a notification: VOP finds the transaction by its `externalId`, confirms the provider is `mtn_momo`, and independently calls MTN's authenticated GET RequestToPay status endpoint using the server-held transaction UUID before any payment or entitlement state changes.

MTN documents callbacks as one-shot notifications with no retry. VOP's existing reconciliation process therefore remains mandatory as a recovery path when an MTN callback is lost.

Because MTN RequestToPay callbacks are not cryptographically authenticated, VOP will not use the public `externalId`/VOP reference to locate a payment. An unsigned callback is actionable only when it includes the exact opaque `referenceId` UUID that VOP generated for the provider transaction. Reference-only or unknown unsigned callbacks are ignored and cannot trigger an MTN status lookup.


## Direct Airtel Money Zambia Collections

The direct Airtel adapter is registered as `airtel_money` and supports Airtel Money only. Lenco may still be enabled separately for Airtel, MTN, Zamtel or card checkout. Only Super Admin configures provider availability/payable-item routing; organization consumers choose a payment method and VOP selects the provider server-side.

Environment:

```
AIRTEL_MONEY_CLIENT_ID=
AIRTEL_MONEY_CLIENT_SECRET=
AIRTEL_MONEY_ENVIRONMENT=staging
AIRTEL_MONEY_COUNTRY=ZM
AIRTEL_MONEY_CURRENCY=ZMW
AIRTEL_MONEY_BASE_URL=
AIRTEL_MONEY_COLLECTION_PATH=/merchant/v1/payments/
AIRTEL_MONEY_STATUS_PATH_PREFIX=/standard/v1/payments/
AIRTEL_MONEY_CALLBACK_AUTHORIZATION=
```

The adapter obtains an OAuth access token with the server-held client ID and client secret, then creates a collection request with a server-generated transaction UUID and the immutable VOP payment reference. It never accepts an amount or currency supplied by the browser as authoritative.

Callback endpoint:

```
https://vopafrica.vercel.app/api/payments/webhooks/airtel-money
```

If Airtel merchant configuration sends an Authorization header to the callback, set the exact expected value in `AIRTEL_MONEY_CALLBACK_AUTHORIZATION`. If no callback credential is configured, VOP treats the callback as unauthenticated notification data and discards unknown/orphan notifications.

Regardless of callback authentication, a callback **cannot** mark a VOP transaction paid. When callback Authorization is configured, VOP can accept the authenticated VOP reference or Airtel transaction UUID. Without callback authentication, VOP refuses reference-only lookup and requires the exact opaque Airtel transaction UUID that was created and stored during checkout. Only then does VOP perform an authenticated Airtel transaction enquiry and validate provider state before fulfilment.

Airtel payment status is normalized from provider codes such as success, failure, expiry and in-progress states. Reconciliation continues checking non-terminal transactions because callbacks may be delayed or missed.

Direct Airtel automated refunds are intentionally not enabled until the exact merchant refund/reversal contract supplied during Airtel onboarding is available. The existing VOP refund workflow therefore records an audited `manual_action_required` refund and requires the external provider reversal/reference before changing the internal transaction to partially refunded or refunded.
