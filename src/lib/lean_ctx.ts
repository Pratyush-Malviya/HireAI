import OpenAI from 'openai';
import { ProxyClient } from 'lean-ctx-sdk';

const IS_VERCEL = !!process.env.VERCEL;
// LeanCTX is available locally if not on Vercel
const LEAN_CTX_AVAILABLE = !IS_VERCEL;

export function createHeadroomNvidiaClient(apiKey: string, baseURL: string): OpenAI {
  return new OpenAI({ apiKey, baseURL });
}

type GeminiContent = { role: string; parts: { text: string }[] };

function geminiContentsToMessages(contents: any): Array<{ role: string; content: string }> {
  if (typeof contents === 'string') {
    return [{ role: 'user', content: contents }];
  }
  if (Array.isArray(contents)) {
    return contents.map((c: any) => ({
      role: c.role === 'model' ? 'assistant' : c.role || 'user',
      content: c.parts?.map((p: any) => p.text || '').join('\n') || '',
    }));
  }
  return [{ role: 'user', content: String(contents) }];
}

function messagesToGeminiContents(messages: Array<{ role: string; content: string }>): GeminiContent[] {
  return messages.map((m: any) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

export async function maybeCompressContents(
  contents: any,
  model: string
): Promise<{ contents: any; compressed: boolean; tokensSaved?: number }> {
  if (!LEAN_CTX_AVAILABLE) return { contents, compressed: false };
  if (!contents || (typeof contents === 'string' && contents.length < 500) || (Array.isArray(contents) && contents.length < 3)) {
    return { contents, compressed: false };
  }

  try {
    const client = new ProxyClient({
      baseUrl: process.env.LEAN_CTX_PROXY_URL || undefined,
      token: process.env.LEAN_CTX_PROXY_TOKEN || undefined,
      timeoutMs: 3000,
    });
    
    const messages = geminiContentsToMessages(contents);
    const result = await client.compress(messages as any[], model);

    if (result?.messages?.length) {
      const compressed: any = typeof contents === 'string'
        ? result.messages.map((m: any) => m.content as string).join('\n')
        : messagesToGeminiContents(result.messages as any[]);
      const tokensSaved = result.stats?.saved_tokens || 0;
      if (tokensSaved > 0) {
        console.log(`[LeanCTX] Compressed ${tokensSaved} tokens (${model})`);
      }
      return { contents: compressed, compressed: tokensSaved > 0, tokensSaved };
    }
  } catch (error) {
    // LeanCTX daemon unavailable or failed — use original contents
  }

  return { contents, compressed: false };
}
