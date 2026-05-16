export interface Organization {
  id: string;
  name: string;
  domain?: string;
  createdAt: any;
  createdBy: string;
  status: 'active' | 'suspended';
  settings?: {
    branding?: {
      logo?: string;
      primaryColor?: string;
    }
  };
}

export interface UserProfile {
  uid: string;
  email: string;
  organizationId: string;
  role: 'owner' | 'admin' | 'recruiter';
  fullName: string;
  createdAt: any;
}

export interface JobRequirements {
  must_have_skills: string[];
  nice_to_have_skills: string[];
  min_experience_years: number;
  required_education: string;
  preferred_industries: string[];
  role_seniority: string;
  location_requirement: string;
  keywords: string[];
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
    technicalCompetency: DimensionScore;
    communicationSkills: DimensionScore;
    leadershipTeamBonding: DimensionScore;
    cultureFit: DimensionScore;
    problemSolving: DimensionScore;
    domainExpertise: DimensionScore;
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
  createdAt: any;
  status: 'processed' | 'shortlisted' | 'rejected';
  interviewStatus?: 'none' | 'invited' | 'in_progress' | 'completed' | 'failed';
  meetLink?: string;
  research?: {
    summary: string;
    sources: { title: string; uri: string }[];
    lastResearchedAt: any;
  };
}

export interface AdminUser {
  uid: string;
  email: string;
  role: 'admin';
  createdAt: any;
}
