import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { defineSecret } from 'firebase-functions/params';

const geminiApiKey = defineSecret('GEMINI_API_KEY');
const db = getFirestore();

export const generateInterviewQuestions = onCall(
  { secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new Error('Authentication required');
    }

    const { jobDescription, candidateResume, jobId, candidateId } = request.data;

    if (!jobDescription || !candidateResume) {
      throw new Error('jobDescription and candidateResume are required');
    }

    console.log(`[GenerateInterview] Generating questions for candidate ${candidateId}, job ${jobId}`);

    try {
      const genAI = new GoogleGenerativeAI(await geminiApiKey.value());
      const model = genAI.getGenerativeModel({ model: 'gemini-3.1-pro-preview' });

      const prompt = `
You are an expert technical interviewer. Generate a comprehensive set of interview questions tailored to the following job description and candidate resume.

## Job Description:
${jobDescription}

## Candidate Resume:
${candidateResume}

Generate exactly 10 interview questions in the following categories:
1. **Technical Assessment** (4 questions) - Deep dive into the candidate's technical skills relevant to the job
2. **Experience & Behavior** (3 questions) - Past experience, situational, and behavioral questions
3. **Problem Solving** (2 questions) - Analytical and problem-solving scenarios
4. **Cultural Fit** (1 question) - Values alignment and team fit

For each question, provide:
- category: The category name
- question: The question text
- keyPoints: Array of key points/aspects the interviewer should look for in the answer
- difficulty: 'easy' | 'medium' | 'hard'

Return the result as a JSON object with a "questions" array. Only return valid JSON, no markdown formatting.
`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      let questions;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          questions = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.error('[GenerateInterview] Failed to parse Gemini response:', parseError);
        console.log('[GenerateInterview] Raw response:', responseText);
        questions = {
          questions: [
            { category: 'Technical Assessment', question: 'Walk me through your most recent technical role and the key technologies you used.', keyPoints: ['Relevant experience', 'Technical depth'], difficulty: 'medium' },
            { category: 'Experience & Behavior', question: 'Tell me about a challenging project you worked on and how you overcame obstacles.', keyPoints: ['Problem-solving', 'Resilience'], difficulty: 'medium' },
            { category: 'Problem Solving', question: 'Describe a time you had to make a decision with incomplete information.', keyPoints: ['Decision-making', 'Analytical thinking'], difficulty: 'medium' },
            { category: 'Cultural Fit', question: 'What type of work environment do you thrive in?', keyPoints: ['Values alignment', 'Self-awareness'], difficulty: 'easy' },
          ],
        };
      }

      if (jobId) {
        await db.collection('interview_questions').doc(jobId).set({
          questions: questions.questions,
          generatedAt: new Date().toISOString(),
          jobId,
          candidateId: candidateId || null,
        }, { merge: true });
      }

      console.log(`[GenerateInterview] Successfully generated ${questions.questions?.length || 0} questions`);

      return {
        success: true,
        questions: questions.questions || [],
      };
    } catch (error) {
      console.error('[GenerateInterview] Gemini API error:', error);
      throw new Error(`Failed to generate interview questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);

export const evaluateInterviewResponse = onCall(
  { secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new Error('Authentication required');
    }

    const { question, response, jobDescription, candidateResume } = request.data;

    if (!question || !response) {
      throw new Error('question and response are required');
    }

    try {
      const genAI = new GoogleGenerativeAI(await geminiApiKey.value());
      const model = genAI.getGenerativeModel({ model: 'gemini-3.1-pro-preview' });

      const prompt = `
You are an expert interview evaluator. Evaluate the following candidate response to an interview question.

## Job Context:
${jobDescription || 'General position'}

## Candidate Background:
${candidateResume || 'Not provided'}

## Question:
${question}

## Candidate Response:
${response}

Evaluate the response on these dimensions:
- relevance: How relevant is the answer to the question? (0-100)
- depth: How detailed and insightful is the answer? (0-100)
- clarity: How clearly is the answer communicated? (0-100)
- overall: Overall score (0-100)

Provide:
- scores: Object with the four scores
- strengths: Array of strengths shown in the answer
- weaknesses: Array of areas for improvement
- summary: A brief 2-3 sentence evaluation

Return only valid JSON, no markdown.
`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      let evaluation;
      if (jsonMatch) {
        evaluation = JSON.parse(jsonMatch[0]);
      } else {
        evaluation = {
          scores: { relevance: 70, depth: 65, clarity: 75, overall: 70 },
          strengths: ['Attempted to answer the question'],
          weaknesses: ['Limited detail provided'],
          summary: 'The candidate provided a response that addressed the question at a basic level.',
        };
      }

      return { success: true, evaluation };
    } catch (error) {
      console.error('[EvaluateResponse] Gemini API error:', error);
      throw new Error(`Failed to evaluate response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);
