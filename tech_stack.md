# HireAI: Detailed Technical Stack & Architecture

This document provides a comprehensive breakdown of the technologies, libraries, services, and architectures utilized within the HireAI application.

---

## 1. Frontend Architecture (Web App)
The client interface is designed for high responsiveness, visual excellence, and client-side processing.

*   **Core Framework**: [React 19](https://react.dev/) using **TypeScript** for robust typing.
*   **Build Tool & Dev Server**: [Vite 6](https://vite.dev/) configured with advanced chunk-splitting for firebase, recharts, and markdown utilities to optimize load times.
*   **Routing**: `react-router-dom` (v7) for handling application routing and transitions.
*   **Styling**: **Tailwind CSS v4** for modern utility-first layouts.
*   **UI Effects & Motion**:
    *   **Framer Motion / Motion**: Powering smooth UI animations.
    *   **Magic UI Components**: Leveraged for premium visual elements:
        *   `animated-gradient-text` & `sparkles-text`
        *   `particles` & `meteors` for dynamic background visuals.
        *   `shimmer-button`, `rainbow-button`, and `border-beam` for active states.
        *   `confetti` for celebration events (e.g., successful candidate hire).
*   **Analytics**: `recharts` for pipeline performance, metrics dashboards, and candidate score breakdowns.
*   **Document Parsers & Exporters**:
    *   `pdfjs-dist`: Parsers used to extract text directly from candidate resume PDFs client-side.
    *   `mammoth`: Utilized to read and convert `.docx` resume uploads.
    *   `jspdf` & `jspdf-autotable`: Libraries for creating and exporting client reports dynamically.
*   **Icons**: `lucide-react` for standard UI symbols.
*   **HTTP Client**: `axios` and native Fetch API.

---

## 2. Express Backend Server
The server layer acts as the secure intermediary for AI APIs and integration endpoints.

*   **Runtime Environment**: Node.js
*   **Server Framework**: **Express** (v4)
*   **Security & Sanitization**:
    *   `helmet`: Used for injecting HTTP security headers, tailored to allow secure rendering inside preview containers.
    *   `cookie-parser`: Used for parsing and managing secure session cookie scopes.
    *   Input sanitization: Custom functions preventing stored XSS injection in forms.
*   **API Rate Limiting**: `express-rate-limit` configuring distinct windows:
    *   *General limits* (350 reqs/15m) for standard APIs.
    *   *AI processing limits* (15 reqs/1m) protecting Gemini routes.
    *   *NVIDIA NIM limits* (20 reqs/1m) protecting DeepSeek/Llama routes.
    *   *Delivery limits* (8 invites/10m) protecting candidate email invitation spam.
*   **Third-Party Integrations**:
    *   `googleapis`: Used for Google Calendar, Gmail, and Google Meet integration. Supports generating dynamic Google Meet spaces on the fly (via Meet API v2).
    *   `nodemailer`: Used for dispatching email invitations and alerts.

---

## 3. Serverless Backend & Database (Firebase)
HireAI uses Firebase as its primary serverless platform and configuration repository.

*   **Database**: **Firebase Firestore**. It targets a named database (`ai-studio-21348cef-37c9-4a71-98ec-b3379889bf68`) with local persistent caching and multi-tab state sync.
*   **Authentication**: **Firebase Authentication** supporting Google OAuth flow and standard secure identifiers.
*   **Firebase Functions**: TypeScript cloud functions utilizing:
    *   `firebase-admin` & `firebase-functions` (v6) for cloud triggers.
    *   **Stripe SDK**: Processes subscriptions and product payments.
    *   **Resend SDK**: Transactional emails.

---

## 4. AI & Machine Learning Layer
AI services are distributed between Google Gemini, NVIDIA NIM, and local processing pipelines:

*   **Google Gemini API**: Powered by the official `@google/genai` client SDK. It operates the following features:
    *   Job description parsing.
    *   Candidate resume matching & screening.
    *   Web research agents (utilizing search tools for candidate screening).
    *   AI-generated job descriptions.
*   **NVIDIA NIM (Inference Microservices)**:
    *   **Resume Screening**: Powered by `deepseek-ai/deepseek-r1`.
    *   **Interview Simulation**: Powered by `meta/llama-3.3-70b-instruct` (supports both synchronous responses and server-sent event SSE streaming).
    *   **Interview Summarization**: Powered by `nvidia/llama-3.1-nemotron-70b-instruct`.
*   **Text-to-Speech (TTS)**:
    *   `msedge-tts`: Node.js client utilized by the backend to fetch Edge's high-quality speech synthesize output.
    *   *Local Python TTS*: Coqui `TTS` (specifically the 2GB XTTS-v2 multi-accent model) and `gTTS` (Google TTS) for rendering candidate prompt responses.
*   **Speech-to-Text (STT)**:
    *   `openai-whisper` (Whisper model) for local speech transcription, backed by `sounddevice`, `soundfile`, and `numpy` for audio processing.
*   **Prompt Optimization**:
    *   `lean-ctx-sdk`: Integrates with **LeanCTX** to automatically compress prompts, saving token usage and context size before sending payloads to LLMs.
*   **Integrations**:
    *   `@composio/core`: For linking AI agents with third-party tools and workspaces.
---

## 5. Testing & Development Tooling
*   **Unit & Integration Tests**: `vitest` configured to mock browser globals using `jsdom` and `@testing-library/react`.
*   **Formatting/Linting**: ESLint, Prettier, and TypeScript Compiler (`tsc`).
*   **Runners**: `tsx` (TypeScript Executor) and `nodemon`.
