export async function generateInterviewResponse(
  candidateName: string,
  role: string,
  company: string,
  jd: string,
  resume: string,
  history: { role: 'user' | 'model'; text: string }[]
) {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidateName, role, company, jd, resume, history })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'AI generation failed');
  }

  const data = await response.json();
  return data.text || "";
}

export async function summarizeInterview(history: { role: 'user' | 'model'; text: string }[]) {
  const response = await fetch('/api/ai/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ history })
  });

  if (!response.ok) {
    return {
      rating: 50,
      summary: "Evaluation in progress. API proxy failed.",
      keyInsights: ["Manual review recommended."]
    };
  }

  return await response.json();
}
