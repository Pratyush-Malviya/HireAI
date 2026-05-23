import OpenAI from "openai";

// ---------------------------------------------------------------------------
// NVIDIA NIM Client (OpenAI-compatible SDK)
// ---------------------------------------------------------------------------
export const nvidia = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: "https://integrate.api.nvidia.com/v1",
});

// ---------------------------------------------------------------------------
// Model constants — change here to swap models across all routes
// ---------------------------------------------------------------------------
export const NVIDIA_MODELS = {
  /** DeepSeek R1 — best for structured JSON analysis & resume screening */
  resumeScreening: "deepseek-ai/deepseek-r1",
  /** Llama 3.3 70B — best for realistic conversational interview simulation */
  interview: "meta/llama-3.3-70b-instruct",
  /** Nemotron 70B — best for HR-grade summarization & scoring */
  hrAgent: "nvidia/llama-3.1-nemotron-70b-instruct",
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface NvidiaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface NvidiaChatOptions {
  model: string;
  messages: NvidiaMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Set to true to receive a streaming response (SSE) */
  stream?: false;
}

export interface NvidiaChatStreamOptions {
  model: string;
  messages: NvidiaMessage[];
  temperature?: number;
  maxTokens?: number;
  stream: true;
}

// ---------------------------------------------------------------------------
// Core helper — non-streaming, strips DeepSeek R1 <think> blocks
// ---------------------------------------------------------------------------
export async function callNvidiaChat(options: NvidiaChatOptions): Promise<string> {
  const completion = await nvidia.chat.completions.create({
    model: options.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 4096,
    stream: false,
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  return stripThinkBlock(raw);
}

// ---------------------------------------------------------------------------
// Streaming helper — returns an async iterable of text chunks
// ---------------------------------------------------------------------------
export async function streamNvidiaChat(
  options: NvidiaChatStreamOptions
): Promise<AsyncIterable<string>> {
  const stream = await nvidia.chat.completions.create({
    model: options.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.5,
    max_tokens: options.maxTokens ?? 2048,
    stream: true,
  });

  return (async function* () {
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  })();
}

// ---------------------------------------------------------------------------
// Utility — strip DeepSeek R1 chain-of-thought reasoning wrapper
// DeepSeek R1 wraps its thinking in <think>...</think> before the answer.
// We only want the final answer portion.
// ---------------------------------------------------------------------------
export function stripThinkBlock(text: string): string {
  // Remove everything inside <think>...</think> (including the tags)
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

// ---------------------------------------------------------------------------
// Utility — safely parse JSON from AI response (handles markdown code fences)
// ---------------------------------------------------------------------------
export function parseJsonResponse<T = unknown>(text: string): T {
  // Strip markdown code fences if present
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  // Extract the first JSON object/array
  const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  const jsonStr = match ? match[0] : cleaned;

  return JSON.parse(jsonStr) as T;
}