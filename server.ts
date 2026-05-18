import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

const getOAuthClient = () => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL}/auth/callback`
  );
};

// Auth Routes
app.get("/api/auth/google/url", (req, res) => {
  const oauth2Client = getOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile"
    ],
    prompt: "consent"
  });
  res.json({ url });
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  const oauth2Client = getOAuthClient();
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    
    // Store tokens in cookie (SameSite=none; Secure=true for iframe)
    res.cookie("google_tokens", JSON.stringify(tokens), {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.send(`
      <html>
        <head><title>Authentication Successful</title></head>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; border-radius: 12px; display: inline-block;">
            <h2 style="color: #166534; margin-top: 0;">Connected Successfully!</h2>
            <p style="color: #15803d;">You can now close this window.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("OAuth Error:", error);
    res.status(500).send("Authentication failed: " + (error instanceof Error ? error.message : "Unknown error"));
  }
});

// Calendar Routes
app.get("/api/calendar/status", (req, res) => {
  const tokens = req.cookies.google_tokens;
  res.json({ 
    connected: !!tokens,
    config: {
      clientId: !!process.env.GOOGLE_CLIENT_ID,
      clientSecret: !!process.env.GOOGLE_CLIENT_SECRET
    }
  });
});

app.get("/api/calendar/free-busy", async (req, res) => {
  const tokens = req.cookies.google_tokens;
  if (!tokens) return res.status(401).json({ error: "Not authenticated" });

  try {
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials(JSON.parse(tokens));
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const now = new Date();
    const end = new Date();
    end.setDate(now.getDate() + 14); // Look ahead 2 weeks

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: now.toISOString(),
        timeMax: end.toISOString(),
        items: [{ id: "primary" }]
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error("FreeBusy Error:", error);
    res.status(500).json({ error: "Failed to fetch availability" });
  }
});

app.post("/api/calendar/schedule", async (req, res) => {
  const tokensRaw = req.cookies.google_tokens;
  const { candidateEmail, startTime, endTime, summary, description } = req.body;

  if (!tokensRaw) return res.status(401).json({ error: "Not authenticated" });

  try {
    const tokens = JSON.parse(tokensRaw);
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const event = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: 1,
      requestBody: {
        summary,
        description,
        start: { dateTime: startTime },
        end: { dateTime: endTime },
        attendees: [{ email: candidateEmail }],
        conferenceData: {
          createRequest: {
            requestId: `interview-${Date.now()}`,
            conferenceSolutionKey: { type: "hangoutsMeet" }
          }
        }
      }
    });

    res.json(event.data);
  } catch (error) {
    console.error("Schedule Error:", error);
    res.status(500).json({ error: "Failed to schedule interview: " + (error instanceof Error ? error.message : "Unknown error") });
  }
});

// AI Proxy Routes
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

/**
 * Enhanced retry mechanism with exponential backoff and jitter
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 6, initialDelay = 5000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isRetryableError = 
        error?.status === "RESOURCE_EXHAUSTED" || 
        error?.code === 429 || 
        error?.status === "UNAVAILABLE" ||
        error?.code === 503 ||
        error?.message?.includes("quota") ||
        error?.message?.includes("429") ||
        error?.message?.includes("503") ||
        error?.message?.includes("demand");

      if (!isRetryableError || i === maxRetries - 1) throw error;

      // Extract specific retry delay if provided in error details (Gemini API format)
      let delayOverride = 0;
      if (error?.details) {
        const retryInfo = error.details.find((d: any) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
        if (retryInfo?.retryDelay) {
          // Format is usually "5s"
          delayOverride = parseFloat(retryInfo.retryDelay) * 1000;
        }
      }

      // Exponential backoff: initialDelay * 2^i + jitter
      const exponentialDelay = initialDelay * Math.pow(2, i) + Math.random() * 2000;
      const delay = Math.max(delayOverride, exponentialDelay);
      
      console.warn(`[AI Retry] ${error?.status || 'Error'} hit. Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
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
            communicationSkills: DIMENSION_SCHEMA,
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

app.post("/api/ai/parse-job", async (req, res) => {
  const { text } = req.body;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "AI Key missing" });

  try {
    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a Senior Technical Analyst. 
      [TEMPORAL CONTEXT: The current date is ${new Date().toLocaleDateString()}. The current year is ${new Date().getFullYear()}. Any dates in ${new Date().getFullYear()} or earlier are VALID past or present dates.]
      Deconstruct the following job description into an atomic set of requirements for an AI screening agent.
      
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
    }));

    const rawText = response.text || "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[0] : rawText.trim();
    res.json(JSON.parse(jsonString));
  } catch (error) {
    console.error("Parse Job Error:", error);
    res.status(500).json({ error: "Job parsing failed: " + (error as any)?.message });
  }
});

app.post("/api/ai/screen-candidate", async (req, res) => {
  const { resumeText, jobRequirements } = req.body;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "AI Key missing" });

  try {
    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a Principal Talent Solutions Architect and Adversarial Talent Auditor. 
      [TEMPORAL CONTEXT: The current date is ${new Date().toLocaleDateString()}. The current year is ${new Date().getFullYear()}. Any dates in the year ${new Date().getFullYear()} or earlier are VALID past or present dates. DO NOT flag ${new Date().getFullYear()} as in the future or an integrity issue.]
      Your mission: Perform a forensic, high-fidelity screening of the candidate resume against specific Job Requirements.
      
      SCORING PROTOCOL (D6+ v2.0):
      Analyze and score the candidate on 6 core dimensions (Each 0-100):
      1. skillsMatch (D1): Keyword overlap + semantic similarity. Must-have match = full score. Nice-to-have = partial.
      2. experienceFit (D2): Years of relevant exp, title proximity (IC vs Mgr), industry alignment.
      3. education (D3): Degree level match, field relevance, institution tier.
      4. achievements (D4): Quantified outcomes (%, $, numbers), awards, scale signals.
      5. culturalRoleFit (D5): Tenure patterns (job-hopping), growth trajectory consistency.
      6. communicationSkills (D6): Clarity of thought, professional articulation, and narrative quality.

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
    }), 5); // Increased retries for heavy screening target

    const rawText = response.text || "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[0] : rawText.trim();
    res.json(JSON.parse(jsonString));
  } catch (error) {
    console.error("Screen Candidate Error:", error);
    res.status(500).json({ error: "Candidate screening failed: " + (error as any)?.message });
  }
});

app.post("/api/ai/research-candidate", async (req, res) => {
  const { candidateName, role, company, details } = req.body;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "AI Key missing" });

  try {
    const prompt = `You are an elite Professional Intelligence Agent specializing in executive-level background verification and deep-signal talent research.
    [TEMPORAL CONTEXT: The current date is ${new Date().toISOString()}. The current year is ${new Date().getFullYear()}. Any dates in ${new Date().getFullYear()} or earlier are VALID past or present dates.]
    
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

    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0,
      },
    }), 6, 8000); // Higher retries and longer delay for search-based research as it's slower and prone to spikes

    const text = response.text || "";
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources = chunks ? chunks
      .filter((c: any) => c.web)
      .map((c: any) => ({
        title: c.web.title,
        uri: c.web.uri
      })) : [];

    res.json({
      summary: text,
      sources,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Research Candidate Error:", error);
    res.status(500).json({ error: "Candidate research failed: " + (error as any)?.message });
  }
});

app.post("/api/ai/chat", async (req, res) => {
  const { candidateName, role, company, jd, resume, history } = req.body;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "AI Key missing" });

  try {
    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: [
        { 
          role: "user", 
          parts: [{ text: `SYSTEM INSTRUCTIONS:
[TEMPORAL CONTEXT: The current date is ${new Date().toLocaleDateString()}. The current year is ${new Date().getFullYear()}. Any dates in the year ${new Date().getFullYear()} or earlier are VALID past or present dates.]
You are "HireAI Assistant", an intelligent AI Recruiter for ${company}. 
You are conducting a 1st-level professional screening interview with ${candidateName} for the position of ${role}.
JOB DESCRIPTION: ${jd}
CANDIDATE RESUME: ${resume}
YOUR PROTOCOL:
1. GREETING & CONSENT (MANDATORY START): greet polite and ask if ready. ONLY proceed after consent.
2. TECHNICAL SCREENING (ONLY AFTER CONSENT): Evaluate competence, test must-have skills, explore discrepancies.
STYLE: Ask ONE question at a time. Follow up for specifics. 5-8 questions.
END with: "Thank you for your time, ${candidateName}. We have gathered sufficient initial information. I will now process your interview for our human recruiting team."` }] 
        },
        { role: "model", parts: [{ text: "Understood. I am HireAI Assistant. I will follow the protocol strictly." }] },
        ...history.map((h: any) => ({ role: h.role, parts: [{ text: h.text }] }))
      ],
    }));

    res.json({ text: response.text || "" });
  } catch (error) {
    console.error("AI Chat Error:", error);
    res.status(500).json({ error: "AI reasoning failed: " + (error as any)?.message });
  }
});

app.post("/api/ai/summarize", async (req, res) => {
  const { history } = req.body;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "AI Key missing" });

  try {
    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an elite principal technical recruiter with 20 years of experience. 
      [TEMPORAL CONTEXT: The current date is ${new Date().toLocaleDateString()}. The current year is ${new Date().getFullYear()}. Any dates in the year ${new Date().getFullYear()} or earlier are VALID past or present dates.]
      Analyze the following interview transcript and provide a highly detailed, objective evaluation.
      
      EVALUATION DEPTH MANDATE:
      - Technical Proficiency: Probe for specific mentions of architecture, trade-offs, and edge cases.
      - Nuance Capture: Detect hesitation, confidence level, and "learned vs practiced" knowledge.
      - Integrity Check: Identify if responses seem generic or contextually rich.
 
      TRANSCRIPT:
      ${JSON.stringify(history)}
 
      RESPONSE SCHEMA:
      {
        "rating": number (Weighted average of the categories below 0-100),
        "summary": "Sophisticated executive summary highlighting specific behavioral or technical evidence",
        "keyInsights": ["High-signal observation 1", "Nuanced risk 2", "Competitive advantage 3"],
        "categoryScores": {
          "technical": number (0-100),
          "communication": number (0-100),
          "cultural": number (0-100),
          "experience": number (0-100),
          "problemSolving": number (0-100)
        },
        "verdict": "string (Strict: 'HIKE', 'STRONG_CONTENDER', 'POTENTIAL', 'PASS')"
      }
      
      Return ONLY valid JSON.`,
      config: {
        responseMimeType: "application/json",
      }
    }));

    const result = JSON.parse(response.text || "{}");
    res.json(result);
  } catch (error) {
    console.error("AI Summary Error:", error);
    res.status(500).json({ error: "Summarization failed: " + (error as any)?.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, the bundled server is at dist/server.cjs
    // We check multiple possible locations for the static assets
    const possiblePaths = [
      path.resolve(__dirname),
      path.join(process.cwd(), "dist"),
      path.join(__dirname, "..", "dist")
    ];
    
    let distPath = possiblePaths.find(p => fs.existsSync(path.join(p, "index.html"))) || possiblePaths[0];
    
    console.log(`[Production] Environment: ${process.env.NODE_ENV}`);
    console.log(`[Production] Computed dist path: ${distPath}`);
    
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        console.error(`[Production] CRITICAL: index.html not found! Checked: ${indexPath}`);
        res.status(404).send("Application shell not found. Please ensure the build completed successfully and the dist folder exists.");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
