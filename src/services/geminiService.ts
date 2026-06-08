export async function parseJobDescription(text: string) {
  const response = await fetch("/api/ai/parse-job", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to parse job description");
  }

  return response.json();
}

export async function screenCandidate(resumeText: string, jobRequirements: any) {
  const response = await fetch("/api/ai/screen-candidate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeText, jobRequirements }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to screen candidate");
  }

  return response.json();
}

export async function researchCandidate(
  candidateName: string,
  role: string,
  company: string,
  details: string,
  resumeText?: string,
  skills?: string,
  jobTitle?: string
) {
  const response = await fetch("/api/ai/research-candidate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidateName, role, company, details, resumeText, skills, jobTitle }),
  });

  if (!response.ok) {
    let errorMsg = "Failed to research candidate";
    try {
      const errorData = await response.json();
      errorMsg = errorData.error || errorData.message || `Server error (${response.status})`;
    } catch {
      errorMsg = `Server error (${response.status})`;
    }
    throw new Error(errorMsg);
  }

  return response.json();
}
