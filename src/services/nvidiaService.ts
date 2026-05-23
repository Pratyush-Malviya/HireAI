/**
 * nvidiaService.ts
 * Frontend fetch wrappers for the NVIDIA NIM API routes.
 * All calls go through the Express backend — the NVIDIA API key is never exposed to the browser.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NvidiaScreeningResult {
  fullName: string;
  email?: string;
  phone?: string;
  currentRole?: string;
  totalExperience?: number;
  oneLineSummary: string;
  compositeScore: number;
  recommendation: {
    status: "perfect" | "strong" | "potential" | "rejected";
    fitHeader: string;
    summary: string;
  };
  strengths: string[];
  weaknesses: string[];
  skillsMatch: {
    score: number;
    confirmed: string[];
    absent: string[];
    inferred: string[];
  };
  experienceFit: { score: number; rationale: string };
  education: { score: number; rationale: string };
  achievements: { score: number; rationale: string };
  culturalRoleFit: { score: number; rationale: string };
  redFlags: string[];
  interviewQuestions: string[];
  provider?: string;
}

export interface NvidiaInterviewMessage {
  role: "user" | "model" | "assistant";
  text?: string;
  content?: string;
}

export interface NvidiaInterviewResult {
  text: string;
  provider?: string;
}

export interface NvidiaSummarizeResult {
  rating: number;
  summary: string;
  keyInsights: string[];
  categoryScores: {
    technical: number;
    communication: number;
    cultural: number;
    experience: number;
    problemSolving: number;
  };
  verdict: "HIKE" | "STRONG_CONTENDER" | "POTENTIAL" | "PASS";
  strengths?: string[];
  developmentAreas?: string[];
  hiringRecommendation?: string;
  nextSteps?: string[];
  provider?: string;
}

// ---------------------------------------------------------------------------
// Resume Screening — POST /api/nvidia/resume-screening
// Uses: deepseek-ai/deepseek-r1
// ---------------------------------------------------------------------------
export async function screenCandidateNvidia(
  resumeText: string,
  jobDescription: string,
  jobRequirements?: Record<string, unknown>
): Promise<NvidiaScreeningResult> {
  const response = await fetch("/api/nvidia/resume-screening", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeText, jobDescription, jobRequirements }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any).error || "NVIDIA resume screening failed.");
  }

  return response.json() as Promise<NvidiaScreeningResult>;
}

// ---------------------------------------------------------------------------
// Interview Simulation — POST /api/nvidia/interview
// Uses: meta/llama-3.3-70b-instruct
// ---------------------------------------------------------------------------
export async function generateInterviewResponseNvidia(
  candidateName: string,
  role: string,
  company: string,
  jd: string,
  resume: string,
  history: NvidiaInterviewMessage[]
): Promise<string> {
  const response = await fetch("/api/nvidia/interview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidateName, role, company, jd, resume, history, stream: false }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any).error || "NVIDIA interview generation failed.");
  }

  const data = await response.json() as NvidiaInterviewResult;
  return data.text ?? "";
}

// ---------------------------------------------------------------------------
// Streaming Interview — POST /api/nvidia/interview (stream: true)
// Uses: meta/llama-3.3-70b-instruct
// Calls `onChunk` for each streamed text delta, returns the full response.
// ---------------------------------------------------------------------------
export async function streamInterviewResponseNvidia(
  candidateName: string,
  role: string,
  company: string,
  jd: string,
  resume: string,
  history: NvidiaInterviewMessage[],
  onChunk: (chunk: string) => void
): Promise<string> {
  const response = await fetch("/api/nvidia/interview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidateName, role, company, jd, resume, history, stream: true }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any).error || "NVIDIA streaming interview failed.");
  }

  if (!response.body) throw new Error("No response body for streaming.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n").filter((line) => line.startsWith("data: "));

    for (const line of lines) {
      const data = line.slice("data: ".length).trim();
      if (data === "[DONE]") break;

      try {
        const parsed = JSON.parse(data) as { text: string };
        if (parsed.text) {
          fullText += parsed.text;
          onChunk(parsed.text);
        }
      } catch {
        // Skip malformed SSE lines
      }
    }
  }

  return fullText;
}

// ---------------------------------------------------------------------------
// Interview Summarization — POST /api/nvidia/summarize
// Uses: nvidia/llama-3.1-nemotron-70b-instruct
// ---------------------------------------------------------------------------
export async function summarizeInterviewNvidia(
  history: NvidiaInterviewMessage[]
): Promise<NvidiaSummarizeResult> {
  const response = await fetch("/api/nvidia/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ history }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any).error || "NVIDIA interview summarization failed.");
  }

  return response.json() as Promise<NvidiaSummarizeResult>;
}
