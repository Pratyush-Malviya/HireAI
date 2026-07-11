// Agent 9 — ATS Integration Agent
// MCP (Model Context Protocol) layer connecting all agents to external ATS systems
// Firestore acts as the sync hub — data flows both ways

export type ATSSystem = 'zoho_recruit' | 'greenhouse' | 'lever' | 'workday' | 'bamboo' | 'custom';

export interface ATSConnection {
  id: string;
  organizationId: string;
  system: ATSSystem;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  connectedAt: string;
  lastSyncAt?: string;
  config: {
    apiKey?: string;
    apiUrl?: string;
    webhookUrl?: string;
    webhookSecret?: string;
    syncInterval: number;
    syncDirection: 'bidirectional' | 'import_only' | 'export_only';
    mappings: FieldMapping[];
  };
  errorMessage?: string;
}

export interface FieldMapping {
  source: string;
  sourceField: string;
  target: string;
  targetField: string;
  transform?: string;
  required: boolean;
}

export interface SyncOperation {
  id: string;
  connectionId: string;
  type: 'import' | 'export' | 'sync';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  recordsProcessed: number;
  recordsSucceeded: number;
  recordsFailed: number;
  errorLog: string[];
  entityType: 'candidate' | 'job' | 'offer' | 'interview';
}

export interface ATSJob {
  externalId: string;
  title: string;
  department: string;
  location: string;
  status: 'open' | 'closed' | 'draft';
  url?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ATSCandidate {
  externalId: string;
  fullName: string;
  email: string;
  phone?: string;
  currentRole?: string;
  currentCompany?: string;
  stage?: string;
  status?: string;
  profileUrl?: string;
  appliedAt: string;
}

// Default field mappings for popular ATS systems
const DEFAULT_MAPPINGS: Record<ATSSystem, FieldMapping[]> = {
  zoho_recruit: [
    { source: 'hireai', sourceField: 'fullName', target: 'zoho', targetField: 'Candidate_Name', required: true },
    { source: 'hireai', sourceField: 'email', target: 'zoho', targetField: 'Email', required: true },
    { source: 'hireai', sourceField: 'phone', target: 'zoho', targetField: 'Phone', required: false },
    { source: 'hireai', sourceField: 'currentRole', target: 'zoho', targetField: 'Current_Job_Title', required: false },
    { source: 'hireai', sourceField: 'currentCompany', target: 'zoho', targetField: 'Current_Employer', required: false },
    { source: 'hireai', sourceField: 'skills', target: 'zoho', targetField: 'Skill_Set', required: false },
    { source: 'hireai', sourceField: 'totalExperience', target: 'zoho', targetField: 'Experience_in_Years', required: false },
  ],
  greenhouse: [
    { source: 'hireai', sourceField: 'fullName', target: 'greenhouse', targetField: 'first_name+last_name', required: true },
    { source: 'hireai', sourceField: 'email', target: 'greenhouse', targetField: 'email', required: true },
    { source: 'hireai', sourceField: 'phone', target: 'greenhouse', targetField: 'phone', required: false },
    { source: 'hireai', sourceField: 'currentRole', target: 'greenhouse', targetField: 'current_company', required: false },
  ],
  lever: [
    { source: 'hireai', sourceField: 'fullName', target: 'lever', targetField: 'name', required: true },
    { source: 'hireai', sourceField: 'email', target: 'lever', targetField: 'email', required: true },
    { source: 'hireai', sourceField: 'phone', target: 'lever', targetField: 'phone', required: false },
    { source: 'hireai', sourceField: 'resumeText', target: 'lever', targetField: 'resume', required: false },
  ],
  workday: [
    { source: 'hireai', sourceField: 'fullName', target: 'workday', targetField: 'Candidate_Name', required: true },
    { source: 'hireai', sourceField: 'email', target: 'workday', targetField: 'Email_Address', required: true },
  ],
  bamboohr: [
    { source: 'hireai', sourceField: 'fullName', target: 'bamboohr', targetField: 'displayName', required: true },
    { source: 'hireai', sourceField: 'email', target: 'bamboohr', targetField: 'workEmail', required: true },
  ],
  custom: [],
};

// Get recommended mappings for an ATS system
export function getMappingsForSystem(system: ATSSystem): FieldMapping[] {
  return DEFAULT_MAPPINGS[system] || [];
}

// Create an ATS connection config
export function createATSConnection(
  organizationId: string,
  system: ATSSystem,
  name: string,
  config: Partial<ATSConnection['config']>
): ATSConnection {
  return {
    id: `ats_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    organizationId,
    system,
    name,
    status: 'disconnected',
    connectedAt: new Date().toISOString(),
    config: {
      syncInterval: config.syncInterval || 60,
      syncDirection: config.syncDirection || 'bidirectional',
      mappings: config.mappings || getMappingsForSystem(system),
      apiKey: config.apiKey,
      apiUrl: config.apiUrl,
      webhookUrl: config.webhookUrl,
      webhookSecret: config.webhookSecret,
    },
  };
}

// Test ATS connection
export async function testATSConnection(connection: ATSConnection): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('/api/ats/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connection })
    });
    if (response.ok) {
      return response.json();
    }
    return { success: false, message: 'Connection test failed' };
  } catch (err) {
    return { success: false, message: `Connection error: ${err}` };
  }
}

// Sync candidates to external ATS
export async function syncToATS(
  connection: ATSConnection,
  candidates: { id: string; fullName: string; email: string; [key: string]: any }[]
): Promise<SyncOperation> {
  const operation: SyncOperation = {
    id: `sync_${Date.now()}`,
    connectionId: connection.id,
    type: 'export',
    status: 'in_progress',
    startedAt: new Date().toISOString(),
    recordsProcessed: candidates.length,
    recordsSucceeded: 0,
    recordsFailed: 0,
    errorLog: [],
    entityType: 'candidate',
  };

  try {
    const response = await fetch('/api/ats/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connection, candidates, direction: 'export' })
    });
    if (response.ok) {
      const result = await response.json();
      operation.status = 'completed';
      operation.recordsSucceeded = result.succeeded || 0;
      operation.recordsFailed = result.failed || 0;
      operation.completedAt = new Date().toISOString();
    } else {
      throw new Error('Sync request failed');
    }
  } catch (err: any) {
    operation.status = 'failed';
    operation.errorLog = [err.message || 'Unknown error'];
    operation.completedAt = new Date().toISOString();
  }

  return operation;
}

// Import candidates from external ATS
export async function importFromATS(
  connection: ATSConnection,
  jobExternalId?: string
): Promise<{ candidates: ATSCandidate[]; operation: SyncOperation }> {
  const operation: SyncOperation = {
    id: `import_${Date.now()}`,
    connectionId: connection.id,
    type: 'import',
    status: 'in_progress',
    startedAt: new Date().toISOString(),
    recordsProcessed: 0,
    recordsSucceeded: 0,
    recordsFailed: 0,
    errorLog: [],
    entityType: 'candidate',
  };

  try {
    const response = await fetch('/api/ats/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connection, jobExternalId })
    });
    if (response.ok) {
      const result = await response.json();
      operation.status = 'completed';
      operation.recordsProcessed = result.candidates?.length || 0;
      operation.recordsSucceeded = result.candidates?.length || 0;
      operation.completedAt = new Date().toISOString();
      return { candidates: result.candidates || [], operation };
    }
    throw new Error('Import request failed');
  } catch (err: any) {
    operation.status = 'failed';
    operation.errorLog = [err.message || 'Unknown error'];
    operation.completedAt = new Date().toISOString();
    return { candidates: [], operation };
  }
}

// Map a HireAI candidate field to ATS format
export function mapField(
  value: any,
  mapping: FieldMapping
): any {
  if (!mapping.transform) {
    if (mapping.targetField.includes('+')) {
      const parts = mapping.targetField.split('+');
      // Handle compound fields like "first_name+last_name"
      if (typeof value === 'string') {
        const nameParts = value.split(' ');
        return parts.length === 2 ? { [parts[0]]: nameParts[0] || '', [parts[1]]: nameParts.slice(1).join(' ') || '' } : value;
      }
    }
    return value;
  }
  // Apply transform if specified
  if (mapping.transform === 'lowercase') return String(value).toLowerCase();
  if (mapping.transform === 'uppercase') return String(value).toUpperCase();
  if (mapping.transform === 'number' && value !== undefined) return Number(value);
  return value;
}
