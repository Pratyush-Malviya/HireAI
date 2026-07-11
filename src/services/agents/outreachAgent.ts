// Agent 3 - Candidate Outreach Agent
// Generates personalized email + LinkedIn messages per candidate
// Manages follow-up sequences, logs outreach status in Firestore

export interface OutreachMessage {
  id?: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  company: string;
  channel: 'email' | 'linkedin' | 'sms';
  subject?: string;
  body: string;
  status: 'draft' | 'sent' | 'opened' | 'replied' | 'converted' | 'bounced';
  sentAt?: string;
  followUpDate?: string;
  followUpCount: number;
  sequence: 'initial' | 'follow_up_1' | 'follow_up_2' | 'follow_up_3' | 'closing';
  templateUsed?: string;
  notes?: string;
  createdAt: string;
}

export interface OutreachTemplate {
  id: string;
  name: string;
  channel: 'email' | 'linkedin' | 'sms';
  subjectTemplate: string;
  bodyTemplate: string;
  sequence: OutreachMessage['sequence'];
  delayDays: number;
}

// Built-in outreach templates
const OUTREACH_TEMPLATES: OutreachTemplate[] = [
  {
    id: 'email_initial',
    name: 'Initial Outreach - Email',
    channel: 'email',
    subjectTemplate: 'Exciting Opportunity: {{jobTitle}} at {{company}}',
    bodyTemplate: `Hi {{candidateName}},

I came across your profile and was impressed by your background in {{skills}}.

We're looking for a {{jobTitle}} to join {{company}}, and I believe your experience would be a great fit.

Would you be open to a quick chat to discuss this role further?

Looking forward to hearing from you!

Best regards,
{{recruiterName}}
{{recruiterTitle}}
{{company}}`,
    sequence: 'initial',
    delayDays: 0
  },
  {
    id: 'email_followup1',
    name: 'Follow-Up 1 - Email',
    channel: 'email',
    subjectTemplate: 'Re: {{jobTitle}} opportunity at {{company}}',
    bodyTemplate: `Hi {{candidateName}},

I wanted to follow up on my previous message about the {{jobTitle}} role at {{company}}.

We're actively hiring and I'd love to tell you more about the position and what we're building.

Would you have 15 minutes this week for a quick call?

Best,
{{recruiterName}}`,
    sequence: 'follow_up_1',
    delayDays: 3
  },
  {
    id: 'linkedin_initial',
    name: 'Initial Outreach - LinkedIn',
    channel: 'linkedin',
    subjectTemplate: '',
    bodyTemplate: `Hi {{candidateName}}, I came across your profile and was impressed by your work in {{skills}}. We're hiring a {{jobTitle}} at {{company}} — would love to connect and share more if you're open to it.`,
    sequence: 'initial',
    delayDays: 0
  },
  {
    id: 'email_final',
    name: 'Closing Message - Email',
    channel: 'email',
    subjectTemplate: 'Final follow-up: {{jobTitle}} at {{company}}',
    bodyTemplate: `Hi {{candidateName}},

I've tried reaching out a couple of times about the {{jobTitle}} role. I'll assume the timing isn't right for now, but if you're ever interested in exploring opportunities at {{company}}, feel free to reach out.

Wishing you the best!

{{recruiterName}}`,
    sequence: 'closing',
    delayDays: 10
  }
];

// Get templates for a specific channel
export function getTemplates(channel: OutreachMessage['channel']): OutreachTemplate[] {
  return OUTREACH_TEMPLATES.filter(t => t.channel === channel);
}

// Fill template with candidate and job data
export function fillTemplate(
  template: OutreachTemplate,
  data: {
    candidateName: string;
    jobTitle: string;
    company: string;
    skills: string;
    recruiterName: string;
    recruiterTitle: string;
  }
): { subject: string; body: string } {
  let subject = template.subjectTemplate;
  let body = template.bodyTemplate;

  const replacements: Record<string, string> = {
    '{{candidateName}}': data.candidateName,
    '{{jobTitle}}': data.jobTitle,
    '{{company}}': data.company,
    '{{skills}}': data.skills,
    '{{recruiterName}}': data.recruiterName,
    '{{recruiterTitle}}': data.recruiterTitle,
  };

  for (const [key, value] of Object.entries(replacements)) {
    subject = subject.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
    body = body.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  }

  return { subject, body };
}

// Generate AI-personalized outreach message
export async function generatePersonalizedMessage(
  candidateInfo: {
    name: string;
    currentRole: string;
    currentCompany: string;
    skills: string[];
    profileSummary: string;
  },
  jobInfo: {
    title: string;
    company: string;
    description: string;
  },
  channel: 'email' | 'linkedin'
): Promise<{ subject: string; body: string }> {
  try {
    const response = await fetch('/api/ai/generate-outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateInfo, jobInfo, channel })
    });
    if (response.ok) {
      return response.json();
    }
  } catch (err) {
    console.error('[OutreachAgent] AI personalization failed:', err);
  }

  // Fallback to template
  const template = OUTREACH_TEMPLATES.find(
    t => t.channel === channel && t.sequence === 'initial'
  );
  if (template) {
    return fillTemplate(template, {
      candidateName: candidateInfo.name,
      jobTitle: jobInfo.title,
      company: jobInfo.company,
      skills: candidateInfo.skills.slice(0, 3).join(', '),
      recruiterName: 'Recruiting Team',
      recruiterTitle: 'Talent Acquisition',
    });
  }

  return {
    subject: `Opportunity: ${jobInfo.title} at ${jobInfo.company}`,
    body: `Hi ${candidateInfo.name}, I came across your profile and thought you might be interested in a ${jobInfo.title} role at ${jobInfo.company}. Would you be open to a conversation?`
  };
}

// Calculate next follow-up date based on sequence
export function getNextFollowUp(sequence: OutreachMessage['sequence']): {
  nextSequence: OutreachMessage['sequence'];
  followUpDate: string;
} {
  const sequenceOrder: OutreachMessage['sequence'][] = [
    'initial', 'follow_up_1', 'follow_up_2', 'follow_up_3', 'closing'
  ];
  const currentIdx = sequenceOrder.indexOf(sequence);
  if (currentIdx < sequenceOrder.length - 1) {
    const nextSeq = sequenceOrder[currentIdx + 1];
    const template = OUTREACH_TEMPLATES.find(t => t.sequence === nextSeq && t.channel === 'email');
    const delayDays = template?.delayDays || 3;
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + delayDays);
    return {
      nextSequence: nextSeq,
      followUpDate: nextDate.toISOString()
    };
  }
  return {
    nextSequence: 'closing',
    followUpDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  };
}

// Create a new outreach message
export function createOutreachMessage(params: {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  company: string;
  channel: OutreachMessage['channel'];
  subject?: string;
  body: string;
  templateUsed?: string;
}): OutreachMessage {
  return {
    candidateId: params.candidateId,
    candidateName: params.candidateName,
    candidateEmail: params.candidateEmail,
    jobTitle: params.jobTitle,
    company: params.company,
    channel: params.channel,
    subject: params.subject,
    body: params.body,
    status: 'draft',
    followUpCount: 0,
    sequence: 'initial',
    templateUsed: params.templateUsed,
    createdAt: new Date().toISOString()
  };
}

// Send an outreach message via the backend
export async function sendOutreach(message: OutreachMessage): Promise<boolean> {
  try {
    const response = await fetch('/api/ai/send-outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
    if (response.ok) {
      const result = await response.json();
      message.status = 'sent';
      message.sentAt = new Date().toISOString();
      return true;
    }
    return false;
  } catch (err) {
    console.error('[OutreachAgent] Send failed:', err);
    return false;
  }
}

// Get the next suggested outreach action for a candidate
export function getNextOutreachAction(
  lastOutreach: OutreachMessage | null
): { action: string; template?: OutreachTemplate } {
  if (!lastOutreach) {
    return {
      action: 'send_initial',
      template: OUTREACH_TEMPLATES.find(t => t.sequence === 'initial' && t.channel === 'email')
    };
  }

  if (lastOutreach.status === 'sent' && lastOutreach.sequence !== 'closing') {
    const { nextSequence } = getNextFollowUp(lastOutreach.sequence);
    const template = OUTREACH_TEMPLATES.find(
      t => t.sequence === nextSequence && t.channel === lastOutreach.channel
    );
    return {
      action: `send_${nextSequence}`,
      template
    };
  }

  if (lastOutreach.status === 'replied') {
    return { action: 'schedule_interview' };
  }

  return { action: 'no_action_needed' };
}

export { OUTREACH_TEMPLATES };
