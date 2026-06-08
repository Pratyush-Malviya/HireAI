# SARVAX HR Agent — AI Interviewer (Deep Dive)

> **Product:** SARVAX | **Agent:** HR Interviewer | **Status:** LIVE (Production) | **Version:** 1.1 | **Date:** 2026-03-17

---

## Overview

The HR Agent is the first fully deployed SARVAX agent. It conducts automated interviews for any role, evaluates candidates against structured criteria, and produces comprehensive hiring reports — replacing the most time-consuming step in the hiring pipeline.

**One-line:** "An AI agent that interviews candidates, evaluates their responses, and delivers a hire/no-hire recommendation — in 15 minutes."

---

## The Problem It Solves

HR teams face a structural bottleneck: **first-round screening interviews.**

| The Problem | The Numbers |
|------------|------------|
| Manual screening interviews take 30–45 minutes each | A team hiring 30 roles receives 4,500+ applications/quarter |
| Interviewers are inconsistent — quality varies by fatigue and bias | 40% of interview evaluations are influenced by unconscious bias |
| Top candidates wait 5–7 days for first contact | 60% of top candidates drop off if response time exceeds 5 days |
| HR recruiters spend 50%+ of time on screening, not strategic work | At ₹500/hour, manual screening costs ₹11.7 lakh+ annually |

The HR Agent eliminates this bottleneck entirely.

---

## How It Works

### Input

| Input | Format | Required |
|-------|--------|----------|
| Candidate Resume | PDF, DOCX | Yes |
| Job Description | Text, PDF | Yes |
| Target Role | Text (role title + level) | Yes |
| Evaluation Criteria | Custom framework (optional) | No — defaults to role-standard |

### Process Flow

```
TRIGGER:    New candidate application received (or manual trigger by HR)
            ↓
INPUT:      Resume (PDF/DOCX) + Job Description + Target Role/Level
            ↓
STEP 1:     PARSE RESUME
            → Extract: skills, experience, education, projects, certifications
            → Identify: gaps in employment, skill mismatches, over/underqualification
            → Create: structured candidate profile
            ↓
STEP 2:     ANALYSE JOB DESCRIPTION
            → Extract: required competencies, experience levels, must-haves
            → Create: structured evaluation framework with weighted criteria
            → Generate: pre-interview fit score (candidate profile vs. JD)
            ↓
STEP 3:     GENERATE INTERVIEW QUESTIONS
            → Dynamic, role-specific questions across:
              • Technical competency — skills and knowledge for the role
              • Behavioural — past experience (STAR format)
              • Situational — hypothetical scenarios testing judgment
              • Cultural fit — alignment with role expectations
            → Questions tailored to THIS candidate (reference resume, probe gaps)
            → Difficulty calibrated to role level (junior / mid / senior / lead)
            ↓
STEP 4:     CONDUCT INTERVIEW
            → Present questions in conversational flow
            → Process responses in real-time
            → Ask follow-up questions on:
              - Vague or insufficient answers
              - Interesting claims needing verification
              - Gaps between resume and responses
            → Maintain natural flow while covering all competencies
            → Average duration: 15–20 minutes
            ↓
STEP 5:     EVALUATE RESPONSES
            → Score each answer (1–5 scale) against predefined criteria
            → Dimensions: relevance, depth, example quality, communication, problem-solving
            → Aggregate scores per competency area
            → Generate overall performance score
            ↓
STEP 6:     GENERATE REPORT
            → Comprehensive interview report (see Output section)
            ↓
OUTPUT:     Delivered to HR team for review
ESCALATION: Flags for human review when confidence is low
```

### Output: Interview Report

```
CANDIDATE INTERVIEW REPORT
──────────────────────────────────────────

CANDIDATE:         [Name]
ROLE:              [Target Role]
DATE:              [Interview Date]
OVERALL SCORE:     [X.X / 5.0]
RECOMMENDATION:    HIRE / NO-HIRE / FURTHER REVIEW
CONFIDENCE:        High / Medium / Low

──────────────────────────────────────────

1. CANDIDATE PROFILE
   • Experience summary
   • Key skills mapped to role requirements
   • Pre-interview fit score

2. QUESTION-BY-QUESTION EVALUATION
   For each question:
   • Question asked
   • Candidate response (summarised)
   • Score (1–5)
   • Evaluator notes (strengths, gaps, red flags)

3. COMPETENCY ASSESSMENT
   • Technical Skills:     [X.X / 5.0]
   • Communication:        [X.X / 5.0]
   • Problem Solving:      [X.X / 5.0]
   • Leadership/Teamwork:  [X.X / 5.0]
   • Cultural Fit:         [X.X / 5.0]

4. STRENGTHS
   • [Top 3–5 strengths with evidence from responses]

5. WEAKNESSES & GAPS
   • [Areas of concern with evidence]

6. SKILL ANALYSIS
   • Skill-by-skill match against JD requirements
   • Proficiency level assessment per skill

7. HIRE RECOMMENDATION
   • Recommendation: HIRE / NO-HIRE / FURTHER REVIEW
   • Confidence level: High / Medium / Low
   • Reasoning: [2–3 sentence justification]

8. SUGGESTED FOLLOW-UP
   • Areas for human interviewer to deep-dive
   • Specific questions for the next round
```

---

## Escalation Logic

The HR Agent escalates to human review when:

- Candidate background is too unusual for confident evaluation
- Candidate responses appear rehearsed or AI-generated
- Candidate raises concerns about the process
- Overall score falls in the ambiguous range (2.5–3.5 / 5.0)
- Candidate claims credentials the agent cannot verify
- Candidate requests to speak with a human

---

## Business Metrics

| Metric | Before HR Agent | After HR Agent |
|--------|----------------|---------------|
| First-round screening time per candidate | 30–45 min | 15–20 min (automated) |
| HR recruiter time per candidate | 45 min (interview + notes) | 5 min (review report) |
| Consistency across candidates | Variable (interviewer-dependent) | 100% consistent framework |
| Time-to-first-response | 5–7 days | Same day |
| Candidate drop-off rate | High (due to wait times) | Significantly reduced |
| Screening capacity | 10–15 interviews/week per recruiter | Unlimited (agent scales) |
| Annual cost of manual screening (10+ roles) | ₹11.7 lakh+ | Fraction of that |

---

## Who It's For

| Buyer | Why They Buy |
|-------|-------------|
| **Head of Talent / HR Director** | Volume problem — too many candidates, not enough recruiters |
| **Startup Founders (hiring fast)** | No dedicated HR team — needs screening without hiring a recruiter |
| **Recruiting Agencies** | Process 10x more candidates for clients without adding headcount |
| **Enterprise HR** | Compliance and consistency — every candidate evaluated identically |

---

## Competitive Differentiation

| Alternative | What It Does | What SARVAX HR Agent Does Differently |
|------------|-------------|--------------------------------------|
| Manual screening | HR person conducts interview | Agent conducts interview autonomously — HR reviews the report |
| ATS screening (Greenhouse, Lever) | Filters by keywords | Agent evaluates actual competency, not keyword matches |
| Pre-recorded video (HireVue) | Candidate records answers to fixed questions | Agent asks dynamic follow-up questions, adapts in real-time |
| Chatbot screeners | Asks scripted Q&A | Agent reasons through responses, probes deeper, evaluates quality |

---

## The Proof Point

The HR Agent is the proof-of-concept for the entire SARVAX platform. It demonstrates that an AI agent can own a complete business role — from input to evaluation to deliverable — with minimal human oversight.

If an agent can conduct an interview, evaluate a candidate, and produce a trusted hiring recommendation, it can:
- Update a CRM after a sales call
- Compile a weekly report from 4 data sources
- Qualify an inbound lead in 15 minutes
- Resolve a routine support ticket in 2 minutes

The HR Agent is not just a product. It's proof that SARVAX works.

---

*For SARVAX agents system architecture: `sarvax_agents_system.md`*
*For all agents overview: `sarvax_agents_overview.md`*
*Next agents in development: Sales Post-Call Agent, Lead Qualification Agent*
