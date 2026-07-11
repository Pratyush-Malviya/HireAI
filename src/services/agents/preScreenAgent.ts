// Agent 5 - Pre-Screening Interview Agent
// Runs async text pre-screening — availability, salary expectation, notice period, qualifying questions
// Scores responses, stores in Firestore, summarizes for recruiter

export interface PreScreenQuestion {
  id: string;
  category: 'availability' | 'salary' | 'notice' | 'qualifying' | 'experience' | 'skill' | 'cultural';
  question: string;
  type: 'text' | 'multiple_choice' | 'numeric' | 'yes_no';
  options?: string[];
  weight: number;
  required: boolean;
}

export interface PreScreenResponse {
  questionId: string;
  question: string;
  response: string;
  score?: number;
  notes?: string;
}

export interface PreScreenResult {
  id?: string;
  candidateId: string;
  candidateName: string;
  jobId: string;
  jobTitle: string;
  status: 'invited' | 'in_progress' | 'completed' | 'expired';
  invitedAt: string;
  completedAt?: string;
  responses: PreScreenResponse[];
  scores: {
    availability: number;
    salaryFit: number;
    noticePeriod: number;
    skillMatch: number;
    experience: number;
    culturalFit: number;
    overall: number;
  };
  qualified: boolean;
  summary: string;
  recruiterNotes: string;
  availability?: {
    startDate?: string;
    preferredSchedule?: string;
  };
  salaryExpectation?: {
    expected: number;
    currency: string;
    negotiable: boolean;
  };
  noticePeriod?: {
    period: string;
    canNegotiate: boolean;
  };
}

// Pre-screening question bank
const QUESTION_BANK: PreScreenQuestion[] = [
  // Availability
  { id: 'avail_1', category: 'availability', question: 'What is your earliest available start date?', type: 'text', weight: 5, required: true },
  { id: 'avail_2', category: 'availability', question: 'What is your preferred work schedule? (Full-time, Part-time, Contract, Flexible)', type: 'multiple_choice', options: ['Full-time', 'Part-time', 'Contract', 'Flexible', 'Open to any'], weight: 3, required: true },
  
  // Salary
  { id: 'sal_1', category: 'salary', question: 'What is your expected annual salary (in USD)?', type: 'numeric', weight: 10, required: true },
  { id: 'sal_2', category: 'salary', question: 'Is your salary expectation negotiable?', type: 'yes_no', weight: 5, required: true },
  
  // Notice Period
  { id: 'notice_1', category: 'notice', question: 'What is your current notice period?', type: 'multiple_choice', options: ['Immediate', '1 week', '2 weeks', '1 month', '2 months', '3 months'], weight: 8, required: true },
  { id: 'notice_2', category: 'notice', question: 'Can your notice period be negotiated?', type: 'yes_no', weight: 3, required: false },
  
  // Qualifying Questions
  { id: 'qual_1', category: 'qualifying', question: 'Why are you interested in this role?', type: 'text', weight: 15, required: true },
  { id: 'qual_2', category: 'qualifying', question: 'What is your most relevant accomplishment in your current/past role?', type: 'text', weight: 15, required: true },
  
  // Experience
  { id: 'exp_1', category: 'experience', question: 'How many years of professional experience do you have in this field?', type: 'numeric', weight: 10, required: true },
  { id: 'exp_2', category: 'experience', question: 'Describe your experience with the key technologies required for this role.', type: 'text', weight: 15, required: true },
  
  // Cultural
  { id: 'cult_1', category: 'cultural', question: 'What type of work environment do you thrive in?', type: 'text', weight: 8, required: false },
  { id: 'cult_2', category: 'cultural', question: 'How do you prefer to receive feedback?', type: 'text', weight: 3, required: false },
];

// Get questions for a pre-screening
export function getPreScreenQuestions(customizeForRole?: string): PreScreenQuestion[] {
  return QUESTION_BANK;
}

// Create a pre-screening invitation
export function createPreScreenInvitation(params: {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  jobId: string;
  jobTitle: string;
  recruiterMessage?: string;
}): { invitationLink: string; questions: PreScreenQuestion[] } {
  const questions = getPreScreenQuestions(params.jobTitle);
  const token = btoa(`${params.candidateId}:${params.jobId}:${Date.now()}`);
  
  return {
    invitationLink: `/pre-screen/${token}`,
    questions
  };
}

// Score a response based on content and category
function scoreResponse(question: PreScreenQuestion, response: string): number {
  if (!response || response.trim().length === 0) return 0;
  
  switch (question.type) {
    case 'yes_no':
      return 1; // Any answer is informative
    case 'numeric': {
      const num = parseFloat(response);
      return isNaN(num) ? 0 : 1;
    }
    case 'multiple_choice':
      return response.trim().length > 0 ? 1 : 0;
    case 'text': {
      const length = response.trim().length;
      if (length < 10) return 0.3;
      if (length < 50) return 0.6;
      if (length < 200) return 0.8;
      return 1;
    }
    default:
      return response.trim().length > 0 ? 0.5 : 0;
  }
}

// Calculate overall scores from responses
export function calculateScores(
  responses: PreScreenResponse[],
  questions: PreScreenQuestion[]
): PreScreenResult['scores'] {
  const categoryScores: Record<string, { total: number; earned: number }> = {
    availability: { total: 100, earned: 0 },
    salary: { total: 100, earned: 0 },
    noticePeriod: { total: 100, earned: 0 },
    qualifying: { total: 100, earned: 0 },
    experience: { total: 100, earned: 0 },
    culturalFit: { total: 100, earned: 0 },
  };

  for (const response of responses) {
    const question = questions.find(q => q.id === response.questionId);
    if (!question) continue;
    
    const catKey = question.category === 'skill' ? 'qualifying' : 
                   question.category === 'cultural' ? 'culturalFit' :
                   question.category;
    
    if (categoryScores[catKey]) {
      const weightedScore = scoreResponse(question, response.response) * 100;
      response.score = weightedScore;
      categoryScores[catKey].earned += weightedScore * question.weight;
      categoryScores[catKey].total += 100 * question.weight;
    }
  }

  const scores: PreScreenResult['scores'] = {
    availability: 0,
    salaryFit: 0,
    noticePeriod: 0,
    skillMatch: 0,
    experience: 0,
    culturalFit: 0,
    overall: 0,
  };

  const availabilityScore = categoryScores.availability.total > 0
    ? Math.round((categoryScores.availability.earned / categoryScores.availability.total) * 100)
    : 50;
  scores.availability = Math.min(100, availabilityScore);

  const salaryScore = categoryScores.salary.total > 0
    ? Math.round((categoryScores.salary.earned / categoryScores.salary.total) * 100)
    : 50;
  scores.salaryFit = Math.min(100, salaryScore);

  const noticeScore = categoryScores.noticePeriod.total > 0
    ? Math.round((categoryScores.noticePeriod.earned / categoryScores.noticePeriod.total) * 100)
    : 50;
  scores.noticePeriod = Math.min(100, noticeScore);

  const skillScore = categoryScores.qualifying.total > 0
    ? Math.round((categoryScores.qualifying.earned / categoryScores.qualifying.total) * 100)
    : 50;
  scores.skillMatch = Math.min(100, skillScore);

  const expScore = categoryScores.experience.total > 0
    ? Math.round((categoryScores.experience.earned / categoryScores.experience.total) * 100)
    : 50;
  scores.experience = Math.min(100, expScore);

  const cultureScore = categoryScores.culturalFit.total > 0
    ? Math.round((categoryScores.culturalFit.earned / categoryScores.culturalFit.total) * 100)
    : 50;
  scores.culturalFit = Math.min(100, cultureScore);

  // Overall weighted score
  scores.overall = Math.round(
    scores.availability * 0.1 +
    scores.salaryFit * 0.2 +
    scores.noticePeriod * 0.1 +
    scores.skillMatch * 0.3 +
    scores.experience * 0.2 +
    scores.culturalFit * 0.1
  );

  return scores;
}

// Generate a summary of pre-screening results
export function generateSummary(
  result: PreScreenResult
): string {
  const parts: string[] = [];
  
  if (result.availability?.startDate) {
    parts.push(`Available from: ${result.availability.startDate}`);
  }
  if (result.salaryExpectation) {
    parts.push(`Salary: $${result.salaryExpectation.expected.toLocaleString()}/${result.salaryExpectation.currency}${result.salaryExpectation.negotiable ? ' (negotiable)' : ' (fixed)'}`);
  }
  if (result.noticePeriod) {
    parts.push(`Notice: ${result.noticePeriod.period}${result.noticePeriod.canNegotiate ? ' (negotiable)' : ''}`);
  }
  
  parts.push(`Overall Score: ${result.scores.overall}/100`);
  parts.push(`Qualified: ${result.qualified ? 'Yes' : 'No'}`);
  
  if (result.qualified) {
    const strengths = result.responses
      .filter(r => (r.score || 0) >= 80)
      .map(r => r.question);
    if (strengths.length > 0) {
      parts.push(`Strengths: ${strengths.join('; ')}`);
    }
  }
  
  return parts.join('\n');
}

// Determine if candidate qualifies based on scores
export function isQualified(scores: PreScreenResult['scores']): boolean {
  return (
    scores.overall >= 60 &&
    scores.skillMatch >= 50 &&
    scores.experience >= 40
  );
}

export { QUESTION_BANK };
