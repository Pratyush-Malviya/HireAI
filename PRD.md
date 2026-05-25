# Product Requirements Document (PRD) — AI Resume Screening & Interview Simulation Platform

This document defines the core product features, user experience flows, system specifications, and proctoring protocols for the HireNow AI Resume Screening & Interactive Screening Interview Platform.

---

## 1. Executive Summary & Core Value Proposition

HireNow is a cinematic B2B SaaS talent acquisition platform designed to eliminate recruiter screening bottleneck. It delivers:
- **High-Fidelity AI Resume Analysis**: Forensic dimensional grading of resume files using advanced DeepSeek-R1 models.
- **Deep Candidate OSINT Verification**: Grounded web research targeting LinkedIn, GitHub, and professional visibility metrics to validate identity and accomplishments.
- **Natural One-to-One Interview Simulation**: A warm, cinematic, hands-free voice-activated interactive screening panel.
- **End-to-End Proctoring Integrity**: Zero-trust automated proctoring (camera, face-tracking, tab-switching, noise-level detection) to protect hiring pipeline metrics from cheating or external assistance.

---

## 2. Platform Architecture & Features

### 2.1 Resume Deconstruction & Job Campaigns
- **Job Parsing**: Accepts raw text JDs and decomposes them into structured lists of must-have skills, nice-to-have skills, quantitative experience minimums, and roles.
- **Forensic Screening**: Grades resumes across 5 key dimensions:
  1. *Skills Match* (Keyword overlap + semantic match)
  2. *Experience Fit* (Years and seniority match)
  3. *Education* (Degree tier and field match)
  4. *Achievements* (Quantified high-impact business outcomes)
  5. *Cultural & Role Fit* (Tenure stability and growth trajectory)
- **Dimensional Performance Ledger**: Provides structured citation-rich markdown reports with calculated composite scores (weighted: skills 35%, experience 25%, education 15%, achievements 15%, cultural 10%).

### 2.2 Grounded Professional OSINT Research
- **Multi-Source Scan**: Scans professional footprints (LinkedIn, GitHub, StackOverflow, Kaggle, Dev.to, Google Scholar, personal portfolios, Product Hunt, startup databases).
- **Identity Resolution scoring**: Scores identity confidence from 0 to 100 based on email verification, company matches, and locations. Requires >= 85 confidence to mark profile as verified.
- **Reputation, Technical Depth & Stability Metrics**: Extends standard resume checks with real-world visibility scores, team-leading capabilities, risk metrics (timelines inflation, gaps, empty profiles), and recommendations.

### 2.3 Real-Time Interview Simulation Page
- **Dialogue Engine**: Implements a structured, conversational screening recruiter asking 5-8 targeted, one-at-a-time questions using STAR-method behavioral cues.
- **Hands-Free Continuos Voice Mode (Voice-Activated)**:
  - **Live Passive Transcription**: Real-time caption bubble showing real-time transcription status. No manual confirmation buttons; displays an emerald-green pulsing status indicating `"Live Transcription"` and `"Pause speaking to automatically submit response"`.
  - **Auto-Submission**: Submits speech automatically after 1.8 seconds of silence or when the browser speech-to-text engine triggers `onend`.
  - **Auto-Listening Resume**: Listening starts automatically as soon as AI finishes playing its voice, creating a continuous hands-free one-to-one conversation loop.
- **Premium Voice & Neural Fallback Synthesis**:
  - **Pre-Warmed SpeechSynthesis**: On-mount `useEffect` pre-warms the SpeechSynthesis engines to ensure voices are cached.
  - **Online Neural Voice Prioritization**: In fallback, matches are sorted to highly prioritize modern online neural voices (containing `'Online'`, `'Neural'`, or `'Natural'`) such as `Google US English` or `Microsoft Jenny Online`.
  - **Robotic Accent Fixes**: Fixes the Indian English query to reference `'India'` or `'en-IN'` directly to avoid robotic Hindi speech accentuation.
  - **Edge Neural TTS**: Out-of-the-box support for Edge Neural TTS (e.g. JennyNeural, SoniaNeural, NeerjaNeural) mapping voice IDs directly to corresponding prosody streams.

### 2.4 Secure Proctoring & Integrity Systems
- **Document Visibility & Focus Loss Tracking**:
  - **Immediate switch warnings**: Triggers immediate proctoring violations when the tab is switched (`visibilitychange` when `document.hidden` becomes true) or when the browser window loses focus (`blur`).
  - **Cooldown Safeguard**: Implements a 2-second cooldown (`lastTabWarningRef`) to prevent duplicate warnings from firing during concurrent visibility and blur triggers.
  - **Refs-based Synchronization**: Proctoring counters are handled synchronously via refs (`tabWarningsRef`, `faceWarningsRef`, `noiseWarningsRef`) to solve async state update loss, updating states immediately.
- **Face Visibility & Webcam Tracking**:
  - **Webcam Inactive Track Proctoring**: Continuous tracking runs even if the webcam is toggled off or the video track is disabled. The proctoring engine flags the inactive track and triggers a "Face is not visible" violation after 5 seconds.
  - **Face Presence Tracking**: Runs tinyFaceDetector on a 1-second interval, setting status to `'not_detected'` and warning the user if their face disappears for 5 seconds.
- **Ambient Noise Violations**:
  - Measures microphone volume input. Logs a room noise violation if background speech/noise surpasses 30dB when the user is supposed to be quiet.
- **Three-Strike Auto-Conclude Policy**:
  - Auto-concludes and locks the interview room immediately if the candidate exceeds 3 warnings in any proctoring category. Logs a system log inside the proctored interview report for HR review.

---

## 3. Product Success Criteria & KPIs

- **Simplicity of User Flow**: Candidates must be able to complete their full screening interview hands-free without clicking any send buttons.
- **No Robotic Falls**: High-fidelity, human-like voice synthesis on all browser types with neural online voice preferences.
- **Zero Proctoring Leaks**: Instant detection of tab defocus, tab switching, and webcam disabling with no race conditions or lost count updates.
