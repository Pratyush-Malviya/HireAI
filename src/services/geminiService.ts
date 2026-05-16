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
    location_requirement: { type: Type.STRING },
    keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["must_have_skills", "min_experience_years", "required_education"],
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
            technicalCompetency: DIMENSION_SCHEMA,
            communicationSkills: DIMENSION_SCHEMA,
            leadershipTeamBonding: DIMENSION_SCHEMA,
            cultureFit: DIMENSION_SCHEMA,
            problemSolving: DIMENSION_SCHEMA,
            domainExpertise: DIMENSION_SCHEMA,
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
    model: "gemini-3-flash-preview",
    contents: `Analyze the following job description and extract key requirements in a structured format:
    
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
    model: "gemini-3-flash-preview",
    contents: `You are an elite Technical Recruiter and Talent Analyst. Your task is to perform a deep-dive screening of the candidate based on their resume against the specific job requirements provided.

SCORING ALGORITHM REQUIREMENTS:
1. compositeScore (0-100): Calculated as a weighted average:
   - Technical Competency (40%)
   - Problem Solving & Logic (20%)
   - Communication & Clarity (15%)
   - Domain Expertise (15%)
   - Leadership/Culture Fit (10%)
2. integrityScore (0-100): Initialized at 100. Deduct points for:
   - Date gaps > 6 months unexplained (-15 per gap)
   - Overlapping full-time roles at different companies (-30)
   - Vague "buzzword-only" descriptions without specific outcomes (-10)
   - Skills listed without supporting project evidence in work history (-10)
3. RED FLAGS: Be aggressive in identifying mismatch signals or resume inconsistencies.

D6 SCORING DIMENSIONS:
technicalCompetency, communicationSkills, leadershipTeamBonding, cultureFit, problemSolving, domainExpertise.

SPEED & DEPTH MANDATE:
- Max 2 sentences per dimension.
- Must provide evidence-based rationales.
- If a skill is "must-have" and missing, trigger a "rejected" or "potential" status immediately.

JOB REQUIREMENTS:
${JSON.stringify(jobRequirements, null, 2)}

CANDIDATE RESUME:
${resumeText}

Return raw valid JSON matching the requested schema. Ensure all fields are populated.`,
    config: {
      temperature: 0,
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
  const prompt = `Conduct targeted professional research for: ${candidateName}. 
  Role: ${role} at ${company}. Context: ${details}
  
  CORE MISSION: Find professional signals (LinkedIn, GitHub, Media, Portfolios).
  SPEED MANDATE: Max 300 words. Focus on high-signal findings and verified links.
  
  Return raw objective data with citations.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
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
