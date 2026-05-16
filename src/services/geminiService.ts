import { GoogleGenAI, Type } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

function getAiInstance(): GoogleGenAI {
  if (!aiInstance) {
    // Vite uses import.meta.env, but our environment injected process.env.
    // Fallback to import.meta.env for standard Vite/Vercel deployments.
    const apiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      throw new Error("GEMINI_API_KEY is not configured. Please add it to your environment variables.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

const JOB_PARSING_SCHEMA = {
  type: Type.OBJECT,
  description: "Job requirements analysis",
  properties: {
    must_have_skills: { type: Type.ARRAY, items: { type: Type.STRING } },
    nice_to_have_skills: { type: Type.ARRAY, items: { type: Type.STRING } },
    min_experience_years: { type: Type.NUMBER },
    required_education: { type: Type.STRING },
    preferred_industries: { type: Type.ARRAY, items: { type: Type.STRING } },
    role_seniority: { type: Type.STRING },
    role_type: { 
      type: Type.STRING, 
      enum: ["Technical / Engineering", "HR / People Ops", "Sales / BD", "Leadership / C-Suite", "Operations / Generalist"] 
    },
    location_requirement: { type: Type.STRING },
    keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["must_have_skills", "min_experience_years", "required_education", "role_type"],
};

const CITATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    claim: { type: Type.STRING },
    source: { type: Type.STRING },
    inferenceLogic: { type: Type.STRING }
  }
};

const DIMENSION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.NUMBER },
    rationale: { type: Type.STRING },
    confidence: { type: Type.STRING, enum: ["HIGH", "MED", "LOW"] },
    citations: { type: Type.ARRAY, items: CITATION_SCHEMA },
    weight: { type: Type.NUMBER }
  }
};

const CANDIDATE_SCREENING_SCHEMA = {
  type: Type.OBJECT,
  description: "Detailed candidate screening analysis",
  properties: {
    fullName: { type: Type.STRING },
    email: { type: Type.STRING },
    phone: { type: Type.STRING },
    location: { type: Type.STRING },
    currentRole: { type: Type.STRING },
    currentCompany: { type: Type.STRING },
    totalExperience: { type: Type.NUMBER },
    oneLineSummary: { type: Type.STRING },
    scorecard: {
      type: Type.OBJECT,
      properties: {
        compositeScore: { type: Type.NUMBER },
        integrityScore: { type: Type.NUMBER },
        recommendation: {
          type: Type.OBJECT,
          properties: {
            fitHeader: { type: Type.STRING },
            status: { type: Type.STRING, enum: ["perfect", "strong", "potential", "rejected"] },
            summary: { type: Type.STRING }
          }
        },
        dimensions: {
          type: Type.OBJECT,
          properties: {
            skillsMatch: DIMENSION_SCHEMA,
            experienceFit: DIMENSION_SCHEMA,
            education: DIMENSION_SCHEMA,
            achievements: DIMENSION_SCHEMA,
            culturalRoleFit: DIMENSION_SCHEMA,
            signalDensity: {
              type: Type.OBJECT,
              properties: {
                score: { type: Type.NUMBER },
                rationale: { type: Type.STRING },
                analysis: { type: Type.STRING }
              }
            },
            redFlags: {
              type: Type.OBJECT,
              properties: {
                flags: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING },
                      severity: { type: Type.STRING, enum: ["low", "medium", "high"] },
                      penalty: { type: Type.NUMBER },
                      rationale: { type: Type.STRING }
                    }
                  }
                },
                totalPenalty: { type: Type.NUMBER }
              }
            }
          }
        },
        skillsAnalysis: {
          type: Type.OBJECT,
          properties: {
            confirmed: { type: Type.ARRAY, items: { type: Type.STRING } },
            absent: { type: Type.ARRAY, items: { type: Type.STRING } },
            inferred: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        },
        interviewQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
      }
    }
  },
  required: ["fullName", "oneLineSummary", "scorecard"],
};

export async function parseJobDescription(text: string) {
  const ai = getAiInstance();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `You are a Senior Technical Analyst. Deconstruct the following job description into an atomic set of requirements for an AI screening agent.
    
    FOCUS AREAS:
    - Must-have skills: Technical stack primitives.
    - Nice-to-have skills: Ecosystem add-ons.
    - Quantitative markers: Years of experience, degree types.
    - Contextual markers: Seniority, location, industry.
    
    JOB DESCRIPTION:
    ${text}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: JOB_PARSING_SCHEMA,
    },
  });

  try {
    const rawText = response.text || "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[0] : rawText.trim();
    return JSON.parse(jsonString);
  } catch (err) {
    console.error("Job Parsing JSON Error:", err, "Raw Text:", response.text);
    throw new Error(`Failed to parse job description. The AI output was not valid JSON.`);
  }
}

export async function screenCandidate(resumeText: string, jobRequirements: any) {
  const ai = getAiInstance();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `You are a Principal Talent Solutions Architect and Adversarial Talent Auditor. 
    Your mission: Perform a forensic, high-fidelity screening of the candidate resume against specific Job Requirements.
    
    SCORING PROTOCOL (D6+ v2.0):
    Analyze and score the candidate on 5 core dimensions (Each 0-100):
    1. skillsMatch (D1): Keyword overlap + semantic similarity. Must-have match = full score. Nice-to-have = partial.
    2. experienceFit (D2): Years of relevant exp, title proximity (IC vs Mgr), industry alignment.
    3. education (D3): Degree level match, field relevance, institution tier.
    4. achievements (D4): Quantified outcomes (%, $, numbers), awards, scale signals.
    5. culturalRoleFit (D5): Tenure patterns (job-hopping), growth trajectory consistency.

    SIGNAL REQUIREMENTS:
    - Identify specific "Penalties" (e.g., gaps > 12mo, job-hopping < 1yr avg tenure, resume < 300 words).
    - Identify specific "Bonuses" (e.g., exact match on 5+ keywords, referral, previous hire from tier-1 firms).
    - Detect "Red Flags" with severity levels.

    MANDATE: 
    - Be a strict filter. 
    - Calculate a base compositeScore using these dimensions.
    - Provide deep rationales and citations for every claim.
    
    JOB REQUIREMENTS:
    ${JSON.stringify(jobRequirements, null, 2)}
    
    CANDIDATE RESUME:
    ${resumeText}
    
    Return ONLY valid JSON matching the schema precisely.`,
    config: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: CANDIDATE_SCREENING_SCHEMA,
    },
  });

  try {
    const rawText = response.text || "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[0] : rawText.trim();
    
    return JSON.parse(jsonString);
  } catch (err) {
    console.error("Gemini Parse Error:", err);
    if ((response.text || "").length > 50000) {
      throw new Error(`Candidate screening failed: The generated report was too large for standard parsing.`);
    }
    throw new Error(`Failed to parse screening result. Error: ${err instanceof Error ? err.message : 'Invalid JSON'}`);
  }
}

export async function researchCandidate(candidateName: string, role: string, company: string, details: string) {
  const ai = getAiInstance();
  const prompt = `You are an elite Professional Intelligence Agent specializing in executive-level background verification and deep-signal talent research.
  
  MISSION: Conduct a comprehensive, multi-source professional audit of the candidate: ${candidateName}.
  CURRENT TARGET: ${role} at ${company}.
  KNOWN CONTEXT: ${details}
  
  RESOURCES TO SCAN:
  1. Professional Identity: Highly specific LinkedIn profile data, recent posts, and professional endorsements.
  2. Technical Footprint: GitHub repository activity, Stack Overflow contributions, or meaningful Open Source impact.
  3. Thought Leadership: White papers, medium/personal blog posts, YouTube conference talks, or Podcast appearances.
  4. Public Recognition: Press releases, awards, patent filings, or verified media mentions.
  5. Portfolios: Personal websites or design portfolios.
  
  ACCURACY PROTOCOL:
  - Verify if the current target role matches public records.
  - Cross-reference listed skills with actual public output (e.g., if they claim Rust expertise, find Rust code).
  - Look for "hidden gems" (exceptional projects or achievements not typically detailed in resumes).
  
  OUTPUT STRUCTURE:
  ### Executive Summary
  (Concise overview of professional stature and reputation)
  
  ### High-Signal Findings
  (Bullet points of verified achievements, public artifacts, or technical evidence)
  
  ### Risk & Verification Notes
  (Any discrepancies found or markers of exceptional integrity)
  
  MANDATE: Be objective, data-driven, and prioritize verified links over general descriptions. Max 500 words.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0,
    },
  });

  const text = response.text || "";
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  const sources = chunks ? chunks
    .filter((c: any) => c.web)
    .map((c: any) => ({
      title: c.web.title,
      uri: c.web.uri
    })) : [];

  return {
    summary: text,
    sources,
    timestamp: new Date().toISOString()
  };
}
