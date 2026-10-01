# VOP Payments

VOP payments are provider-neutral. Lenco is the first production adapter; direct Airtel Money, MTN MoMo, or another provider must implement the same server-side adapter contract instead of adding provider-specific logic to the UI.

## Security boundary

The browser never decides that a payment is successful. It sends only the payable-item selection, provider/method choice, and payer information needed for checkout. The server loads the authoritative payable item from Firestore, determines amount/currency/scope, creates the transaction, and independently verifies provider state before fulfilment.

These collections are server-authoritative and denied to client Firestore access:

- `payableItems`
- `paymentProviderConfigs`
- `paymentTransactions` and attempt/audit subcollections
- `paymentWebhookEvents`
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
- `verifyWebhook()`

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

Protected scheduled reconciliation:

- `GET|POST /api/payments/reconcile-cron`

Administrative routes:

- `POST /api/payments/admin/transactions`
- `POST /api/payments/admin/transaction`
- `POST /api/payments/admin/payable-items`
- `POST /api/payments/admin/providers`
- `POST /api/payments/admin/reconcile`
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
- Scheduled reconciliation rechecks initiated/pending/requires-action/processing transactions.

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
