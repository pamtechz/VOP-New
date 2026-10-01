# VOP Payments

VOP payments are provider-neutral. Lenco and direct MTN MoMo Collections implement the same server-side adapter contract; future Airtel Money or other gateways plug into the same checkout, verification, receipt and fulfilment core.

## Security boundary

The browser never decides that a payment is successful. It sends only the payable-item selection, provider/method choice, and payer information needed for checkout. The server loads the authoritative payable item from Firestore, determines amount/currency/scope, creates the transaction, and independently verifies provider state before fulfilment.

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

- `POST /api/payments/admin/transactions`
- `POST /api/payments/admin/transaction`
- `POST /api/payments/admin/payable-items`
- `POST /api/payments/admin/providers`
- `POST /api/payments/admin/reconcile`
- `POST /api/payments/admin/refunds`
- `POST /api/payments/admin/export`

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

Do not change `PaymentsPage`, transaction records, webhook audit, receipts or fulfilment when adding a direct provider. Add a provider adapter, register it, declare supported methods/capabilities, configure its server-only credentials, and add its signed webhook route through the consolidated payment function.


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


## Direct Airtel Money Zambia Collections

The direct Airtel adapter is registered as `airtel_money` and supports Airtel Money only. Lenco may still be enabled separately for Airtel, MTN, Zamtel or card checkout; administrators choose which configured providers are allowed for each payable item.

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

Regardless of callback authentication, a callback **cannot** mark a VOP transaction paid. The callback locates the transaction using the VOP reference or Airtel transaction UUID; VOP then performs an authenticated Airtel transaction enquiry and validates the provider state against the server-created transaction before fulfilment.

Airtel payment status is normalized from provider codes such as success, failure, expiry and in-progress states. Reconciliation continues checking non-terminal transactions because callbacks may be delayed or missed.

Direct Airtel automated refunds are intentionally not enabled until the exact merchant refund/reversal contract supplied during Airtel onboarding is available. The existing VOP refund workflow therefore records an audited `manual_action_required` refund and requires the external provider reversal/reference before changing the internal transaction to partially refunded or refunded.
