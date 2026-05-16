# AI Resume Screening Platform Security Specification

## Data Invariants
1. **Jobs**: Must be owned by the creator. Status must be 'active' or 'closed'.
2. **Candidates**: Must belong to a valid Job. Access is derived from the Job's ownership.
3. **Identity**: All operations require a verified email (`email_verified == true`).

## Dirty Dozen Payloads (Rejection Targets)

1. **Identity Injection**: Attempt to create a job for another user.
2. **Shadow Field Injection**: Adding `isAdmin: true` to a job document.
3. **Relational Orphan**: Creating a candidate for a non-existent job ID.
4. **ID Poisoning**: Using a 2KB string as a `jobId`.
5. **State Shortcut**: Updating a candidate to `shortlisted` without being the job owner.
6. **Immutable Violation**: Changing `createdBy` on an existing job.
7. **PII Scraping**: Attempting to list all candidates without a `jobId` filter.
8. **Unverified Bypass**: Performing writes with a non-verified email account.
9. **Schema Bloat**: Adding 100 extra fields to a job document.
10. **Timestamp Spoofing**: Sending a client-side `createdAt` date instead of `serverTimestamp`.
11. **Cross-Job Leak**: Attempting to read candidates for a job owned by someone else.
12. **Status Corruption**: Setting job status to `deleted` (not an allowed enum).

## Secure Rule Evaluation Table

| Collection | Spoofing Guard | State Guard | Poisoning Guard | PII Access |
| :--- | :--- | :--- | :--- | :--- |
| /jobs | `incoming().createdBy == request.auth.uid` | `status in ['active', 'closed']` | `isValidId(jobId)` | Restricted to owner |
| /candidates | Verified against Job owner | `status in ['processed', 'shortlisted', 'rejected']` | `isValidId(candidateId)` | Derived from Job ownership |
