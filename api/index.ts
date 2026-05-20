import express from "express";
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
const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function generateContentWithRetry(params: any, maxRetries = 3, initialDelay = 1000) {
  const modelsToTry = [
    params.model,
    "gemini-flash-latest",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite"
  ].filter((m, i, arr) => m && arr.indexOf(m) === i); // Deduplicate & filter undefined

  let lastError: any;

  for (const currentModel of modelsToTry) {
    const modelParams = { ...params, model: currentModel };
    
    // Automatically set thinking level to "MINIMAL" on gemini-3.1-flash-lite and gemini-3.5-flash to skip reasoning delay
    if (currentModel === "gemini-3.1-flash-lite" || currentModel === "gemini-3.5-flash") {
      modelParams.config = {
        ...modelParams.config,
        thinkingConfig: {
          thinkingLevel: "MINIMAL",
          ...modelParams.config?.thinkingConfig
        }
      };
    }

    const hasMoreModels = modelsToTry.indexOf(currentModel) < modelsToTry.length - 1;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Sending API request using model: ${currentModel} (attempt ${attempt + 1}/${maxRetries + 1})`);
        return await ai.models.generateContent(modelParams);
      } catch (error: any) {
        lastError = error;
        
        // Handle the SDK's specialized error structure
        const errorText = error.message || String(error);
        let errorData: any = {};
        try {
          // Many errors come as JSON strings in the message property
          if (errorText.includes('{')) {
            const jsonStart = errorText.indexOf('{');
            const jsonEnd = errorText.lastIndexOf('}') + 1;
            errorData = JSON.parse(errorText.substring(jsonStart, jsonEnd));
          }
        } catch (e) {
          // Fallback to simple string check
        }

        const status = error.status || error.code || errorData?.error?.code || errorData?.status;
        const message = errorData?.error?.message || errorText;
        const isRateLimit = status === 429 || status === 'RESOURCE_EXHAUSTED' || message?.includes('quota');
        const isUnavailable = status === 503 || status === 'UNAVAILABLE' || message?.includes('demand') || message?.includes('temporary') || message?.includes('overloaded');
        
        if (isRateLimit || isUnavailable) {
          if (hasMoreModels) {
            // Swap to next model immediately to avoid waiting-delay loops
            console.warn(`Model ${currentModel} rate-limited or unavailable. Swapping immediately to next model.`);
            break; // Break current retry loop to go to next model immediately
          }

          // If this is the final model and we have retries left, do short delay with jitter
          if (attempt < maxRetries) {
            if (message?.includes('PerDay') && !message?.includes('retry in')) {
              console.log('Daily quota exceeded. Swapping/stopping.');
              throw error;
            } else {
              let delay = initialDelay * Math.pow(2, attempt); // 1s, 2s, 4s
              
              const retryMatch = message?.match(/retry in ([\d.]+)s/);
              if (retryMatch) {
                const waitTime = parseFloat(retryMatch[1]);
                delay = Math.max(delay, (waitTime + 0.5) * 1000); // minimal buffer
              }
              
              const jitter = Math.random() * 500;
              delay = Math.min(delay + jitter, 8000); // capped lower to prevent long delays

              console.log(`Transient limit on final model ${currentModel}. Retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries + 1})...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          }
        }
        
        // If the specified model isn't supported, not found, or bad request, swap immediately
        if (hasMoreModels && (status === 404 || status === 400 || errorText.includes('not found') || errorText.includes('does not exist') || errorText.includes('not supported') || errorText.includes('invalid'))) {
          console.warn(`Model ${currentModel} returned error: ${errorText} (Status: ${status}). Falling back immediately.`);
          break; // Try next model
        }

        throw error;
      }
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
      description: "Role category. Must be one of: 'Technical / Engineering', 'HR / People Ops', 'Sales / BD', 'Leadership / C-Suite', 'Operations / Generalist'"
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
    confidence: { type: Type.STRING, description: "Confidence level. Expected: 'HIGH', 'MED', or 'LOW'" },
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
            status: { type: Type.STRING, description: "Match recommendation status. Expected: 'perfect', 'strong', 'potential', 'rejected'" },
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
                      severity: { type: Type.STRING, description: "Severity of flag. Expected: 'low', 'medium', or 'high'" },
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
    const response = await generateContentWithRetry({
      model: "gemini-3.5-flash",
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

    const rawText = response.text || "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[0] : rawText.trim();
    const result = JSON.parse(jsonString);

    if (result && typeof result.role_type === 'string') {
      const rtList = ["Technical / Engineering", "HR / People Ops", "Sales / BD", "Leadership / C-Suite", "Operations / Generalist"];
      const matched = rtList.find(r => r.toLowerCase().replace(/[^a-z]/g, '') === result.role_type.toLowerCase().replace(/[^a-z]/g, ''));
      if (matched) {
        result.role_type = matched;
      } else {
        result.role_type = "Operations / Generalist";
      }
    }

    res.json(result);
  } catch (error: any) {
    console.error("Parse Job Error:", error);
    const isRateLimit = error.status === 429 || error.code === 429 || error.message?.includes('429') || error.message?.includes('quota');
    const message = isRateLimit ? "AI Rate limit reached. Job analysis is queued for retry or was suspended." : "Job parsing failed";
    res.status(isRateLimit ? 429 : 500).json({ error: message });
  }
});

app.post("/api/ai/screen-candidate", async (req, res) => {
  const { resumeText, jobRequirements } = req.body;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "AI Key missing" });

  try {
    const response = await generateContentWithRetry({
      model: "gemini-3.5-flash",
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

    const rawText = response.text || "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[0] : rawText.trim();
    const result = JSON.parse(jsonString);

    // Normalize enums safely
    if (result.scorecard) {
      if (result.scorecard.recommendation && typeof result.scorecard.recommendation.status === 'string') {
        const val = result.scorecard.recommendation.status.toLowerCase();
        if (["perfect", "strong", "potential", "rejected"].includes(val)) {
          result.scorecard.recommendation.status = val;
        } else if (val.includes("reject")) {
          result.scorecard.recommendation.status = "rejected";
        } else if (val.includes("perfect")) {
          result.scorecard.recommendation.status = "perfect";
        } else if (val.includes("strong")) {
          result.scorecard.recommendation.status = "strong";
        } else {
          result.scorecard.recommendation.status = "potential";
        }
      }

      if (result.scorecard.dimensions) {
        const dims = result.scorecard.dimensions;
        for (const dimName of ['skillsMatch', 'experienceFit', 'education', 'achievements', 'culturalRoleFit']) {
          if (dims[dimName]) {
            if (typeof dims[dimName].confidence === 'string') {
              const val = dims[dimName].confidence.toUpperCase();
              if (["HIGH", "MED", "LOW"].includes(val)) {
                dims[dimName].confidence = val;
              } else if (val.includes("HI")) {
                dims[dimName].confidence = "HIGH";
              } else if (val.includes("LO")) {
                dims[dimName].confidence = "LOW";
              } else {
                dims[dimName].confidence = "MED";
              }
            } else {
              dims[dimName].confidence = "MED";
            }
          }
        }

        if (dims.redFlags && Array.isArray(dims.redFlags.flags)) {
          dims.redFlags.flags.forEach((flag: any) => {
            if (flag && typeof flag.severity === 'string') {
              const val = flag.severity.toLowerCase();
              if (["low", "medium", "high"].includes(val)) {
                flag.severity = val;
              } else if (val.includes("hi")) {
                flag.severity = "high";
              } else if (val.includes("lo")) {
                flag.severity = "low";
              } else {
                flag.severity = "medium";
              }
            }
          });
        }
      }
    }

    res.json(result);
  } catch (error: any) {
    console.error("Screen Candidate Error:", error);
    const errorText = error ? (error.message || String(error)) : "Unknown error";
    const status = error?.status || error?.code;
    const isRateLimit = status === 429 || (typeof errorText === 'string' && (errorText.includes('429') || errorText.includes('quota')));
    const message = isRateLimit ? "AI Model limit reached. Candidate evaluation paused." : "Candidate screening failed";
    res.status(isRateLimit ? 429 : 500).json({ 
      error: message, 
      details: errorText,
      code: status
    });
  }
});

app.post("/api/ai/research-candidate", async (req, res) => {
  const { candidateName, role, company, details } = req.body;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "AI Key missing" });

  try {
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

    const response = await generateContentWithRetry({
      model: "gemini-3.5-flash",
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

    res.json({
      summary: text,
      sources,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("Research Candidate Error:", error);
    const isRateLimit = error.status === 429 || error.code === 429 || error.message?.includes('429') || error.message?.includes('quota');
    const message = isRateLimit ? "AI Search limit reached. Background research paused." : "Candidate research failed";
    res.status(isRateLimit ? 429 : 500).json({ error: message });
  }
});

app.post("/api/ai/chat", async (req, res) => {
  const { candidateName, role, company, jd, resume, history } = req.body;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "AI Key missing" });

  try {
    const response = await generateContentWithRetry({
      model: "gemini-3.5-flash", 
      contents: [
        { 
          role: "user", 
          parts: [{ text: `SYSTEM INSTRUCTIONS:
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
    });

    res.json({ text: response.text || "" });
  } catch (error: any) {
    console.error("AI Chat Error:", error);
    const isRateLimit = error.status === 429 || error.code === 429 || error.message?.includes('429') || error.message?.includes('quota');
    const message = isRateLimit ? "AI Chat limit reached. Please wait a moment." : "AI reasoning failed";
    res.status(isRateLimit ? 429 : 500).json({ error: message });
  }
});

app.post("/api/ai/summarize", async (req, res) => {
  const { history } = req.body;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "AI Key missing" });

  try {
    const response = await generateContentWithRetry({
      model: "gemini-3.5-flash",
      contents: `You are an elite principal technical recruiter with 20 years of experience. Analyze the following interview transcript and provide a highly detailed, objective evaluation.
      
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
    });

    const result = JSON.parse(response.text || "{}");
    res.json(result);
  } catch (error: any) {
    console.error("AI Summary Error:", error);
    const isRateLimit = error.status === 429 || error.code === 429 || error.message?.includes('429') || error.message?.includes('quota');
    const message = isRateLimit ? "AI Summarization limit reached." : "Summarization failed";
    res.status(isRateLimit ? 429 : 500).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
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

if (!process.env.VERCEL) {
  startServer();
}

export default app;
