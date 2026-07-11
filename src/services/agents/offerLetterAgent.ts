// Agent 8 — Offer Letter & Contract Generator
// Input: candidate name, role, CTC, joining date, clauses
// Output: formatted offer letter in DOCX + PDF
// Stores generated docs in Firebase Storage, linked to candidate record in Firestore

export interface OfferLetterData {
  candidateName: string;
  candidateEmail: string;
  candidateAddress?: string;
  jobTitle: string;
  department: string;
  companyName: string;
  companyAddress: string;
  startDate: string;
  employmentType: 'full-time' | 'part-time' | 'contract' | 'internship';
  compensation: {
    baseSalary: number;
    currency: string;
    payFrequency: 'monthly' | 'bi-weekly' | 'annually';
    bonus?: {
      amount: number;
      type: string;
      description: string;
    };
    equity?: {
      type: string;
      shares: number;
      vestingSchedule: string;
    };
    otherBenefits?: string[];
  };
  reportingTo?: string;
  workLocation: string;
  remotePolicy: string;
  probationPeriod?: string;
  noticePeriod?: string;
  specialClauses?: string[];
  offerExpiryDate: string;
  recruiterName: string;
  recruiterTitle: string;
}

export interface OfferLetterOutput {
  id: string;
  candidateId: string;
  jobId: string;
  data: OfferLetterData;
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
  documentUrl?: string;
  documentPath?: string;
  createdAt: string;
  sentAt?: string;
  respondedAt?: string;
  version: number;
}

// Standard offer letter clauses
const STANDARD_CLAUSES = {
  atWill: 'This offer of employment is at-will, meaning either you or the Company may terminate your employment at any time, with or without cause or advance notice.',
  confidentiality: 'As a condition of employment, you will be required to sign our standard Confidentiality and Non-Disclosure Agreement.',
  backgroundCheck: 'This offer is contingent upon the successful completion of a background check and verification of your credentials.',
  workAuthorization: 'You must provide proof of your legal right to work in the country where this position is located.',
  codeOfConduct: 'You agree to adhere to the Company\'s Code of Conduct and all company policies as outlined in the employee handbook.',
};

// Build offer letter content from data
export function buildOfferLetterContent(data: OfferLetterData): string {
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const salaryDisplay = new Intl.NumberFormat('en-US', { style: 'currency', currency: data.compensation.currency || 'USD', minimumFractionDigits: 0 }).format(data.compensation.baseSalary);
  const salaryPeriod = data.compensation.payFrequency === 'monthly' ? `${salaryDisplay}/month` :
    data.compensation.payFrequency === 'bi-weekly' ? `${salaryDisplay}/bi-weekly` : `${salaryDisplay}/year`;

  return `${data.companyName}
${data.companyAddress}

${date}

Dear ${data.candidateName},

SUBJECT: Offer of Employment — ${data.jobTitle}

We are delighted to extend this offer of employment for the position of ${data.jobTitle} in the ${data.department} department at ${data.companyName}. We were impressed with your qualifications and believe you will make a valuable contribution to our team.

POSITION DETAILS
• Position: ${data.jobTitle}
• Department: ${data.department}
${data.reportingTo ? `• Reports To: ${data.reportingTo}` : ''}
• Location: ${data.workLocation}
• Work Arrangement: ${data.remotePolicy}
• Employment Type: ${data.employmentType}
• Start Date: ${data.startDate}
• Probation Period: ${data.probationPeriod || '3 months'}
• Notice Period: ${data.noticePeriod || '30 days'}

COMPENSATION
• Base Salary: ${salaryPeriod}
${data.compensation.bonus ? `• Bonus: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: data.compensation.currency || 'USD', minimumFractionDigits: 0 }).format(data.compensation.bonus.amount)} ${data.compensation.bonus.type} — ${data.compensation.bonus.description}` : ''}
${data.compensation.equity ? `• Equity: ${data.compensation.equity.shares} shares of ${data.compensation.equity.type} — ${data.compensation.equity.vestingSchedule}` : ''}
${data.compensation.otherBenefits?.length ? `• Additional Benefits:\n${data.compensation.otherBenefits.map(b => `  — ${b}`).join('\n')}` : ''}

TERMS & CONDITIONS

1. ${STANDARD_CLAUSES.atWill}
2. ${STANDARD_CLAUSES.confidentiality}
3. ${STANDARD_CLAUSES.backgroundCheck}
4. ${STANDARD_CLAUSES.workAuthorization}
5. ${STANDARD_CLAUSES.codeOfConduct}

${data.specialClauses?.length ? `ADDITIONAL TERMS\n${data.specialClauses.map((c, i) => `${i + 6}. ${c}`).join('\n')}\n` : ''}

This offer expires on ${data.offerExpiryDate}. To accept, please sign and return this letter by that date.

We look forward to welcoming you to the team!

Sincerely,

${data.recruiterName}
${data.recruiterTitle}
${data.companyName}

---

ACCEPTANCE

I, ${data.candidateName}, accept the offer of employment for the position of ${data.jobTitle} at ${data.companyName} under the terms and conditions outlined above.

Signature: ______________________________

Date: ___________________________________
`;
}

// Create an offer letter record
export function createOfferLetter(
  candidateId: string,
  jobId: string,
  data: OfferLetterData
): OfferLetterOutput {
  return {
    id: `offer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    candidateId,
    jobId,
    data,
    status: 'draft',
    createdAt: new Date().toISOString(),
    version: 1,
  };
}

// Generate offer letter via backend (DOCX + PDF)
export async function generateOfferLetterDocument(
  offerLetter: OfferLetterOutput
): Promise<{ docxUrl?: string; pdfUrl?: string }> {
  try {
    const response = await fetch('/api/ai/generate-offer-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(offerLetter)
    });
    if (response.ok) {
      return response.json();
    }
  } catch (err) {
    console.error('[OfferLetterAgent] Document generation failed:', err);
  }
  return {};
}

// Validate offer letter data completeness
export function validateOfferLetter(data: Partial<OfferLetterData>): string[] {
  const errors: string[] = [];
  const required: (keyof OfferLetterData)[] = [
    'candidateName', 'jobTitle', 'department', 'companyName',
    'companyAddress', 'startDate', 'workLocation', 'recruiterName', 'recruiterTitle'
  ];
  
  for (const field of required) {
    if (!data[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  if (!data.compensation?.baseSalary) {
    errors.push('Missing base salary');
  }
  
  return errors;
}

// Generate comparison summary for multi-offer scenarios
export function compareOffers(offers: OfferLetterData[]): string {
  return offers.map(o =>
    `${o.companyName} — ${o.jobTitle}: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: o.compensation.currency || 'USD', minimumFractionDigits: 0 }).format(o.compensation.baseSalary)}/yr`
  ).join('\n');
}
