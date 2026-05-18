export async function parseJobDescription(text: string) {
  const response = await fetch("/api/ai/parse-job", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    let errorMessage = "Failed to parse job description";
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch (e) {
      errorMessage = `Server Error (${response.status}): ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }

  try {
    return await response.json();
  } catch (e) {
    throw new Error("Malformed response from server during job parsing");
  }
}

export async function screenCandidate(resumeText: string, jobRequirements: any) {
  const response = await fetch("/api/ai/screen-candidate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeText, jobRequirements }),
  });

  if (!response.ok) {
    let errorMessage = "Failed to screen candidate";
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch (e) {
      errorMessage = `Server Error (${response.status}): ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }

  try {
    return await response.json();
  } catch (e) {
    throw new Error("Malformed response from server during screening");
  }
}

export async function researchCandidate(candidateName: string, role: string, company: string, details: string) {
  const response = await fetch("/api/ai/research-candidate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidateName, role, company, details }),
  });

  if (!response.ok) {
    let errorMessage = "Failed to research candidate";
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch (e) {
      errorMessage = `Server Error (${response.status}): ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }

  try {
    return await response.json();
  } catch (e) {
    throw new Error("Malformed response from server during research");
  }
}
