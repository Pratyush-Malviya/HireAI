# Organization Onboarding Flow Specification

> **Version:** 1.0 | **Type:** Product Specification | **Audience:** Engineering and Product
>
> Covers three distinct paths: self-serve purchase, super-admin invite with payment link, and invited team member join bypass.

---

## Flows at a glance

| Flow | Name | Description |
|------|------|-------------|
| Flow 1 | Self-Serve Purchase | Org admin discovers the product, picks a tier, configures the org, and pays independently. |
| Flow 2 | Super-Admin Invite | Internal super-admin creates the org, sets the plan and seat count, sends a payment link to the admin. |
| Flow 3 | Invited Member Bypass | Team member clicks a join link, skips pricing entirely, registers or signs in, and lands in the org workspace. |

> **Pricing bypass rule (applies to all flows)**
> Any user arriving via `/join/:orgId?token=xyz` bypasses the pricing page entirely. The seat was purchased by the org admin. Showing a pricing screen to an invited member is incorrect behavior. The bypass must be enforced server-side, not just by hiding the pricing UI.

---

## Table of contents

1. [Flow 1 - Self-Serve Organization Purchase](#flow-1---self-serve-organization-purchase)
2. [Flow 2 - Super-Admin Initiated Invite](#flow-2---super-admin-initiated-invite)
3. [Flow 3 - Invited Team Member Join (Pricing Bypass)](#flow-3---invited-team-member-join-pricing-bypass)
4. [Shared Data Model and API Routes](#shared-data-model-and-api-routes)
5. [Decision Reference](#decision-reference)
6. [Revision History](#revision-history)

---

## Flow 1 - Self-Serve Organization Purchase

The self-serve flow allows any visitor to discover the product, choose a pricing tier, configure their organization, and complete payment without any involvement from the internal team. This is the primary growth path for smaller organizations.

### 1.1 Flow summary

| # | Step | Description | Actor |
|---|------|-------------|-------|
| 01 | Landing / pricing page | Visitor browses available tiers (Free, Pro, Business, Enterprise). Clicks a plan CTA to begin. | Visitor |
| 02 | Register or sign in | Create a new account or sign in to an existing one. The chosen tier is stored in session for the next step. | Visitor |
| 03 | Org details form | Fill in organization name, industry, admin full name, admin email, and phone number. | Admin |
| 04 | User seat selector | Enter the number of users. Price auto-calculates using the formula: `seats × price per seat = total`. The total updates live as the count changes. | Admin |
| 05 | Checkout and payment | Admin enters payment details. Stripe or Razorpay processes the transaction. An invoice is sent to the admin email on success. | Admin |
| 06 | Org provisioned, admin logged in | On payment confirmation, the org record is created with `status: active`. The admin is automatically logged in and redirected to the admin dashboard. | System |
| 07 | Seat management panel | Admin sees N available seats matching what was purchased. Admin enters team member email addresses to send invites. Each invite consumes one seat. | Admin |
| 08 | Team member joins via invite | Invited user clicks `/join/:orgId?token=xyz`. Bypasses pricing. Registers or signs in. Lands in org workspace. One seat is decremented. | Team member |

### 1.2 Form field specification

| Field | Validation rules |
|-------|-----------------|
| Organization name | Required. 2-100 characters. Alphanumeric plus spaces, hyphens, and ampersands. |
| Industry | Required. Dropdown selection from a predefined list. |
| Admin full name | Required. 2-80 characters. |
| Admin email | Required. Valid email format. Must be unique across all admin accounts. |
| Admin phone | Optional. E.164 format recommended for international compatibility. |
| Number of seats | Required. Integer, minimum 1, maximum defined per tier. Defaults to 1. |

### 1.3 Pricing calculation logic

```
total_amount = seats × price_per_seat_for_selected_tier
```

- Price updates in real time as the seat count input changes (debounced, 300ms).
- Show unit price, seat count, and grand total clearly before the user reaches checkout.
- Apply any promotional codes before displaying the final total.

### 1.4 Post-payment state

After successful payment, the following must happen in a single atomic operation or in a reliable queue:

1. Create the org record with `status: active` and the purchased seat count.
2. Create the admin user account and link it to the org with `role: admin`.
3. Record the subscription with the tier, seat count, billing cycle, and payment reference.
4. Send a confirmation email to the admin with the invoice and a link to the dashboard.
5. Auto-log the admin in and redirect to `/org/:orgId/dashboard`.

### 1.5 Edge cases

| Edge case | Trigger condition | Recommended response |
|-----------|------------------|---------------------|
| Payment fails | Stripe or Razorpay returns a failure event. | Show an error on the checkout page. Org is not created. Admin can retry without re-filling the form. |
| Duplicate email | Admin email already exists as another admin account. | Show a validation error on the org details form. Offer a sign-in link instead. |
| Session lost mid-flow | User closes browser after step 3 but before payment. | Restore org details from local storage or session cookie. Do not charge twice. |
| Zero seats selected | Admin sets seat count to 0 before checkout. | Disable the checkout button. Seat count must be at least 1. |
| Seat limit exceeded | Admin enters a seat count beyond the tier maximum. | Cap the input and show a tooltip: "Maximum X seats on this plan. Contact us for more." |

---

## Flow 2 - Super-Admin Initiated Invite

In this flow, an internal super-admin sets up the organization on behalf of a prospective customer - typically after a sales conversation or a negotiated deal. The org admin receives a payment link by email and pays to activate the account.

### 2.1 Flow summary

| # | Step | Description | Actor |
|---|------|-------------|-------|
| 01 | Super-admin creates org in back-office | Fills in org name, industry, admin contact details, assigned tier, and seat count. Confirms the pre-calculated total. | Super-admin |
| 02 | Org record created in pending state | System creates the org with `status: pending_payment`. No access is granted yet. | System |
| 03 | Payment link generated | System generates a unique, expiring checkout session URL tied to this org record. The link is specific to the agreed plan and seat count. | System |
| 04 | Invite email dispatched | Admin receives an email with: org name, tier summary, seat count, total amount due, and the unique payment link. Link expires after N days (configurable, default 7). | System |
| 05 | Admin opens payment link | Org admin clicks the link. Sees a pre-filled checkout: org name, plan, seat count, amount. Cannot change the plan or seat count at this stage. | Org admin |
| 06 | Admin completes payment | Admin enters card details and pays. Payment is processed by Stripe or Razorpay. | Org admin |
| 07 | Org activated, admin gains access | Org status flips from `pending_payment` to `active`. Admin receives login credentials or a magic link via email. Logs into the org panel. | System |
| 08 | Admin invites team members | Admin sees the N seats pre-set by the super-admin. Adds team member emails. Each invite consumes one seat. | Org admin |
| 09 | Team member joins via invite | Invited user clicks `/join/:orgId?token=xyz`. Bypasses pricing. Registers or signs in. Lands in org workspace. One seat is decremented. | Team member |

### 2.2 Back-office form specification

| Field | Notes |
|-------|-------|
| Organization name | Required. Stored as the org's display name in the admin panel. |
| Industry | Required. Dropdown from the standard list. |
| Admin full name | Required. Used in the invite email salutation. |
| Admin email | Required. The payment link is sent to this address. |
| Admin phone | Optional. Stored for account support reference. |
| Assigned tier | Required. Super-admin selects from available tiers. Supports custom pricing overrides for negotiated deals. |
| Number of seats | Required. Minimum 1. Super-admin sets this based on the agreed deal terms. |
| Payment link expiry | Optional. Defaults to 7 days. Super-admin can set a custom expiry per org. |
| Internal notes | Optional. Free-text field visible only in the back-office. Used for deal context. |

### 2.3 Org lifecycle states

| Status | Description |
|--------|-------------|
| `pending_payment` | Org record exists. Payment link has been sent. Admin has not yet paid. No login access granted. |
| `active` | Payment confirmed. Admin and team members can log in. Seat management is enabled. |
| `expired` | Payment link was not used within the expiry window. Super-admin must regenerate the link from the back-office. Org record is not deleted. |
| `suspended` | Admin manually suspended by super-admin. All user logins are blocked. |

### 2.4 Payment link behavior

- The link is single-use per checkout session. Opening it twice does not create two charges.
- The link carries the org ID, plan, seat count, and amount in a signed token. These cannot be modified by the recipient.
- If a super-admin regenerates the link, the previous link is invalidated.
- Custom pricing (discounted or negotiated rates) is embedded in the checkout session, not in the public pricing table.
- After successful payment, the link redirects the admin to a confirmation page with login instructions.

### 2.5 Edge cases

| Edge case | Trigger condition | Recommended response |
|-----------|------------------|---------------------|
| Payment link expires | Admin does not pay within the expiry window. | Show "This invite has expired" screen. Super-admin regenerates the link from the back-office without losing org data. |
| Admin pays twice | Admin clicks pay on a link that was already used. | Stripe/Razorpay idempotency keys prevent double charge. Show "Already activated" screen with a login link. |
| Super-admin edits after sending | Super-admin changes seat count after the link is sent. | Invalidate the old link. Regenerate with updated terms. Re-send the invite email automatically. |
| Admin email bounces | The invite email is undeliverable. | Show delivery failure in back-office. Super-admin corrects the email and resends. |
| Org already active | Super-admin accidentally creates a duplicate org for the same customer. | Back-office should validate for duplicate admin email and org name before creating the record. |

---

## Flow 3 - Invited Team Member Join (Pricing Bypass)

This flow applies to all non-admin users who have been invited by an org admin after the organization has been successfully activated via Flow 1 or Flow 2. The fundamental rule is: invited team members never see pricing or payment screens.

> **Core bypass rule**
> An invite token proves that a seat has already been paid for. Showing pricing to an invited member is an error - the cost is not theirs to pay. The bypass must be enforced server-side. Hiding the pricing page in the UI alone is not sufficient.

### 3.1 Flow summary

| # | Step | Description | Actor |
|---|------|-------------|-------|
| 01 | Admin sends invite | Org admin enters a team member email in the seat management panel. System generates a unique, signed invite token. | Org admin |
| 02 | Invite email delivered | Team member receives an email with their name, org name, and a unique link: `/join/:orgId?token=xyz`. The token is tied to the invited email address and one seat. | System |
| 03 | Member clicks join link | Server validates: correct org, token not expired, seat still available, email matches token. | System |
| 04 | Pricing page bypassed | Session is flagged with `invited=true` and `orgId`. All pricing and checkout routes skip for this session. No pricing UI is rendered. | System |
| 05 | Register or sign in | New user: shown a simple form with name and password. Email is pre-filled and locked from the token. Existing user: shown a confirmation screen to accept the invite. | Team member |
| 06 | Account linked to org | User record is created or updated. User is linked to the org with `role: member`. The invite token is invalidated. Seat count is decremented by 1. | System |
| 07 | Redirect to org workspace | Member lands in `/org/:orgId/workspace` with member-level access. No payment prompt is ever shown. | System |

### 3.2 Token specification

The invite token must encode the following claims and be cryptographically signed to prevent tampering.

| Token field | Purpose |
|-------------|---------|
| `org_id` | The target organization. Used to validate the join route. |
| `invited_email` | The email address this invite was issued to. Must match the email used to register or sign in. |
| `seat_reservation_id` | References a specific reserved seat in the org's seat table. Prevents race conditions when multiple tokens are outstanding. |
| `issued_at` | Timestamp of when the token was created. Used to calculate expiry. |
| `expires_at` | Hard expiry timestamp. Default 72 hours from issue. Configurable per org. |
| `token_version` | Incremented when a token is regenerated by the admin. Invalidates previous tokens for the same email. |

### 3.3 Seat consumption rules

- Each invite email generates exactly one token tied to one reserved seat.
- A seat is considered consumed when the invited user completes step 5 (registration or sign-in confirmation).
- If the token expires before the user joins, the reserved seat is released back to the org's available pool.
- If an admin re-invites the same email, the previous token is invalidated and a new one is issued.
- If the org has zero available seats when an admin attempts to invite, the system blocks the invite and prompts the admin to purchase more seats.

### 3.4 Invite email content

| Email element | Content |
|---------------|---------|
| Subject | "You have been invited to join [Org Name] on [Product Name]" |
| Salutation | Hi [First Name], |
| Body | [Admin Name] has invited you to join [Org Name]. Click the button below to set up your account. No payment is required. |
| CTA button | "Accept invite" - links to `/join/:orgId?token=xyz` |
| Expiry notice | "This invite expires in 72 hours. If it expires, ask your admin to resend." |
| Footer | If you did not expect this invite, you can safely ignore this email. |

### 3.5 Edge cases

| Edge case | Trigger condition | Recommended response |
|-----------|------------------|---------------------|
| Token expired | Member clicks the link after the expiry window. | Show: "This invite has expired. Ask your admin to send a new one." No account is created. |
| No seats available | All seats were consumed before the member clicked the link. | Show: "No seats are available. Contact your organization admin." Do not create the account. |
| Email mismatch | Member attempts to register with a different email than the one in the token. | Block the registration. Show: "This invite was sent to [invited_email]. Please use that email to join." |
| Token already used | Member clicks the link a second time after already joining. | Detect that the `seat_reservation_id` is already consumed. Redirect to the org login page instead. |
| Org is inactive | Org payment failed or subscription was suspended after the invite was sent. | Block the join. Show: "Your organization account is not active. Contact your admin." |
| Existing user from another org | Member already has an account linked to a different org. | Confirm they want to join the new org. Handle multi-org membership per your product's data model. |

---

## Shared Data Model and API Routes

### 4.1 Key database tables

| Table / field | Purpose |
|---------------|---------|
| `orgs.id` | Primary key. UUID. Referenced in all join links as `:orgId`. |
| `orgs.status` | Enum: `pending_payment`, `active`, `expired`, `suspended`. |
| `orgs.tier` | Current pricing tier. |
| `orgs.seat_count` | Total purchased seats. |
| `orgs.seats_used` | Count of active team members. `seats_used <= seat_count` enforced at invite time. |
| `subscriptions.payment_ref` | Stripe/Razorpay charge or subscription ID. Used for idempotency. |
| `invite_tokens.token` | Signed JWT or opaque token. One per invited email per org. |
| `invite_tokens.seat_reservation_id` | FK to a reserved row in `org_seats`. Prevents overselling. |
| `invite_tokens.expires_at` | Hard expiry. Indexed for background cleanup jobs. |
| `invite_tokens.used_at` | Null until the member completes join. Set atomically with seat consumption. |

### 4.2 API route summary

| Route | Method | Description |
|-------|--------|-------------|
| `/api/orgs` | `POST` | Create a new org (self-serve). Validates payload, creates pending subscription. |
| `/api/orgs/:id/payment-link` | `POST` | Generate or regenerate a payment link (super-admin only). |
| `/api/checkout/webhook` | `POST` | Stripe/Razorpay webhook. Activates org on payment success. |
| `/api/orgs/:id/invites` | `POST` | Admin sends an invite to a team member email. Validates seat availability. |
| `/join/:orgId` | `GET` | Validates token, sets session, renders join UI (no pricing). |
| `/join/:orgId/confirm` | `POST` | Completes the join: creates user, links to org, consumes seat. |

### 4.3 Security considerations

- All invite tokens must be signed with HMAC-SHA256 or issued as JWTs with a server secret. Never use sequential or guessable IDs in join links.
- The `/join/:orgId` route must validate the token server-side before rendering any page. A missing or invalid token should return a 400 error, not a blank join form.
- Payment links generated for Flow 2 must be single-use checkout sessions (Stripe CheckoutSession or equivalent). The session ID should not be reusable after payment.
- Seat consumption (step 6 of Flow 3) must be an atomic database operation. Use `SELECT ... FOR UPDATE` or equivalent lock to prevent two users consuming the same seat simultaneously.
- Rate-limit the `/join/:orgId` route to prevent token enumeration attacks.
- Admin-level routes (`/api/orgs`, `/api/orgs/:id/invites`) must be protected by an auth middleware that confirms the requesting user holds the admin role for that org.

---

## Decision Reference

Key decisions that affect how the three flows interact. These should be resolved before implementation begins.

| Decision | Question | Recommendation |
|----------|----------|----------------|
| Seat count in Flow 2 | Can the org admin adjust the seat count when they receive the payment link? | No. The count is set by the super-admin based on the deal. Allow changes only via a back-office re-issue. |
| Multi-org membership | Can a team member belong to more than one org? | Decide based on your data model. If yes, the join flow must handle linking an existing user to a second org without overwriting their primary account. |
| Free tier and invites | Does the free tier have a seat limit? Can free org admins send invites? | If yes, apply the same seat consumption logic. If no seat limit, skip the seat availability check in step 3 of Flow 3. |
| Admin seat consumption | Can the admin who set up the org also appear in the seat management panel? | The admin account should not consume a purchased seat. Admin is a separate role from a billed team member seat. |
| Payment provider | Stripe or Razorpay or both? | If both, abstract the checkout session creation behind a single internal service so the flow logic is payment-provider-agnostic. |

---

## Revision History

| Version / Date | Change summary |
|----------------|----------------|
| 1.0 | Initial specification covering Flow 1 (self-serve), Flow 2 (super-admin invite), and Flow 3 (invited member bypass) with edge cases, data model, and API route summary. |
