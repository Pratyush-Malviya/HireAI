// Audit & Observability Service
// Logs all user actions, API calls, and agent operations for security and compliance

export interface AuditEvent {
  id: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  organizationId: string;
  action: string;
  category: 'auth' | 'candidate' | 'job' | 'research' | 'outreach' | 'screening' | 'interview' | 'report' | 'offer' | 'ats_sync' | 'admin' | 'system';
  resourceType: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  outcome: 'success' | 'failure' | 'pending';
}

// Log an audit event to the backend
export async function logAuditEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
  try {
    await fetch('/api/system/audit-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      // Fire and forget — don't block the caller
      signal: AbortSignal.timeout(3000)
    });
  } catch (err) {
    // Audit logging should never throw — silently log to console
    console.error('[AuditService] Failed to log event:', err);
  }
}

// Create an audit event helper
export function createAuditEvent(params: {
  userId: string;
  userEmail: string;
  organizationId: string;
  action: string;
  category: AuditEvent['category'];
  resourceType: string;
  resourceId?: string;
  details?: Record<string, any>;
  severity?: AuditEvent['severity'];
  outcome?: AuditEvent['outcome'];
}): Omit<AuditEvent, 'id' | 'timestamp'> {
  return {
    userId: params.userId,
    userEmail: params.userEmail,
    organizationId: params.organizationId,
    action: params.action,
    category: params.category,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    details: params.details || {},
    severity: params.severity || 'info',
    outcome: params.outcome || 'success',
  };
}

// Convenience wrappers for common audit events
export const AuditActions = {
  // Auth events
  userLogin: (userId: string, email: string, orgId: string) =>
    createAuditEvent({ userId, userEmail: email, organizationId: orgId, action: 'user.login', category: 'auth', resourceType: 'session', severity: 'info' }),

  userLogout: (userId: string, email: string, orgId: string) =>
    createAuditEvent({ userId, userEmail: email, organizationId: orgId, action: 'user.logout', category: 'auth', resourceType: 'session', severity: 'info' }),

  // Candidate events
  candidateScreened: (userId: string, email: string, orgId: string, candidateId: string, score: number) =>
    createAuditEvent({ userId, userEmail: email, organizationId: orgId, action: 'candidate.screened', category: 'screening', resourceType: 'candidate', resourceId: candidateId, details: { score }, severity: 'info' }),

  candidateSourced: (userId: string, email: string, orgId: string, count: number) =>
    createAuditEvent({ userId, userEmail: email, organizationId: orgId, action: 'candidate.sourced', category: 'candidate', resourceType: 'sourcing', details: { count }, severity: 'info' }),

  candidateResearched: (userId: string, email: string, orgId: string, candidateId: string) =>
    createAuditEvent({ userId, userEmail: email, organizationId: orgId, action: 'candidate.researched', category: 'research', resourceType: 'candidate', resourceId: candidateId, severity: 'info' }),

  // Outreach events
  outreachSent: (userId: string, email: string, orgId: string, candidateId: string, channel: string) =>
    createAuditEvent({ userId, userEmail: email, organizationId: orgId, action: 'outreach.sent', category: 'outreach', resourceType: 'candidate', resourceId: candidateId, details: { channel }, severity: 'info' }),

  // Offer events
  offerGenerated: (userId: string, email: string, orgId: string, candidateId: string, jobTitle: string) =>
    createAuditEvent({ userId, userEmail: email, organizationId: orgId, action: 'offer.generated', category: 'offer', resourceType: 'candidate', resourceId: candidateId, details: { jobTitle }, severity: 'info' }),

  // ATS sync events
  atsSynced: (userId: string, email: string, orgId: string, system: string, count: number) =>
    createAuditEvent({ userId, userEmail: email, organizationId: orgId, action: 'ats.synced', category: 'ats_sync', resourceType: 'integration', details: { system, count }, severity: 'info' }),

  // Error events
  systemError: (userId: string, email: string, orgId: string, action: string, error: string) =>
    createAuditEvent({ userId, userEmail: email, organizationId: orgId, action, category: 'system', resourceType: 'error', details: { error }, severity: 'error', outcome: 'failure' }),
};
