# HireAI — Flow Gap Report

> **Combined analysis of user-flow and data-flow deficiencies** across Candidate, HR Admin, and Super Admin personas. Covers 35 gaps with prioritized fixes.

| Field | Detail |
|---|---|
| Documents analyzed | `user_flows.md`, `data_flows.md` |
| Personas covered | Candidate, HR Admin, Super Admin |
| Total gaps | 35 (22 user-flow + 13 data-flow) |
| High severity | 13 items |
| Medium severity | 15 items |
| Low severity | 7 items |

---

## Table of Contents

1. [User-Flow Gaps](#1-user-flow-gaps)
   - [Candidate](#11-candidate-user-flow--7-gaps)
   - [HR Admin](#12-hr-admin-user-flow--8-gaps)
   - [Super Admin](#13-super-admin-user-flow--4-gaps)
   - [Cross-cutting (Systemic)](#14-cross-cutting-systemic--3-gaps)
2. [Data-Flow Gaps](#2-data-flow-gaps)
   - [Architecture (Systemic)](#21-architecture--systemic--5-gaps)
   - [Candidate](#22-candidate-data-flow--3-gaps)
   - [HR Admin](#23-hr-admin-data-flow--3-gaps)
   - [Super Admin](#24-super-admin-data-flow--2-gaps)
3. [Cross-References: Data gaps that cause user-flow gaps](#3-cross-references-data-flow-gaps-that-cause-user-flow-gaps)
4. [Fix Plan](#4-prioritized-fix-plan)
   - [Phase 1 — Establish the backend layer](#phase-1--establish-the-backend-layer)
   - [Phase 2 — Add missing infrastructure nodes](#phase-2--add-missing-infrastructure-nodes)
   - [Phase 3 — Fix high-severity user-flow gaps](#phase-3--fix-high-severity-user-flow-gaps)
   - [Phase 4 — Close medium-severity gaps](#phase-4--close-medium-severity-gaps)
   - [Phase 5 — Close low-severity and polish gaps](#phase-5--close-low-severity-and-polish-gaps)

---

## 1. User-Flow Gaps

### 1.1 Candidate user-flow — 7 gaps

| # | Severity | Gap | Detail |
|---|---|---|---|
| C1 | 🔴 HIGH | No mic permission denied path | If the candidate declines mic access in the lobby, the flow dead-ends. Needs a "fix permissions" nudge or a graceful fallback (text-only mode or retry screen). |
| C2 | 🔴 HIGH | No identity verification failure branch | Auth → Interview assumes success. A failed verify needs a retry path or an HR escalation route — neither is shown. |
| C3 | 🔴 HIGH | No expired / invalid link handling | Unique interview links expire. No branch exists for when a candidate clicks a stale link — likely the most frequent edge case in production. |
| C4 | 🟡 MED | No post-processing notification to candidate | Flow ends at "Wait for HR Decision" with no email or status update shown. Candidate has no way to know when AI scoring has completed. |
| C5 | 🟡 MED | No rescheduling / reschedule request flow | Candidates may miss interview windows. No path exists to request a new link or time slot from HR. |
| C6 | 🟢 LOW | No candidate dashboard / application tracker | No flow for candidates to view their status across multiple job applications or see past interview outcomes. |
| C7 | 🟢 LOW | No application withdrawal flow | Candidates can apply but cannot retract. Required for GDPR compliance and general UX hygiene. |

---

### 1.2 HR Admin user-flow — 8 gaps

| # | Severity | Gap | Detail |
|---|---|---|---|
| H1 | 🔴 HIGH | No manual interview invite trigger shown | Candidate flow references "Auto-Trigger" but HR admin flow never shows how or when they manually send interview invitations. |
| H2 | 🔴 HIGH | No interview template / question configuration | The AI interview asks questions, but there is no flow for creating or editing interview scripts per job role — the core product feature has no setup path. |
| H3 | 🔴 HIGH | Payment failure / subscription lapse not handled | Provisioning includes payment setup but there is no branch for payment failure — suspension, grace period, and retry paths are all absent. |
| H4 | 🟡 MED | Resume bank search is a dead-end node | "Search Resume Bank" has no next step — no path to invite a found candidate, add them to a pipeline, or tag them for a role. |
| H5 | 🟡 MED | No notification flow when candidates complete interviews | HR admins have no shown trigger for "new scorecard ready" alerts — they would need to poll the dashboard manually. |
| H6 | 🟡 MED | No team / multi-admin management | No flow for inviting colleagues as co-admins, assigning recruiter roles, or handing off a job to another team member. |
| H7 | 🟢 LOW | No job close / archive flow | Jobs can be created and edited but there is no path to close a filled role or archive expired postings. |
| H8 | 🟢 LOW | No bulk candidate action flow | Review is one-by-one. No path for mass rejection, batch shortlisting, or exporting a candidate list. |

---

### 1.3 Super Admin user-flow — 4 gaps

| # | Severity | Gap | Detail |
|---|---|---|---|
| S1 | 🔴 HIGH | Nuclear reset has no confirmation step | Org → Reset → End is a single arrow. A destructive wipe needs at minimum a confirmation modal and a typed org-name challenge before executing. |
| S2 | 🟡 MED | No new organization creation flow | "Manage Organizations" only shows Suspend/Reset. No path to provision a new tenant from the super admin side vs. self-serve HR signup. |
| S3 | 🟡 MED | No audit log / activity history flow | Super admins performing sensitive actions (wipes, suspensions, LLM config changes) should have a traceable history. Not represented. |
| S4 | 🟢 LOW | White-label configure is a dead-end node | "Configure Reseller White-Label" has no sub-flow. Domain, logo, color scheme, and custom email templates are all implied but undefined. |

---

### 1.4 Cross-cutting (Systemic) — 3 gaps

| # | Severity | Gap | Detail |
|---|---|---|---|
| X1 | 🔴 HIGH | No password reset / forgot password flow | All three flows show "Sign In" but none branch to password recovery. A baseline auth requirement for every persona. |
| X2 | 🟡 MED | No logout in any flow | HR admin and super admin are authenticated sessions but have no exit path defined. Session expiry and timeout handling are also absent. |
| X3 | 🟡 MED | No error / failure states anywhere | All flows assume the happy path. Network errors, AI processing failures, email delivery failures, and form validation errors are unaccounted for across all personas. |

---

## 2. Data-Flow Gaps

### 2.1 Architecture — Systemic — 5 gaps

> ⚠️ **Root cause:** All three data flows show direct client → Firestore writes with no backend intermediary. No Cloud Functions layer exists anywhere in the diagrams. This means business logic runs on the untrusted client, authorization is entirely dependent on Firestore Security Rules being flawless, and API keys are potentially exposed. This is a fundamental architecture gap, not a diagram detail.

| # | Severity | Gap | Detail |
|---|---|---|---|
| A1 | 🔴 HIGH | No Cloud Functions / backend layer shown in any flow | Every flow shows direct client ↔ Firestore writes. A production SaaS requires a server-side layer to validate input, enforce business rules, and keep credentials off the client. Add Cloud Functions as an intermediary for all write operations. |
| A2 | 🔴 HIGH | Firebase Authentication absent from all three flows | None of the data flows include an Auth node. Authentication is the entry gate for all three personas — it determines Firestore Security Rule context, custom claims (HR vs super admin), and token-bound data access. It must be made explicit. |
| A3 | 🔴 HIGH | No Firebase Storage node for recordings and transcripts | The candidate flow references submitting recordings, and HR admins review recordings in the user flow — but no storage layer is shown in any data flow. Audio files must go to Firebase Storage, not Firestore documents. |
| A4 | 🔴 HIGH | No email delivery service shown | The user flows reference invitation emails, offer emails, and rejection emails — none of which appear as a data flow node. A transactional email service (SendGrid, Firebase Email Extension, Resend) is a required infrastructure component missing from all diagrams. |
| A5 | 🟡 MED | Platform telemetry stored in Firestore — wrong data store | The super admin flow shows "System Telemetry / Logs" as a Firestore collection. Firestore is not suited for time-series metrics or log ingestion at scale. Cloud Logging, Firebase Performance Monitoring, or BigQuery is the correct pattern. |

---

### 2.2 Candidate data-flow — 3 gaps

| # | Severity | Gap | Detail |
|---|---|---|---|
| D1 | 🔴 HIGH | Gemini called directly from candidate client — API key exposure | Step 3 shows the browser streaming directly to the Gemini API. This exposes the API key on the client and allows prompt injection or abuse. Audio/text must be proxied through a Cloud Function that owns the Gemini credentials. |
| D2 | 🔴 HIGH | Candidate submits their own scorecard — integrity risk | Step 5 shows the candidate client writing the final scorecard directly to Firestore. Self-reported scores can be tampered with. Scorecard generation must happen server-side after transcript processing, never from the candidate's browser. |
| D3 | 🟡 MED | System prompts fetched by candidate client from Firestore | Step 1 shows the candidate client reading job metadata including system prompts directly from Firestore. System prompts are proprietary AI configuration — exposing them client-side allows competitors and candidates to inspect and manipulate interview logic. |

---

### 2.3 HR Admin data-flow — 3 gaps

| # | Severity | Gap | Detail |
|---|---|---|---|
| D4 | 🔴 HIGH | Stripe webhook returns to HR client — architecturally incorrect | Step 2 shows the Stripe payment success webhook/token returning to the HR Admin Client. Stripe webhooks POST to a server endpoint, not a browser. The flow must include a Cloud Function webhook handler that validates the Stripe signature before provisioning the org. |
| D5 | 🟡 MED | Multitenant isolation enforced client-side only | Step 5 enforces isolation with a client-side query filter `(where orgId == currentOrg)`. If Firestore Security Rules are misconfigured, any authenticated HR admin could query another org's candidates by removing the filter. Isolation must be enforced by Security Rules and custom JWT claims, not the query alone. |
| D6 | 🟡 MED | Org provisioning is a direct client → Firestore write | Step 3 shows provisioning org configuration written directly from the client after receiving a Stripe token. A malicious client could provision an org without a valid payment. Provisioning must be handled by a Cloud Function that confirms payment status with Stripe before writing to Firestore. |

---

### 2.4 Super Admin data-flow — 2 gaps

| # | Severity | Gap | Detail |
|---|---|---|---|
| D7 | 🔴 HIGH | Org wipe / suspend is a direct client → Firestore mutation | Step 3 shows "Mutate Global Org Status (Suspend/Wipe)" as a direct client write. Destructive cross-tenant operations must be gated behind a Cloud Function with elevated admin SDK privileges and explicit audit logging — never a raw client write. |
| D8 | 🟢 LOW | Gemini "sandbox" is undefined architecturally | The diagram labels this a "Gemini Sandbox API" but uses the same endpoint as production. The isolation mechanism (separate project, separate API key, prompt flag) is not defined. Without explicit separation, super admin test prompts could bleed into production inference costs or logs. |

---

## 3. Cross-References: Data-flow gaps that cause user-flow gaps

Several user-flow gaps are not standalone UX oversights — they are symptoms of missing infrastructure in the data flow. Fixing these requires resolving the data-flow root cause first.

| Data-flow root cause | User-flow gaps caused |
|---|---|
| **Missing email service node** (A4) | HR admin has no invite trigger flow (H1) · Candidate gets no post-processing notification (C4) · Offer / rejection emails have no path |
| **No Firebase Auth in data flows** (A2) | No password reset flow (X1) · No logout / session expiry path (X2) · Identity verify failure has no branch (C2) |
| **No Firebase Storage node** (A3) | HR admin review of recordings is undefined (H5) · Transcript retrieval has no path |
| **No Cloud Functions layer** (A1) | AI Processing & Scoring step is undefined · Stripe webhook handling is missing (D4) · Nuclear reset has no confirmation gate (S1) |

---

## 4. Prioritized Fix Plan

> **Sequencing note:** Phase 1 must land before any other phase. Phases 2–5 depend on the backend layer established in Phase 1. Do not start Phase 3 without Phase 1 and 2 in place.

---

### Phase 1 — Establish the backend layer

> Do this before any other fix. Everything else depends on it.

#### 1.1 — Introduce a Cloud Functions layer between all clients and Firestore

**Fixes:** A1, D2, D4, D6, D7

No client should write directly to Firestore for any business-critical operation. Define HTTP-callable or Firestore-triggered Cloud Functions for:

- Scorecard submission (removes candidate self-reporting risk)
- Org provisioning (enforces server-side payment verification)
- Status mutations for HR and Super Admin
- Stripe webhook handler (validates signature before any Firestore write)

The client writes to Firestore only where Firestore Security Rules are the sole protection — not business logic.

**Stack:** `Firebase Cloud Functions (Gen 2)`, `Node.js / TypeScript`

---

#### 1.2 — Add Firebase Authentication to all three data flow diagrams and enforce custom claims

**Fixes:** A2, X1, X2, C2, D5

Every flow must show an Auth node as the entry gate. Add custom claims to Firebase Auth tokens:

```json
{
  "orgId": "org_abc123",
  "role": "hr_admin"   // candidate | hr_admin | super_admin
}
```

Firestore Security Rules must derive all access decisions from these claims — not from client-supplied query parameters. The `orgId` claim replaces the `where orgId == currentOrg` client-side filter as the isolation mechanism.

**Stack:** `Firebase Authentication`, `Firestore Security Rules`, `Custom Claims`

---

#### 1.3 — Fix the Stripe webhook — route through a Cloud Function, not the client

**Fixes:** D4, D6, H3

Create a dedicated HTTPS Cloud Function endpoint registered as the Stripe webhook URL. The function must:

1. Validate the `Stripe-Signature` header against the webhook secret
2. Confirm `payment_intent.succeeded` event
3. Write the provisioned org record to Firestore only after confirmation
4. Return `200` to Stripe within 30 seconds

The client initiates payment, then polls for org state via a Firestore listener — it does not receive or process the webhook directly.

**Stack:** `Cloud Functions (HTTPS)`, `Stripe Node.js SDK`, `stripe.webhooks.constructEvent()`

---

#### 1.4 — Move Gemini calls server-side; proxy audio through a Cloud Function

**Fixes:** D1, D3

The candidate client must never call Gemini directly. The corrected data flow:

```
Candidate Client → [audio stream] → Cloud Function
Cloud Function   → [injects system prompt] → Gemini API
Gemini API       → [dialogue + eval] → Cloud Function
Cloud Function   → [response stream] → Candidate Client
```

This also prevents candidates from reading system prompts fetched from Firestore (D3) — the Cloud Function owns both the Gemini API key and the prompt retrieval.

**Stack:** `Cloud Functions`, `Gemini Streaming API`, `WebSockets or Server-Sent Events`

---

### Phase 2 — Add missing infrastructure nodes

> Core services that multiple flows depend on but none of the diagrams show.

#### 2.1 — Add Firebase Storage for audio recordings and transcripts

**Fixes:** A3, H5

Recordings and transcripts must be stored in Firebase Storage, not Firestore documents. Corrected data flow after interview completion:

```
Cloud Function → audio file      → Firebase Storage (recordings/{orgId}/{candidateId})
Cloud Function → transcript text → Firebase Storage (transcripts/{orgId}/{candidateId})
Cloud Function → storage URLs    → Firestore (candidates/{id}.recordingUrl, .transcriptUrl)
HR Admin Client ← Storage URLs  ← Firestore (real-time listener)
```

Update the candidate and HR admin data flow diagrams to include the Storage node.

**Stack:** `Firebase Storage`, `Storage Security Rules (orgId path scoping)`

---

#### 2.2 — Add a transactional email service node to all three flows

**Fixes:** A4, H1, C4

A transactional email service is required for: candidate interview invitations, offer emails, rejection emails, and payment receipts. All are triggered by Cloud Functions — never by the client directly.

Recommended trigger points:

| Trigger | Event | Email |
|---|---|---|
| HR admin clicks "Invite" | Cloud Function sends invite | Interview invitation to candidate |
| Scorecard Cloud Function completes | Auto-trigger | "Interview reviewed" to candidate |
| HR admin clicks "Extend Offer" | Cloud Function sends offer | Offer email to candidate |
| HR admin clicks "Reject" | Cloud Function sends rejection | Rejection email to candidate |
| Stripe webhook confirms payment | Cloud Function confirms org | Payment receipt to HR admin |

**Stack:** `SendGrid` / `Resend` / `Firebase Email Extension`, `Cloud Functions`

---

#### 2.3 — Replace Firestore telemetry with Cloud Logging or BigQuery

**Fixes:** A5

Platform metrics (latency, inference costs, request volume) should not be stored in Firestore. Corrected architecture:

```
Cloud Functions      → structured logs  → Cloud Logging
Cloud Logging        → log sink export  → BigQuery
Super Admin Client   → query            → BigQuery (via Cloud Function)
```

Firestore remains appropriate for per-org config data. Cloud Logging handles structured log ingestion; BigQuery handles the analytics dashboard queries for the super admin.

**Stack:** `Cloud Logging`, `BigQuery`, `Log Sinks`

---

### Phase 3 — Fix high-severity user-flow gaps

> UX blockers that affect users on day one.

#### 3.1 — Add password reset flow to all three personas

**Fixes:** X1

Branch from the "Sign In" node in each flow:

```
Sign In → [Forgot Password?] → Enter Email
Enter Email → Firebase Auth sends reset email
Reset Email → Candidate / HR / Super Admin sets new password → Sign In
```

Firebase Auth has this built-in via `sendPasswordResetEmail()`. It only needs to be documented in the flows and a reset UI screen added to the frontend.

**Stack:** `Firebase Auth — sendPasswordResetEmail()`

---

#### 3.2 — Add mic denial, identity failure, and expired link branches to the candidate flow

**Fixes:** C1, C2, C3

Three separate failure branches to add:

**a) Mic denied (C1)**
```
Lobby → [Mic denied] → Permissions Guide Screen
Permissions Guide Screen → [Fixed] → Retry → Lobby
Permissions Guide Screen → [Can't fix] → Contact Support
```

**b) Identity verification failure (C2)**
```
Auth → [Verify failed] → Retry (max 3 attempts)
Auth → [Max retries reached] → Escalate to HR (auto-email via email service)
```

**c) Expired link (C3)**
```
Click Link → [Token expired] → "This link has expired" screen
"Expired" screen → [Request new invitation] → Notify HR Admin (Firestore write + FCM)
HR Admin receives notification → Re-sends invite link
```

---

#### 3.3 — Add nuclear reset confirmation gate to super admin flow

**Fixes:** S1

Insert a two-step confirmation between Reset and End:

```
Org → [Reset] → Confirmation Modal (summary of what will be deleted)
Confirmation Modal → [Type org name to confirm] → Typed Challenge Input
Typed Challenge Input → [Matches] → Cloud Function executes wipe
Cloud Function → [Writes audit log] → Cloud Logging
Cloud Function → [Confirms] → Super Admin Dashboard
```

The Cloud Function that executes the wipe (from Phase 1.1) must also require the org name in the request body — server-side enforcement prevents accidental or scripted API calls bypassing the UI.

---

#### 3.4 — Define the interview template configuration flow for HR admins

**Fixes:** H2, H1

Add a sub-flow under "Create / Edit Job Posting":

```
Create / Edit Job Posting
  └─→ Configure Interview
        ├─→ Add / Edit Questions (ordered list)
        ├─→ Set scoring criteria (per question)
        ├─→ Set time limits and turn count
        └─→ Save → Firestore (jobs/{id}.interviewTemplate)

Candidate starts interview
  └─→ Cloud Function reads jobs/{id}.interviewTemplate
  └─→ Injects as system prompt into Gemini (Phase 1.4)
```

The data link between the template and the Gemini proxy function must be explicit in both diagrams.

---

### Phase 4 — Close medium-severity gaps

> Functional gaps that affect daily HR admin usage and data integrity.

#### 4.1 — Add logout and session timeout to HR admin and super admin flows

**Fixes:** X2

Add to both authenticated flows:

- **Logout action:** `Firebase Auth signOut()` → clear local state → redirect to Sign In
- **Session timeout:** Firestore listener detects token expiry → redirect to Sign In with "Session expired" message
- **Token refresh failure:** catch `auth/id-token-expired` → force re-authentication

Document in both user flows and the corresponding data flow diagrams.

**Stack:** `Firebase Auth — signOut()`, `onAuthStateChanged()`

---

#### 4.2 — Resolve the resume bank dead-end: add post-search action branch

**Fixes:** H4, H1

After "Search Resume Bank", add:

```
Search Resume Bank → View Candidate Profile
View Candidate Profile
  ├─→ Invite to Interview → Cloud Function sends invite email (Phase 2.2)
  └─→ Add to Job Pipeline → Firestore write (candidates/{id}.pipeline)
```

This directly resolves both the dead-end node (H4) and the missing manual invite trigger (H1).

---

#### 4.3 — Add candidate post-interview notification to data flow and user flow

**Fixes:** C4, H5

After AI Processing & Scoring completes server-side, the Cloud Function should:

1. Write scorecard to `Firestore (candidates/{id}.scorecard)`
2. Trigger FCM push notification to HR admin: "New scorecard ready for [Candidate Name]"
3. Send "your interview has been reviewed" email to the candidate via the email service (Phase 2.2)

Add these three steps as explicit nodes in both the candidate and HR admin data flow diagrams.

**Stack:** `Cloud Functions`, `Email service (Phase 2.2)`, `Firebase Cloud Messaging (FCM)`

---

#### 4.4 — Add error state branches to all three user flows as a shared addendum

**Fixes:** X3

Create a shared **"Error & Failure States"** appendix document that each flow references rather than duplicating inline. Cover:

| Error Type | Handling |
|---|---|
| Network failure | Retry with exponential back-off (max 3 attempts), then show error UI |
| Gemini inference failure | Graceful degradation — save partial transcript, notify HR admin, allow rescheduling |
| Email delivery failure | Retry queue (Cloud Tasks), surface failure in HR admin dashboard after 3 failed attempts |
| Stripe payment failure | Grace period (7 days), email HR admin, suspend org after grace period expires |
| Firestore write failure | Surface error to user, do not silently drop data |

---

### Phase 5 — Close low-severity and polish gaps

#### 5.1 — Add application withdrawal and data deletion (GDPR) flow

**Fixes:** C7

Add to the candidate flow:

```
Candidate Dashboard → [Withdraw Application]
  └─→ Cloud Function:
        ├─→ Delete Firestore record (candidates/{id})
        ├─→ Delete Firebase Storage files (recordings + transcripts)
        ├─→ Remove from job pipeline references
        └─→ Send confirmation email to candidate
```

Implement as a single Cloud Function to ensure atomic deletion across both Firestore and Storage. Required for GDPR Article 17 compliance.

---

#### 5.2 — Define the Gemini sandbox isolation mechanism for super admin

**Fixes:** D8

The LLM Playground should use a separate GCP project or a distinct API key scoped to a test budget. Document in the super admin data flow:

```
Super Admin Client → Cloud Function (sandbox)
Cloud Function (sandbox) → Gemini API [test project / scoped key]
Gemini API → token cost data → Cloud Function
Cloud Function → inference results → Super Admin Client
```

Inference costs and logs from the sandbox must not appear in production billing or analytics dashboards.

---

#### 5.3 — Expand white-label and audit log sub-flows for super admin

**Fixes:** S4, S3

**White-label sub-flow:**
```
Configure Reseller White-Label
  ├─→ Custom domain config → Firestore (orgs/{id}.domain)
  ├─→ Logo upload → Firebase Storage → Firestore URL reference
  ├─→ Color scheme → Firestore (orgs/{id}.theme)
  └─→ Custom email templates → Firestore (orgs/{id}.emailTemplates)
```

**Audit log viewer:**
```
Super Admin Dashboard → Audit Log Viewer
  └─→ Cloud Function queries Cloud Logging
        └─→ Filters: actor, action type (wipe / suspend / config change), date range
        └─→ Returns structured log entries to Super Admin Client
```

---

## Summary Table

| Phase | Focus | Gaps closed | Priority |
|---|---|---|---|
| Phase 1 | Backend / Cloud Functions layer | A1, D1, D2, D3, D4, D6, D7 | Do first |
| Phase 2 | Missing infrastructure (Storage, Email, Logging) | A2, A3, A4, A5 | Do second |
| Phase 3 | High-severity user-flow blockers | C1, C2, C3, H2, S1, X1 | Do third |
| Phase 4 | Medium-severity UX and data integrity | C4, H1, H4, H5, X2, X3 | Do fourth |
| Phase 5 | Low-severity, polish, compliance | C7, D8, S3, S4 | Do last |

---

*HireAI · Flow Gap Report · Combined analysis · 35 gaps · 5 fix phases*
