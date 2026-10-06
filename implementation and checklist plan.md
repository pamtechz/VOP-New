# MASTER PRODUCTION AUDIT, GAP ANALYSIS & IMPLEMENTATION PROMPT

You are acting as the **Lead Marketplace Architect, Senior Full-Stack Engineer, Database Architect, Security Engineer, DevOps Engineer, QA Engineer, UX Architect, Payments Engineer, Logistics Engineer, and Production Readiness Auditor** for this project.

Your task is NOT to produce a superficial report.

Your task is to:

1. Inspect the entire existing application and repository.
2. Determine exactly what is already implemented.
3. Determine what is partially implemented.
4. Determine what is broken, duplicated, insecure, hardcoded, poorly architected, or incomplete.
5. Compare the application against the complete marketplace requirements below.
6. Design the correct architecture for anything missing.
7. IMPLEMENT all missing or inadequate functionality.
8. Refactor weak implementations rather than adding duplicate systems.
9. Test the implementation.
10. Continue working until the application is at **production marketplace standard**, not foundational/MVP/demo standard.

Do not stop after creating placeholders, interfaces, empty pages, mock services, TODO comments, skeleton APIs, or fake data.

The final application must function as a serious **multi-vendor marketplace comparable in architecture and operational capability to platforms such as eBay**, while also supporting local-market requirements such as local delivery, pickup, Mobile Money, offline resilience where appropriate, and location-based fulfillment.

---

# 1. CORE RULE: AUDIT BEFORE IMPLEMENTING

Before changing anything, inspect the entire codebase.

Analyze:

- frontend
- backend
- Supabase
- database schema
- migrations
- SQL
- RLS policies
- authentication
- authorization
- API routes
- server actions
- Edge Functions
- storage
- queues
- cron jobs
- webhooks
- payment integrations
- seller functionality
- buyer functionality
- admin functionality
- delivery functionality
- order handling
- inventory
- marketplace financial flows
- notifications
- analytics
- settings
- existing abstractions
- reusable components
- mobile responsiveness
- offline functionality
- logging
- error handling
- performance
- security
- tests
- deployment configuration

Search for existing implementations before adding anything.

Do NOT create two systems that solve the same problem.

Where overlapping features already exist, consolidate them into one canonical production implementation.

---

# 2. CREATE A FEATURE IMPLEMENTATION MATRIX

Before major implementation, internally classify every requirement as:

- COMPLETE
- PARTIAL
- BROKEN
- MISSING
- DUPLICATED
- HARDCODED
- SECURITY RISK
- PERFORMANCE RISK
- UX PROBLEM
- DATA-MODEL PROBLEM

For every PARTIAL, BROKEN, MISSING, DUPLICATED, or risky item:

- identify the current implementation
- identify the problem
- determine the correct production architecture
- implement the correction

Do not merely report the gap.

FIX IT.

---

# 3. MARKETPLACE ARCHITECTURE

The application must operate as a real multi-vendor marketplace.

The core domain should support:

Platform  
→ Sellers  
→ Stores  
→ Products  
→ Product Variants  
→ Inventory  
→ Warehouses / Stock Locations  
→ Cart  
→ Checkout  
→ Marketplace Order  
→ Seller Orders  
→ Fulfillments  
→ Shipments / Local Deliveries / Pickup  
→ Payments  
→ Marketplace Ledger  
→ Seller Balances  
→ Payouts  
→ Returns  
→ Refunds  
→ Disputes  
→ Reviews  
→ Support

A marketplace order containing products from multiple sellers MUST NOT be treated as one indivisible seller order.

Properly support:

- parent marketplace order
- seller sub-orders
- individual fulfillments
- separate seller settlements
- split refunds
- partial refunds
- split deliveries
- different fulfillment methods per seller where necessary
- seller-specific statuses
- marketplace-level statuses

---

# 4. ADMIN INFORMATION ARCHITECTURE

Avoid an admin portal containing dozens of unrelated top-level tabs.

Organize the platform approximately into these major workspaces:

1. Dashboard
2. Commerce
3. Catalog
4. Sellers
5. Customers
6. Fulfillment
7. Finance
8. Trust & Safety
9. Marketing
10. Support
11. Analytics
12. Platform / Settings

Child functionality should live inside the appropriate workspace.

The UI must remain usable as features increase.

Implement:

- responsive admin navigation
- collapsible sidebar
- breadcrumbs
- global search
- filters
- saved views
- table/card switch where appropriate
- configurable table columns
- pagination
- bulk actions
- sorting
- export
- loading skeletons/shimmer
- proper empty states
- proper failure states
- confirmation for destructive actions
- undo where reasonable
- optimistic updates where safe

Do NOT refresh the entire application unnecessarily when data changes.

Use targeted cache invalidation, state updates, revalidation, realtime subscriptions, or background refetching.

---

# 5. ADMIN COMMAND CENTER

Audit and implement a production-grade dashboard containing meaningful real data such as:

- GMV
- platform revenue
- net revenue
- orders today
- average order value
- active buyers
- active sellers
- new users
- pending seller approvals
- pending listing approvals
- payment failures
- open disputes
- refund requests
- seller payouts due
- platform commissions
- delivery activity
- failed deliveries
- low-stock alerts
- fraud alerts
- support tickets
- advertising revenue
- conversion rate
- cart abandonment
- top products
- top categories
- top sellers
- geographic performance
- realtime marketplace activity

Allow date ranges and comparisons.

Avoid fake dashboard values.

---

# 6. BUYER MANAGEMENT

Admin must be able to manage:

- buyer profiles
- account status
- addresses
- delivery addresses
- saved locations
- orders
- returns
- refunds
- disputes
- reviews
- wishlist
- cart
- saved searches
- purchase history
- loyalty
- wallet where enabled
- communication history
- login/session history
- user verification
- internal admin notes
- risk status

Supported admin actions should include, where authorized:

- suspend
- restrict
- reactivate
- ban
- force logout
- revoke sessions
- reset authentication where appropriate
- anonymize/delete according to retention rules
- export personal data
- merge duplicate accounts where safe

Every sensitive action must be audited.

---

# 7. SELLER MANAGEMENT

Implement full seller lifecycle management:

- seller registration
- seller application
- individual seller
- business seller
- KYC
- KYB
- identity documents
- company documents
- payout information
- application review
- approval
- rejection
- appeal
- suspension
- restriction
- reinstatement
- permanent removal

Seller profile should support:

- storefront
- business information
- seller verification
- seller badge
- seller status
- selling limits
- listing limits
- commission plan
- subscription plan
- delivery capabilities
- allowed categories
- restricted categories
- supported regions
- working hours
- vacation mode
- seller staff
- payout settings

Track seller performance metrics including:

- order defect rate
- late dispatch
- cancellation rate
- refund rate
- dispute rate
- delivery success
- seller response times
- customer ratings
- policy violations

Allow warning, restriction, temporary suspension, permanent suspension, payout hold, payout release, and appeals.

Do not reduce seller management to a simple active/inactive flag.

---

# 8. STORE MANAGEMENT

Support seller storefront management including:

- store name
- logo
- banner
- description
- contact details
- social links
- location
- pickup locations
- opening hours
- delivery settings
- store policies
- categories
- ratings
- featured products
- SEO
- slug/custom URL
- verification
- store status
- pause store
- vacation mode
- closure
- ownership transfer where appropriate

---

# 9. PRODUCT & CATALOG MANAGEMENT

Implement:

- products
- variants
- SKUs
- brands
- categories
- subcategories
- product attributes
- attribute groups
- sizes
- colours
- materials
- condition
- specifications
- product media
- videos
- attachments
- pricing
- sale pricing
- stock
- seller ownership
- moderation status

Product lifecycle:

- draft
- pending review
- approved
- active
- rejected
- suspended
- archived
- deleted

Admin must support:

- approve
- reject
- suspend
- edit
- archive
- restore
- delete
- bulk actions
- bulk import
- bulk export
- bulk price changes
- duplicate detection
- counterfeit reporting
- prohibited product management
- scheduled publishing
- listing expiry
- featured listings

Do not hardcode product categories, brands, product attributes, delivery rules, commissions, or listing policies.

---

# 10. INVENTORY

Implement production-grade inventory including:

- inventory per seller
- inventory per location
- warehouses
- stores
- stock locations
- available stock
- reserved stock
- damaged stock
- returned stock
- incoming stock
- transfers
- adjustments
- stock history
- reorder thresholds
- low-stock alerts
- out-of-stock handling
- overselling prevention
- barcode
- QR
- SKU
- serial numbers where applicable
- batch numbers where applicable
- expiry dates where applicable
- purchase orders where applicable
- suppliers where applicable
- stocktakes

Use transaction-safe inventory updates.

Do not allow race conditions to oversell products.

---

# 11. ORDER MANAGEMENT

Support:

- pending payment
- payment confirmed
- processing
- picking
- packed
- ready for dispatch
- ready for pickup
- dispatched
- out for delivery
- delivered
- collected
- failed delivery
- cancelled
- partially fulfilled
- partially refunded
- refunded
- returned
- disputed

Orders must support:

- multiple sellers
- multiple packages
- partial fulfillment
- split shipment
- split delivery
- split pickup
- partial refund
- order notes
- internal notes
- invoice
- receipt
- packing slip
- labels
- timelines
- event history
- audit trail

Model fulfillment as a real state machine.

Do not create invalid status combinations.

---

# 12. LOCAL DELIVERY

Local delivery is a first-class fulfillment method.

Support:

- platform delivery
- seller delivery
- independent courier
- third-party courier
- customer-arranged delivery where enabled

Delivery types:

- same day
- express
- standard
- scheduled
- on-demand

Delivery eligibility may be based on:

- country
- province/state
- city
- town
- district
- postal code
- named zone
- radius
- geofence
- polygon
- distance

Fee options:

- fixed fee
- per kilometre
- zone-based fee
- weight-based fee
- size-based fee
- free-delivery threshold
- seller-funded delivery
- platform-funded delivery
- buyer-paid delivery
- surcharge

Support:

- delivery time slots
- delivery capacity
- cut-off times
- seller operating hours
- blackout dates
- holidays
- estimated delivery time
- delivery instructions
- contactless delivery

Proof of delivery should support configurable combinations of:

- PIN
- OTP
- QR
- signature
- photo
- GPS
- timestamp

Support:

- delivery assignment
- re-assignment
- route
- tracking
- failed delivery
- failed delivery reason
- reschedule
- redelivery
- return to seller
- delivery disputes

---

# 13. PICKUP / CLICK AND COLLECT

Support:

- seller pickup
- store pickup
- warehouse pickup
- pickup points

Features:

- pickup locations
- operating hours
- pickup time slots
- pickup capacity
- ready-for-pickup status
- push/email/SMS notification
- pickup QR
- pickup PIN
- staff verification
- identity verification where necessary
- pickup expiry
- reschedule
- cancellation
- collection confirmation
- proof of collection

Ensure pickup cannot be fraudulently marked complete without appropriate verification.

---

# 14. DRIVER / COURIER MANAGEMENT

Support:

- platform drivers
- seller drivers
- courier partners
- independent couriers

Manage:

- onboarding
- verification
- driver's licence
- vehicle information
- status
- availability
- assignment
- job acceptance
- auto-dispatch
- manual dispatch
- delivery batches
- delivery routes
- GPS
- delivery status
- proof of delivery
- driver earnings
- cash collected
- cash reconciliation
- driver ratings
- complaints
- suspension
- performance analytics

---

# 15. SHIPPING

Support national/international shipping where applicable:

- shipping zones
- seller shipping
- platform shipping
- third-party couriers
- carrier APIs
- shipping rates
- flat rates
- calculated rates
- weight-based rates
- dimension-based rates
- free shipping
- tracking
- labels
- packages
- partial shipment
- shipment events
- insurance
- signature requirements
- lost shipment
- damaged shipment
- failed delivery

---

# 16. CHECKOUT

Checkout must correctly handle:

- multiple sellers
- multiple fulfillment methods
- local delivery
- shipping
- pickup
- coupons
- discounts
- taxes
- delivery charges
- platform fees where applicable
- currency conversion
- seller restrictions
- product availability
- stock reservation
- payment
- payment verification
- retry handling
- duplicate transaction prevention

Use idempotency.

Never trust totals submitted by the client.

All financial totals must be recalculated server-side.

---

# 17. PAYMENTS

Audit all payment systems.

Only payment methods that are:

- configured
- enabled
- valid for the country
- valid for the currency
- valid for the transaction

should appear to the user.

Support where configured:

- Mobile Money
- cards
- bank payments
- wallet
- cash on delivery
- other payment providers

Payment states should include:

- initiated
- pending
- authorized
- successful
- failed
- expired
- cancelled
- reversed
- refunded
- partially refunded
- disputed

Implement proper:

- server-side verification
- webhook verification
- webhook idempotency
- duplicate protection
- retry handling
- provider reference storage
- payment reconciliation
- event logs

Never trust client-side payment success.

---

# 18. CURRENCY CONVERSION

The marketplace may list products in currencies different from the active payment provider's settlement currency.

If:

Product = USD

but

Active Mobile Money provider = ZMW only

then:

1. Obtain the current valid exchange rate.
2. Calculate the payable ZMW amount server-side.
3. Display the original currency.
4. Display the converted currency.
5. Display the exchange rate used.
6. Lock the rate for the checkout/payment session where appropriate.
7. Store the actual rate used with the transaction.
8. Store original amount and converted amount.
9. Prevent subsequent exchange-rate changes from corrupting historical transaction records.

Support configurable:

- base currency
- display currency
- settlement currency
- conversion provider
- conversion markup
- rounding
- rate expiry
- fallback behavior

Do not hardcode exchange rates.

---

# 19. MARKETPLACE FINANCIAL LEDGER

DO NOT calculate marketplace balances merely from mutable order records.

Implement a proper financial ledger.

Track immutable financial entries for:

- buyer payments
- seller gross earnings
- platform commission
- gateway fees
- delivery fees
- seller delivery earnings
- platform delivery revenue
- taxes
- promotions
- seller-funded discount
- platform-funded discount
- refunds
- partial refunds
- payout
- payout reversal
- chargeback
- dispute hold
- dispute release
- adjustments
- advertising charges
- subscription charges

Balances should be derivable from ledger entries.

Support:

- pending balance
- processing balance
- held balance
- available balance
- paid-out balance

Use appropriate transactional locking and idempotency.

---

# 20. ESCROW / FUND HOLDS

Support configurable fund holding before seller payout.

Funds may remain pending/held because of:

- order not delivered
- pickup not confirmed
- return window
- active dispute
- fraud review
- seller risk
- payment provider delay
- chargeback risk

Implement explicit hold/release logic.

Do not silently change seller balances.

All holds and releases must be auditable.

---

# 21. SELLER PAYOUTS

Support:

- automatic payout
- manual payout
- payout requests where enabled
- payout schedules
- daily
- weekly
- monthly
- minimum payout
- payout fees
- bank payout
- Mobile Money payout
- payout hold
- payout failure
- payout retry
- payout cancellation where valid
- reconciliation
- payout statements

Payout processing must be transaction-safe and idempotent.

Admins must not be able to accidentally pay the same balance twice.

---

# 22. COMMISSION & MARKETPLACE FEES

Support configurable:

- global commission
- seller-specific commission
- category commission
- product commission
- fixed fee
- percentage fee
- listing fee
- subscription fee
- advertising fee
- featured listing fee
- delivery fee
- withdrawal fee
- gateway fee treatment
- promotional commissions
- temporary exemptions

Rules must have:

- effective dates
- priority
- scope
- audit history

Do not hardcode commission percentages.

---

# 23. RETURNS

Implement complete returns including:

- return request
- return reason
- return eligibility
- evidence
- buyer images/video
- seller response
- admin review
- return delivery
- drop-off
- pickup
- return received
- inspection
- approve
- reject
- replacement
- exchange
- full refund
- partial refund

Return windows and policies must be configurable by:

- marketplace
- category
- seller
- product where appropriate

---

# 24. REFUNDS

Support:

- full refund
- partial refund
- item-level refund
- shipping refund
- delivery refund
- seller-funded refund
- platform-funded refund
- payment provider refund

Refunds must update:

- ledger
- order
- seller balance
- commissions
- taxes
- inventory where applicable
- payout eligibility

Never simply mutate the order total without financial ledger entries.

---

# 25. DISPUTES & BUYER PROTECTION

Support disputes such as:

- item not received
- item not as described
- counterfeit
- wrong item
- damaged item
- missing item
- unauthorized payment
- duplicate charge
- delivery dispute
- refund not received

Provide:

- case creation
- evidence
- buyer statement
- seller statement
- courier evidence
- messages
- timeline
- escalation
- admin mediation
- appeal
- final ruling

Possible outcomes:

- buyer refund
- partial refund
- seller wins
- payout release
- payout hold
- seller penalty
- account restriction
- return required

---

# 26. REVIEWS & REPUTATION

Implement:

- product reviews
- seller reviews
- delivery reviews
- courier reviews where appropriate

Support:

- verified purchase indicator
- seller response
- reports
- moderation
- spam detection
- suspicious review patterns
- admin removal
- appeal

Do not allow arbitrary review deletion without an audit trail.

---

# 27. PROMOTIONS

Support:

- coupons
- automatic discounts
- percentage discounts
- flat discounts
- category discounts
- product discounts
- seller discounts
- buy X get Y
- free delivery
- first-order promotions
- referral discounts
- loyalty rewards
- flash sales
- location-specific promotions

Support:

- start date
- end date
- usage limit
- user limit
- seller funding
- platform funding
- eligibility
- country/location rules

---

# 28. ADVERTISING SYSTEM

The platform must support both automated and custom marketplace advertising.

Implement:

- advertisers
- campaigns
- sponsored products
- sponsored sellers
- homepage banners
- category banners
- search advertising
- native/in-feed ads
- promotional placements
- custom partner/client advertising

Support:

- advertiser information
- campaign approval
- creatives
- image/video
- destination
- start/end date
- budget
- CPC where enabled
- CPM where enabled
- fixed-fee campaign
- impression tracking
- click tracking
- conversion tracking
- CTR
- targeting
- geographic targeting
- category targeting
- audience targeting
- frequency caps
- campaign pause/resume

Custom ads entered by platform administrators must use the same rendering and analytics infrastructure as other supported ads wherever possible.

---

# 29. SEARCH & DISCOVERY

Audit search.

Implement:

- full-text search
- typo tolerance
- category filtering
- seller filtering
- price filtering
- brand filtering
- location filtering
- rating filtering
- delivery filtering
- condition filtering
- sort
- relevance
- trending
- popularity
- personalized recommendations
- recently viewed
- related products
- similar products
- sponsored results

Admin should be able to inspect:

- top searches
- no-result searches
- trending searches
- search conversion
- suspicious search patterns

Avoid search implementations that require full database table scans.

---

# 30. MESSAGING

Support secure messaging for:

- buyer ↔ seller
- buyer ↔ support
- seller ↔ support
- buyer ↔ courier where appropriate

Features:

- realtime messages
- unread counts
- attachments
- order references
- product references
- moderation
- blocking
- reporting
- spam protection
- message retention
- support escalation

Do not expose sensitive private information unnecessarily.

---

# 31. NOTIFICATIONS

Support:

- in-app
- push
- email
- SMS
- WhatsApp where configured

Events may include:

- orders
- payment
- shipment
- delivery
- pickup
- refund
- return
- dispute
- seller verification
- seller suspension
- payouts
- price changes
- stock
- marketing
- account security
- inactivity warnings

Provide:

- templates
- localization
- variables
- user preferences
- logs
- retry handling
- provider failure tracking

---

# 32. CUSTOMER SUPPORT

Implement a unified support workspace:

- tickets
- conversations
- buyer context
- seller context
- orders
- payments
- returns
- disputes
- attachments
- assignment
- priority
- SLA
- escalation
- notes
- saved replies
- satisfaction score
- reporting

Avoid duplicating support inbox and messaging functionality unnecessarily.

---

# 33. TRUST & SAFETY

Implement risk controls for:

- fake sellers
- suspicious listings
- counterfeit products
- fraudulent orders
- payment abuse
- refund abuse
- coupon abuse
- fake reviews
- seller collusion
- account takeover
- duplicate accounts
- bot registrations
- spam
- prohibited products

Provide:

- risk events
- risk scores
- manual review
- watchlists
- blacklists
- velocity limits
- transaction limits
- temporary holds
- account freeze
- case history

High-impact decisions should have human review paths.

---

# 34. USER REPORTING

Allow users to report:

- product
- seller
- buyer
- review
- message
- advertisement
- counterfeit
- prohibited content
- abuse
- scam

Provide a moderation queue with:

- severity
- assignment
- evidence
- history
- outcome
- appeal

---

# 35. CMS

Admins should manage public content including:

- homepage
- banners
- featured categories
- featured products
- landing pages
- about
- help
- FAQs
- seller policies
- buyer protection
- delivery policy
- return policy
- privacy policy
- terms
- contact
- footer
- announcements
- maintenance messages
- app-update messages

Avoid hardcoding site content that belongs in CMS/configuration.

---

# 36. ANALYTICS

Implement trustworthy analytics for:

- GMV
- revenue
- platform revenue
- seller revenue
- commissions
- payments
- payout
- advertising
- delivery
- orders
- AOV
- conversion
- cart abandonment
- buyers
- seller growth
- customer retention
- seller retention
- repeat buyers
- product performance
- category performance
- geography
- refunds
- disputes
- fraud losses
- delivery performance
- inventory
- search
- marketing campaigns

Support:

- date filtering
- comparison periods
- export
- saved reports
- scheduled reporting if infrastructure supports it

---

# 37. ADMIN ROLES & PERMISSIONS

Do not use simplistic admin/user permission handling.

Implement RBAC and, where appropriate, scoped permissions.

Suggested roles may include:

- super_admin
- platform_admin
- seller_verification_officer
- catalog_moderator
- commerce_manager
- finance_officer
- payout_officer
- dispute_officer
- support_agent
- marketing_manager
- advertising_manager
- fulfillment_manager
- warehouse_manager
- fraud_officer
- auditor
- analyst

Permissions should be granular, e.g.:

- sellers.approve
- sellers.suspend
- products.approve
- orders.cancel
- orders.refund
- payouts.release
- disputes.resolve
- ads.approve
- reports.export
- users.suspend

Enforce permissions server-side.

Never rely solely on hidden UI controls.

---

# 38. AUDIT LOGGING

Audit all sensitive actions.

Store:

- actor
- role
- action
- resource
- resource ID
- timestamp
- before
- after
- reason
- source
- session
- relevant metadata

Audit:

- seller approval
- seller suspension
- user suspension
- price overrides
- refunds
- payouts
- disputes
- role changes
- permission changes
- payment configuration
- API credentials
- marketplace settings
- product moderation
- deletion
- admin impersonation if available

Protect audit records against unauthorized alteration.

---

# 39. SUPABASE SECURITY

Audit Supabase thoroughly.

Ensure:

- RLS enabled for exposed tables
- correct tenant/seller/user isolation
- admin policies
- seller policies
- buyer policies
- Storage RLS
- no insecure anon access
- no service-role key exposed in frontend
- no unrestricted storage buckets
- secure Edge Functions
- validated server inputs
- secret handling
- safe RPCs
- safe SECURITY DEFINER usage
- proper indexes
- database constraints
- foreign keys
- unique constraints
- check constraints

Treat security as deny-by-default.

---

# 40. DATABASE DESIGN

Inspect the current schema for:

- duplicated data
- JSON blobs used instead of normalized domain models
- missing foreign keys
- missing indexes
- unbounded queries
- inconsistent IDs
- missing created_at
- missing updated_at
- unsafe cascading deletes
- nullable fields that should not be nullable
- missing unique constraints
- impossible state combinations

Refactor carefully with migrations.

Never destructively reset production data just to simplify development.

Make migrations reversible or safely forward-only as appropriate.

---

# 41. STORAGE OPTIMIZATION

The application must be designed to support large numbers of users while remaining efficient on limited infrastructure.

Implement:

- client-side image optimization where appropriate
- server-side image validation
- thumbnails
- WebP/AVIF derivatives where appropriate
- file-size limits
- dimension limits
- media compression
- deduplication where practical
- orphan cleanup
- abandoned upload cleanup
- lifecycle rules
- seller storage quotas
- file-type restrictions
- safe filenames
- signed/private URLs where needed
- CDN/cache headers where appropriate

Never store large image/video binary data directly in relational database rows.

---

# 42. INACTIVE ACCOUNT LIFECYCLE

Current business requirement:

Accounts inactive for 2 months may be deleted according to platform policy.

Notify users approximately:

- 2 weeks before
- 1 week before
- 3 days before
- 2 days before
- 1 day before
- deletion day

Implement this as a proper lifecycle rather than immediately deleting rows.

Suggested states:

- active
- dormant
- deletion_warning
- scheduled_for_deletion
- grace_period
- anonymized/deleted

Any valid login/activity should cancel pending deletion where policy allows.

DO NOT blindly delete users that still have:

- active orders
- unresolved disputes
- refunds
- balances
- seller payouts
- legal/financial records
- required audit records

Separate personally identifiable data removal from legally required transactional retention.

---

# 43. OFFLINE & RESILIENCE

For workflows that genuinely benefit from offline access, such as:

- POS
- pickup
- courier delivery
- warehouse scanning

implement controlled offline capability using:

- local persistence
- queued mutations
- synchronization
- retries
- idempotency
- conflict resolution
- visible sync status

Do not blindly make every administrative action available offline.

Sensitive financial actions should generally require verified connectivity.

---

# 44. API & WEBHOOK ARCHITECTURE

Implement:

- validated API contracts
- authentication
- authorization
- idempotency
- pagination
- rate limiting
- request IDs
- consistent errors
- retries
- webhook signing
- event versioning where appropriate
- webhook logs
- retry queues
- dead-letter handling
- replay tooling where necessary

Do not silently swallow failed webhook processing.

---

# 45. PERFORMANCE

Profile the application.

Identify:

- N+1 queries
- duplicated API calls
- unnecessary refetching
- entire-page refreshes
- large bundles
- unindexed queries
- oversized responses
- repeated storage downloads
- unnecessary realtime subscriptions
- excessive Supabase reads
- expensive count queries
- slow search
- poor caching

Implement:

- indexes
- pagination
- cursor pagination where useful
- selective fields
- server aggregation
- caching
- lazy loading
- code splitting
- request deduplication
- appropriate realtime scopes

First load and refresh must feel fast.

Use shimmer/skeleton loading rather than blank screens or whole-app refreshes.

---

# 46. ERROR HANDLING

There must be no silent failures.

Implement:

- consistent API errors
- user-safe error messages
- retryable states
- internal logging
- correlation IDs
- failure telemetry
- failed-job visibility
- payment failure logs
- webhook failure logs
- notification failure logs

Do not expose stack traces, secrets, database errors, provider credentials, or internal IDs unnecessarily to end users.

---

# 47. SECURITY

Audit:

- authentication
- authorization
- CSRF where applicable
- XSS
- SQL injection
- SSRF
- insecure direct object references
- file upload attacks
- content-type spoofing
- malicious images/files
- open redirects
- session fixation
- brute force
- credential stuffing
- account enumeration
- webhook spoofing
- privilege escalation
- replay attacks
- payment tampering
- price manipulation
- coupon manipulation
- inventory manipulation

Add:

- rate limits
- reauthentication for sensitive actions
- MFA/passkeys where supported
- session controls
- login alerts
- IP/device risk signals where appropriate

---

# 48. CONFIGURATION: ZERO UNNECESSARY HARDCODING

Search the entire codebase for hardcoded:

- countries
- currencies
- commissions
- payment providers
- delivery fees
- delivery zones
- tax rates
- roles
- permissions
- categories
- statuses
- seller limits
- listing limits
- storage limits
- notification text
- advertisements
- URLs
- support contacts
- feature availability
- exchange rates
- marketplace policies

Move business-configurable values into appropriate:

- database configuration
- environment variables
- feature flags
- policy tables
- admin settings

Do not turn code constants that represent true protocol/domain invariants into unnecessary database configuration.

Use judgment.

---

# 49. ADMIN SETTINGS

Provide centralized configuration for:

- marketplace identity
- countries
- regions
- currencies
- languages
- payments
- commissions
- taxes
- delivery
- pickup
- shipping
- seller requirements
- product moderation
- prohibited categories
- return policy
- refund rules
- dispute rules
- payout rules
- order rules
- inactivity rules
- notifications
- advertising
- promotions
- roles
- permissions
- storage
- feature flags
- integrations
- security

---

# 50. PLATFORM OPERATIONS

Create a production operations workspace where authorized admins can inspect:

- API health
- database health
- storage usage
- scheduled jobs
- background jobs
- webhook health
- notification health
- payment provider health
- delivery integration health
- failed tasks
- queue backlog
- error rate
- application version
- deployment/version information
- feature flags
- maintenance mode

Do not expose infrastructure secrets.

---

# 51. DATA SAFETY

Protect financial and transactional records.

Use:

- database transactions
- idempotency
- row locking where necessary
- optimistic concurrency where appropriate
- append-only ledger concepts
- event logs

Never perform money movement with naive read → calculate → update logic that can race.

---

# 52. UX REQUIREMENTS

The app must feel like a polished commercial platform.

Improve:

- hierarchy
- typography
- spacing
- responsive layouts
- desktop
- tablet
- mobile
- touch targets
- accessibility
- keyboard navigation
- status visualization
- validation
- forms
- confirmations
- empty states
- loading states
- error states
- success feedback

Avoid:

- giant cards
- excessive whitespace
- excessive nested tabs
- duplicated navigation
- modal abuse
- developer terminology
- raw database IDs
- JSON shown to ordinary admins
- cryptic error messages

The admin should see business concepts, not implementation details.

---

# 53. RESPONSIVENESS

Every important admin area must work at:

- desktop
- laptop
- tablet
- mobile

Large tables should gracefully switch to:

- responsive tables
- compact rows
- cards
- horizontal overflow only where unavoidable

Admin navigation must function correctly on mobile.

---

# 54. ACCESSIBILITY

Implement:

- semantic HTML
- labels
- keyboard navigation
- focus management
- ARIA only where necessary
- usable contrast
- status not represented only by colour
- accessible forms
- accessible dialogs
- accessible tables

---

# 55. TESTING

Add or repair tests.

At minimum cover critical flows:

### Authentication

- buyer login
- seller login
- admin login
- authorization
- blocked account
- session revocation

### Seller

- apply
- approve
- reject
- suspend
- reinstate

### Catalog

- create listing
- approve listing
- stock update
- variant handling

### Checkout

- one seller
- multiple sellers
- local delivery
- pickup
- shipping
- coupons
- currency conversion

### Payment

- successful payment
- failed payment
- duplicate webhook
- delayed webhook
- reversed payment

### Fulfillment

- seller dispatch
- courier delivery
- pickup verification
- failed delivery

### Finance

- commission
- seller balance
- hold
- release
- payout
- partial refund
- full refund

### Disputes

- open
- evidence
- hold funds
- decision
- appeal

### Permissions

Confirm unauthorized users cannot perform privileged actions even through direct API calls.

---

# 56. PRODUCTION READINESS

Before declaring completion:

Run:

- lint
- type checking
- unit tests
- integration tests
- relevant E2E tests
- build
- migration validation
- database checks
- RLS/security tests

Fix:

- compilation errors
- type errors
- runtime errors
- failing tests
- broken routes
- broken imports
- broken responsive layouts
- console errors
- unhandled promise rejections
- duplicate data fetching
- invalid RLS
- migration inconsistencies

Do not finish with known high-severity errors.

---

# 57. DO NOT DO THESE

Do NOT:

- stop after analysis
- only create a checklist
- create fake pages
- create empty dashboard cards
- insert placeholder data
- hardcode important configuration
- bypass RLS
- expose service-role keys
- trust client-provided prices
- trust client payment success
- calculate seller balances from mutable orders alone
- duplicate an existing feature
- reset the database just because migrations are difficult
- destroy existing production data
- remove working features unnecessarily
- change architecture without checking existing dependencies
- mark TODOs as implementation
- say something is implemented when only the UI exists
- report completion while tests fail
- use fake integrations in production paths
- leave major production features disconnected from backend logic

---

# 58. IMPLEMENTATION STRATEGY

Work incrementally.

For each subsystem:

1. inspect existing implementation
2. identify reusable code
3. identify defects/gaps
4. design architecture
5. update database if required
6. implement backend
7. implement permissions/RLS
8. implement frontend
9. connect real data
10. add validation
11. add audit logging
12. test
13. verify mobile/responsive UI
14. verify error handling
15. verify permissions
16. verify no duplicate implementation remains

Commit/refactor logically if your environment supports commits.

---

# 59. PRIORITY ORDER

If the application has significant gaps, work approximately in this priority:

## P0 — Integrity & Security

- authentication
- permissions
- RLS
- database integrity
- payments
- marketplace ledger
- order architecture
- inventory locking
- webhooks
- seller balance
- payouts

## P1 — Core Marketplace

- sellers
- stores
- products
- inventory
- cart
- checkout
- marketplace orders
- fulfillment
- local delivery
- pickup
- shipping
- returns
- refunds

## P2 — Trust & Operations

- disputes
- moderation
- fraud
- audit logs
- notifications
- messaging
- support

## P3 — Growth

- promotions
- loyalty
- recommendations
- advertising
- analytics
- merchandising

## P4 — Optimization

- performance
- offline support
- advanced automation
- AI assistance
- operational dashboards

Do not use this priority to leave required features unfinished.

It controls implementation sequence only.

---

# 60. FINAL VALIDATION

At the end, perform another complete audit against this prompt.

For every requirement, determine:

- implemented
- tested
- secure
- integrated
- production-ready

Search again for:

- TODO
- FIXME
- MOCK
- placeholder
- temporary
- demo
- hardcoded
- stub
- fake
- not implemented
- console.log
- disabled validation
- bypass
- service role
- insecure policies

Resolve anything relevant.

---

# 61. FINAL REPORT FORMAT

Only after implementation is complete, provide a final report containing:

## A. What already existed

Describe substantial existing functionality preserved.

## B. What was incomplete

Describe important gaps discovered.

## C. What was implemented

List actual production implementations completed.

## D. What was refactored

Explain duplicated, weak, insecure, or hardcoded functionality replaced.

## E. Database changes

List migrations, important tables, indexes, constraints, policies and functions added or changed.

## F. Security improvements

Summarize:

- RLS
- RBAC
- API authorization
- payment protection
- secrets
- validation
- fraud controls

## G. Performance improvements

Summarize:

- queries
- indexes
- caching
- pagination
- loading behavior
- bundle/API optimization

## H. Tests performed

Provide results for:

- typecheck
- lint
- unit tests
- integration tests
- E2E
- production build

## I. Remaining limitations

Only list genuinely unavoidable remaining issues such as external credentials, unavailable third-party APIs, or infrastructure outside repository control.

Do NOT classify unfinished coding work as an "external limitation."

## J. Production readiness verdict

Give one of:

- NOT PRODUCTION READY
- PRODUCTION READY WITH EXTERNAL CONFIGURATION REQUIRED
- PRODUCTION READY

Explain the verdict.

---

# 62. COMPLETION STANDARD

The task is NOT complete because:

- pages exist
- tables exist
- APIs exist
- SQL exists
- UI looks finished

A feature is complete only when:

UI  

- backend  
- database  
- authorization  
- validation  
- error handling  
- auditability where required  
- actual data flow  
- responsive UX  
- tests

work together.

Continue working through the repository until the marketplace is coherent as one system.

Do not ask me to manually decide obvious implementation details that can be determined from the existing architecture and marketplace best practices.

Preserve good existing work.

Refactor bad architecture.

Implement missing architecture.

Fix defects discovered during the work.

Treat this application as a real marketplace expected to serve real buyers, sellers, couriers, administrators and financial transactions at scale.

The target is a **production-grade marketplace system, not a prototype.**
avoid comments on the UI. e.g ZERO-TRUST HANDSHAKE ACTIVE
the current app the admin when you click a button its taking long to respond the shimmer shows after 5-10 seconds from the click action
in app messaging is taking lonng and has no product reference in the chat, also add external chats like whatsapp
