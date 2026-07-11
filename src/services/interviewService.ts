import { QuestionCategory, CompetencyScores, InterviewEvaluation, QuestionEvaluation } from '../types';

export async function generateInterviewResponse(
  candidateName: string,
  role: string,
  company: string,
  jd: string,
  resume: string,
  history: { role: 'user' | 'model'; text: string }[]
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateName, role, company, jd, resume, history }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'AI generation failed');
    }

    const data = await response.json();
    return data.text || "";
  } finally {
    clearTimeout(timeoutId);
  }
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

function categorizeQuestion(text: string): QuestionCategory {
  // First, check for explicit [CATEGORY: ...] tag from the AI
  const tagMatch = text.match(/\[CATEGORY:\s*(\w+)\]/i);
  if (tagMatch) {
    const tag = tagMatch[1].toLowerCase();
    if (tag === 'technical' || tag === 'behavioural' || tag === 'situational' || tag === 'cultural_fit') {
      return tag;
    }
  }
  // Fallback to heuristic
  const lower = text.toLowerCase();
  if (lower.includes('technical') || lower.includes('code') || lower.includes('system') ||
      lower.includes('architecture') || lower.includes('technology') || lower.includes('tool') ||
      lower.includes('programming') || lower.includes('language') || lower.includes('stack') ||
      lower.includes('algorithm') || lower.includes('database') || lower.includes('api')) {
    return 'technical';
  }
  if (lower.includes('situational') || lower.includes('would you') || lower.includes('hypothetical') ||
      lower.includes('imagine') || lower.includes('what would') || lower.includes('how would')) {
    return 'situational';
  }
  if (lower.includes('culture') || lower.includes('value') || lower.includes('team') ||
      lower.includes('work environment') || lower.includes('collaborate') || lower.includes('mission')) {
    return 'cultural_fit';
  }
  return 'behavioural';
}

// Gemini-powered scoring with heuristic fallback
async function geminiScoreResponse(
  question: string,
  response: string
): Promise<{ overallScore: number; scores: { relevance: number; depth: number; exampleQuality: number; communication: number; problemSolving: number }; notes: string }> {
  try {
    const result = await fetch('/api/ai/evaluate-interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        history: [
          { role: 'model', text: question },
          { role: 'user', text: response }
        ]
      })
    });
    const data = await result.json();
    if (data.evaluations && data.evaluations.length > 0) {
      const ev = data.evaluations[0];
      return {
        overallScore: ev.overallScore || 3,
        scores: ev.scores || { relevance: 3, depth: 3, exampleQuality: 3, communication: 3, problemSolving: 3 },
        notes: ev.notes || 'Evaluated by AI'
      };
    }
  } catch (e) {
    // fall through to heuristic
  }
  return heuristicScoreResponse(question, response);
}

function heuristicScoreResponse(question: string, response: string): { overallScore: number; scores: { relevance: number; depth: number; exampleQuality: number; communication: number; problemSolving: number }; notes: string } {
  const wordCount = response.split(/\s+/).length;
  const sentences = response.split(/[.!?]+/).filter(Boolean).length;
  const hasStructure = /(first|second|third|finally|in conclusion|specifically|for example|for instance|because|therefore)/i.test(response);
  const hasQuantified = /\d+/.test(response);

  let overallScore = 3;
  const notes: string[] = [];

  if (wordCount < 10) {
    overallScore = 1;
    notes.push('Response too brief, lacks substance');
  } else if (wordCount < 25) {
    overallScore = 2;
    notes.push('Response could use more detail');
  } else if (wordCount >= 30 && hasStructure) {
    overallScore = 4;
    notes.push('Well-structured response');
    if (hasQuantified) {
      overallScore = 5;
      notes.push('Strong evidence with specific examples');
    }
  } else if (wordCount >= 50 && hasStructure && hasQuantified) {
    overallScore = 5;
    notes.push('Excellent detailed response with concrete examples');
  }

  if (sentences < 2) notes.push('Limited elaboration');
  if (!hasStructure) notes.push('Could improve response structure (e.g., STAR format)');

  return {
    overallScore,
    scores: { relevance: overallScore, depth: overallScore, exampleQuality: overallScore, communication: overallScore, problemSolving: overallScore },
    notes: notes.join('; ') || 'Adequate response'
  };
}

export async function localEvaluateInterview(
  history: { role: 'user' | 'model'; text: string }[],
  candidateName: string,
  jobTitle: string,
  resumeSkills?: string[],
  jdSkills?: string[]
): Promise<InterviewEvaluation> {
  // Extract question-answer pairs (model messages = questions, user messages = responses)
  const pairs: { question: string; response: string }[] = [];
  for (let i = 0; i < history.length - 1; i++) {
    if (history[i].role === 'model' && history[i + 1].role === 'user') {
      pairs.push({ question: history[i].text, response: history[i + 1].text });
    }
  }

  // Fetch the entire evaluation in a single batch request
  let evaluationsList: any[] = [];
  try {
    const result = await fetch('/api/ai/evaluate-interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history })
    });
    if (result.ok) {
      const data = await result.json();
      evaluationsList = data.evaluations || [];
    }
  } catch (e) {
    console.error("Failed to run batch evaluation:", e);
  }

  // Map Q&A pairs, matching the batch response or falling back to heuristics
  const questionEvals: QuestionEvaluation[] = pairs.map((p, idx) => {
    const category = categorizeQuestion(p.question);
    
    // Find matching evaluation from batch result
    const ev = evaluationsList.find((e: any) => e.questionIndex === idx);
    let score = 3;
    let notes = 'Evaluated by AI';
    
    if (ev) {
      score = ev.overallScore || 3;
      notes = ev.notes || 'Evaluated by AI';
    } else {
      // Heuristic fallback if batch match failed
      const heur = heuristicScoreResponse(p.question, p.response);
      score = heur.overallScore;
      notes = heur.notes;
    }
    
    return { question: p.question, response: p.response, category, score, notes };
  });

  // Compute competency scores
  const byCategory: Record<QuestionCategory, number[]> = {
    technical: [], behavioural: [], situational: [], cultural_fit: []
  };
  questionEvals.forEach(q => {
    byCategory[q.category]?.push(q.score);
  });

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const competencies: CompetencyScores = {
    technicalSkills: Math.round((avg(byCategory.technical) / 5) * 100),
    communication: Math.round(avg(questionEvals.map(q => q.score)) / 5 * 100 * 0.9),
    problemSolving: Math.round((avg([...byCategory.situational, ...byCategory.technical]) / 5) * 100),
    leadershipTeamwork: Math.round((avg(byCategory.behavioural) / 5) * 100),
    culturalFit: Math.round((avg(byCategory.cultural_fit) / 5) * 100)
  };

  const overallScore = Math.round(
    (competencies.technicalSkills + competencies.communication +
     competencies.problemSolving + competencies.leadershipTeamwork +
     competencies.culturalFit) / 5
  );

  // Determine recommendation & confidence
  const hasRedFlags = questionEvals.some(q => q.score <= 1);
  const avgScore = avg(questionEvals.map(q => q.score));
  let recommendation: 'HIRE' | 'NO_HIRE' | 'FURTHER_REVIEW';
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  let escalationReason: string | undefined;

  if (hasRedFlags) {
    recommendation = 'NO_HIRE';
    confidence = 'HIGH';
    escalationReason = 'Very weak responses detected in one or more areas';
  } else if (overallScore >= 75 && questionEvals.length >= 3) {
    recommendation = 'HIRE';
    confidence = overallScore >= 85 ? 'HIGH' : 'MEDIUM';
  } else if (overallScore >= 50) {
    if (avgScore >= 2.5 && avgScore <= 3.5) {
      recommendation = 'FURTHER_REVIEW';
      confidence = 'MEDIUM';
      escalationReason = `Ambiguous score range (${avgScore.toFixed(1)}/5). Human review recommended.`;
    } else {
      recommendation = 'FURTHER_REVIEW';
      confidence = 'LOW';
      escalationReason = `Overall score (${overallScore}/100) needs human evaluation.`;
    }
  } else {
    recommendation = 'NO_HIRE';
    confidence = 'MEDIUM';
  }

  // Skill match
  const allJdSkills = jdSkills || [];
  const allResumeSkills = resumeSkills || [];
  const skillMatch = allJdSkills.map(skill => {
    const found = allResumeSkills.find(s => s.toLowerCase().includes(skill.toLowerCase()));
    return {
      skill,
      required: true,
      proficiency: found ? ('high' as const) : ('missing' as const)
    };
  });

  // Strengths & weaknesses
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  questionEvals.forEach(q => {
    if (q.score >= 4) strengths.push(`Strong ${q.category} response: demonstrated depth in "${q.question.substring(0, 60)}..."`);
    if (q.score <= 2) weaknesses.push(`Weak ${q.category} response: "${q.question.substring(0, 60)}..." - ${q.notes}`);
  });

  if (competencies.technicalSkills >= 75) strengths.push('Strong technical competency');
  if (competencies.communication >= 75) strengths.push('Excellent communication skills');
  if (competencies.problemSolving >= 75) strengths.push('Strong problem-solving ability');
  if (competencies.technicalSkills < 40) weaknesses.push('Technical skills need verification');
  if (competencies.communication < 40) weaknesses.push('Communication skills need improvement');

  // Follow-up questions for next round
  const followUpQuestions: string[] = [];
  if (competencies.technicalSkills < 60) {
    followUpQuestions.push('Deep-dive into specific technical skills and hands-on experience');
  }
  if (competencies.leadershipTeamwork < 50) {
    followUpQuestions.push('Ask about team leadership experience and conflict resolution');
  }
  if (competencies.culturalFit < 50) {
    followUpQuestions.push('Explore cultural alignment and work style preferences');
  }
  if (!strengths.length) {
    followUpQuestions.push('Clarify candidate\'s strongest areas and seek concrete examples');
  }
  if (followUpQuestions.length === 0) {
    followUpQuestions.push('Verify technical depth with a practical problem-solving exercise');
    followUpQuestions.push('Discuss career growth expectations and team fit');
  }

  // Pre-interview fit score (calculated from resume vs JD)
  const preInterviewFitScore = allJdSkills.length > 0
    ? Math.round((allJdSkills.filter(s => allResumeSkills.some(rs => rs.toLowerCase().includes(s.toLowerCase()))).length / allJdSkills.length) * 100)
    : 50;

  const summary = questionEvals.length > 0
    ? `Interviewed ${candidateName} for ${jobTitle}. Overall score: ${overallScore}/100. Recommendation: ${recommendation}. Confidence: ${confidence}. ${questionEvals.length} questions asked across ${[...new Set(questionEvals.map(q => q.category))].join(', ')} categories.`
    : 'Interview evaluation incomplete - no question-response pairs found.';

  return {
    preInterviewFitScore,
    overallScore,
    recommendation,
    confidence,
    questions: questionEvals,
    competencies,
    strengths: strengths.slice(0, 5),
    weaknesses: weaknesses.slice(0, 5),
    skillMatch,
    followUpQuestions,
    escalationReason,
    summary
  };
}
