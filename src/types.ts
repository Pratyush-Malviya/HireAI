export interface Organization {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  companySize?: string;
  location?: string;
  phone?: string;
  description?: string;
  botSpeechRate?: number;
  createdAt: any;
  createdBy: string;
  status: 'active' | 'suspended' | 'pending_payment';
  tier?: 'starter' | 'pro' | 'enterprise';
  seatCount?: number;
  memberCount?: number;
  adminEmail?: string;
  trialEndsAt?: any;
  emailSettings?: {
    smtpHost?: string;
    smtpPort?: string;
    smtpSecure?: boolean;
    smtpUser?: string;
    smtpPass?: string;
    smtpFromName?: string;
    smtpFromEmail?: string;
  };
  settings?: {
    branding?: {
      logo?: string;
      primaryColor?: string;
    }
  };
  whiteLabel?: {
    domain?: string;
    primaryColor?: string;
    logoUrl?: string;
    customCss?: string;
    faviconUrl?: string;
  };
  workingHours?: {
    start: string;
    end: string;
    timezone: string;
  };
  botSpeakingPace?: number;
  stripeCustomerId?: string;
  subscriptionStatus?: string;
  currentPeriodEnd?: string;
  jobCount?: number;
  candidateCount?: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  organizationId: string;
  role: 'owner' | 'admin' | 'recruiter' | 'hr_executive';
  fullName: string;
  credits?: number;
  createdAt: any;
  status?: 'active' | 'invited' | 'disabled';
  invitedBy?: string;
  lastLoginAt?: any;
}

export interface TeamMember {
  uid: string;
  email: string;
  fullName: string;
  role: UserProfile['role'];
  status: 'active' | 'invited' | 'disabled';
  organizationId: string;
  createdAt: any;
  invitedBy?: string;
  lastLoginAt?: any;
}

export interface JobRequirements {
  must_have_skills: string[];
  nice_to_have_skills: string[];
  min_experience_years: number;
  required_education: string;
  preferred_industries: string[];
  role_seniority: string;
  role_type: string;
  location_requirement: string;
  keywords: string[];
  thresholds?: {
    passed: number;
    low: number;
  };
  customCriteria?: {
    skillsMatch?: { name: string; description: string; weight: number };
    experienceFit?: { name: string; description: string; weight: number };
    education?: { name: string; description: string; weight: number };
    achievements?: { name: string; description: string; weight: number };
    culturalRoleFit?: { name: string; description: string; weight: number };
  };
}

export interface Job {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  company?: string;
  requirements: JobRequirements;
  createdAt: any;
  createdBy: string;
  status: 'active' | 'closed';
  interviewDurationMinutes?: number;
  feeSize?: number;
  deadline?: string;
  urgency?: 'low' | 'medium' | 'high';
  closedAt?: any;
}

export type ConfidenceLevel = 'HIGH' | 'MED' | 'LOW';

export interface GroundingCitation {
  claim: string;
  source: string; // Exact quote from resume/transcript
  inferenceLogic?: string;
}

export interface DimensionScore {
  score: number; // 0-100
  rationale: string;
  confidence: ConfidenceLevel;
  citations: GroundingCitation[];
  weight: number;
}

export interface Scorecard {
  compositeScore: number; // 0-100
  integrityScore: number; // 0-100
  recommendation: {
    fitHeader: string;
    status: 'perfect' | 'strong' | 'potential' | 'rejected';
    summary: string;
  };
  dimensions: {
    skillsMatch: DimensionScore;
    experienceFit: DimensionScore;
    education: DimensionScore;
    achievements: DimensionScore;
    culturalRoleFit: DimensionScore;
    signalDensity?: {
      score: number;
      rationale: string;
      analysis: string;
    };
    redFlags: {
      flags: { label: string; severity: 'low' | 'medium' | 'high'; penalty: number; rationale: string }[];
      totalPenalty: number;
    };
  };
  skillsAnalysis: {
    confirmed: string[];
    absent: string[];
    inferred: string[];
  };
  proctoringEvents: {
    type: 'tab_switch' | 'face_leave' | 'voice_anomaly';
    timestamp: any;
    details: string;
  }[];
  interviewQuestions: string[];
}

export interface Candidate {
  id: string;
  jobId: string;
  organizationId: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  currentRole: string;
  currentCompany: string;
  totalExperience: number;
  oneLineSummary: string;
  scorecard: Scorecard;
  resumeHash: string;
  batchId?: string;
  createdBy: string;
  parsedData: any;
  resumeText?: string;
  profileTags?: string[];
  createdAt: any;
  status: 'processed' | 'shortlisted' | 'rejected';
  meetingRecordingUrl?: string;
  interviewStatus?: 'none' | 'invited' | 'in_progress' | 'completed' | 'failed';
  meetLink?: string;
  research?: {
    // Basic fields
    summary: string;
    sources: { title: string; uri: string }[];
    lastResearchedAt: any;

    // Structured metric fields from HireNow DeepResearch Engine Document
    status?: 'VERIFIED' | 'HIGH_CONFIDENCE' | 'MEDIUM_CONFIDENCE' | 'LOW_CONFIDENCE' | 'NOT_FOUND';
    message?: string;
    identity_confidence?: number;
    technical_score?: number;
    leadership_score?: number;
    communication_score?: number;
    reputation_score?: number;
    risk_score?: number;
    overall_recommendation?: 'STRONG_MATCH' | 'GOOD_MATCH' | 'POTENTIAL_MATCH' | 'NOT_RECOMMENDED' | string;
    
    // Narrative layers
    career_narrative?: string;
    technical_depth?: string;
    leadership_potential?: string;
    communication_quality?: string;
    hiring_recommendation?: string;
    risk_signals?: string;

    // Deep metrics
    seniority_estimate?: string;
    engineering_depth_score?: number;
    problem_solving_score?: number;
    stability_score?: number;
    growth_trajectory?: string;
    industry_visibility_score?: number;
    verified_profiles?: { name: string; url: string; status: 'Verified' | 'Probable' | 'Not Found' | 'Unverified' }[];
  };
  aiQuotaExceeded?: boolean;
}

export interface AdminUser {
  uid: string;
  email: string;
  role: 'admin';
  createdAt: any;
}

// ── SARVAX-style Interview Evaluation Types ──

export type QuestionCategory = 'technical' | 'behavioural' | 'situational' | 'cultural_fit';

export interface QuestionEvaluation {
  question: string;
  response: string;
  category: QuestionCategory;
  score: number; // 1-5
  notes: string;
}

export interface CompetencyScores {
  technicalSkills: number;
  communication: number;
  problemSolving: number;
  leadershipTeamwork: number;
  culturalFit: number;
}

export interface InterviewEvaluation {
  preInterviewFitScore: number;
  overallScore: number;
  recommendation: 'HIRE' | 'NO_HIRE' | 'FURTHER_REVIEW';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  questions: QuestionEvaluation[];
  competencies: CompetencyScores;
  strengths: string[];
  weaknesses: string[];
  skillMatch: { skill: string; required: boolean; proficiency: 'high' | 'medium' | 'low' | 'missing' }[];
  followUpQuestions: string[];
  escalationReason?: string;
  summary: string;
}
