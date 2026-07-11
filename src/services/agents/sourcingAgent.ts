// Agent 2 - Candidate Sourcing Agent
// Searches LinkedIn, GitHub, Naukri, Indeed based on JD.
// Pulls profiles, enriches data, deduplicates, stores sourced candidate pool in Firestore

import { Job, Candidate } from '../../types';
import { db } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';

export interface SourcedProfile {
  fullName: string;
  email?: string;
  phone?: string;
  location?: string;
  currentRole?: string;
  currentCompany?: string;
  profileUrl: string;
  source: 'linkedin' | 'github' | 'naukri' | 'indeed' | 'other';
  skills: string[];
  experience?: number;
  summary?: string;
  matchScore: number;
  enriched: boolean;
}

export interface SourcingQuery {
  jobTitle: string;
  skills: string[];
  location?: string;
  experienceMin?: number;
  experienceMax?: number;
}

// Search via DuckDuckGo (reuses existing pattern)
async function searchProfiles(
  query: string, 
  source: SourcedProfile['source']
): Promise<Partial<SourcedProfile>[]> {
  try {
    const response = await fetch(
      `/api/ai/source-candidates`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, source, maxResults: 25 })
      }
    );
    if (!response.ok) throw new Error('Sourcing API failed');
    return response.json();
  } catch (err) {
    console.error(`[SourcingAgent] ${source} search failed:`, err);
    return [];
  }
}

// Deduplicate profiles by URL or name+company
function deduplicate(profiles: SourcedProfile[]): SourcedProfile[] {
  const seen = new Set<string>();
  return profiles.filter(p => {
    const key = p.profileUrl || `${p.fullName.toLowerCase()}|${p.currentCompany?.toLowerCase() || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Score match between sourced profile and job requirements
function calculateMatchScore(
  profile: Partial<SourcedProfile>,
  job: SourcingQuery
): number {
  let score = 0;
  const profileSkills = (profile.skills || []).map(s => s.toLowerCase());
  const jobSkills = job.skills.map(s => s.toLowerCase());
  
  // Skill overlap (0-50 points)
  if (jobSkills.length > 0) {
    const matches = jobSkills.filter(s => 
      profileSkills.some(ps => ps.includes(s) || s.includes(ps))
    ).length;
    score += (matches / jobSkills.length) * 50;
  }
  
  // Title match (0-20 points)
  if (profile.currentRole && job.jobTitle) {
    const titleWords = job.jobTitle.toLowerCase().split(/\s+/);
    const roleWords = profile.currentRole.toLowerCase().split(/\s+/);
    const overlap = titleWords.filter(w => roleWords.includes(w)).length;
    score += (overlap / Math.max(titleWords.length, roleWords.length)) * 20;
  }
  
  // Experience fit (0-20 points)
  if (profile.experience !== undefined && job.experienceMin !== undefined) {
    if (profile.experience >= job.experienceMin) {
      score += 20;
      if (job.experienceMax && profile.experience > job.experienceMax) {
        score -= 5; // slight penalty for over-qualification
      }
    } else {
      const ratio = profile.experience / job.experienceMin;
      score += ratio * 20;
    }
  }
  
  // Location match (0-10 points)
  if (job.location && profile.location) {
    const locMatch = profile.location.toLowerCase().includes(job.location.toLowerCase()) ||
                     job.location.toLowerCase().includes(profile.location.toLowerCase());
    if (locMatch) score += 10;
  }
  
  return Math.round(Math.min(100, Math.max(0, score)));
}

// Generate search queries from job requirements
function buildSearchQueries(job: SourcingQuery): { query: string; source: SourcedProfile['source'] }[] {
  const queries: { query: string; source: SourcedProfile['source'] }[] = [];
  const skillTerms = job.skills.slice(0, 3).join(' ');
  const loc = job.location ? ` ${job.location}` : '';
  
  queries.push({ 
    query: `site:linkedin.com/in "${job.jobTitle}" "${skillTerms}"${loc}`, 
    source: 'linkedin' 
  });
  queries.push({ 
    query: `site:github.com ${skillTerms} developer${loc}`, 
    source: 'github' 
  });
  queries.push({ 
    query: `"${job.jobTitle}" "${skillTerms}" resume${loc}`, 
    source: 'indeed' 
  });
  
  return queries;
}

// Main sourcing function
export async function sourceCandidates(
  job: SourcingQuery,
  organizationId: string,
  jobId: string
): Promise<{ profiles: SourcedProfile[]; totalFound: number }> {
  const searchQueries = buildSearchQueries(job);
  const allProfiles: SourcedProfile[] = [];
  
  // Run searches
  for (const { query, source } of searchQueries) {
    const results = await searchProfiles(query, source);
    for (const r of results) {
      const matchScore = calculateMatchScore(r, job);
      if (matchScore >= 20) { // minimum threshold
        allProfiles.push({
          fullName: r.fullName || 'Unknown',
          profileUrl: r.profileUrl || '',
          source,
          skills: r.skills || [],
          matchScore,
          enriched: false,
          ...r
        });
      }
    }
  }
  
  // Deduplicate
  const uniqueProfiles = deduplicate(allProfiles);
  
  // Sort by match score
  uniqueProfiles.sort((a, b) => b.matchScore - a.matchScore);
  
  // Store top profiles in Firestore as candidate suggestions
  const batch = uniqueProfiles.slice(0, 50);
  for (const profile of batch) {
    try {
      // Check if candidate already exists
      const existing = await getDocs(
        query(
          collection(db, 'candidates'),
          where('jobId', '==', jobId),
          where('email', '==', profile.email || '')
        )
      );
      
      if (existing.empty) {
        await addDoc(collection(db, 'candidates'), {
          jobId,
          organizationId,
          fullName: profile.fullName,
          email: profile.email || '',
          phone: profile.phone || '',
          location: profile.location || '',
          currentRole: profile.currentRole || '',
          currentCompany: profile.currentCompany || '',
          totalExperience: profile.experience || 0,
          oneLineSummary: profile.summary || profile.currentRole || '',
          profileTags: profile.skills,
          createdAt: serverTimestamp(),
          status: 'processed',
          source: profile.source,
          sourceUrl: profile.profileUrl,
          matchScore: profile.matchScore,
          sourced: true,
        } as any);
      }
    } catch (err) {
      console.error('[SourcingAgent] Failed to save sourced profile:', err);
    }
  }
  
  return {
    profiles: batch,
    totalFound: uniqueProfiles.length
  };
}

// Enrich a sourced profile with additional data
export async function enrichProfile(profile: SourcedProfile): Promise<SourcedProfile> {
  try {
    const response = await fetch('/api/ai/enrich-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile })
    });
    if (response.ok) {
      const enriched = await response.json();
      return { ...profile, ...enriched, enriched: true };
    }
  } catch (err) {
    console.error('[SourcingAgent] Enrichment failed:', err);
  }
  return profile;
}
