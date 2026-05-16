import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

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

app.post("/api/ai/chat", async (req, res) => {
  const { candidateName, role, company, jd, resume, history } = req.body;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "AI Key missing" });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash", 
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
  } catch (error) {
    console.error("AI Chat Error:", error);
    res.status(500).json({ error: "AI reasoning failed" });
  }
});

app.post("/api/ai/summarize", async (req, res) => {
  const { history } = req.body;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "AI Key missing" });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-pro",
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
  } catch (error) {
    console.error("AI Summary Error:", error);
    res.status(500).json({ error: "Summarization failed" });
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
