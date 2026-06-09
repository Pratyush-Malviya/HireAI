import { compress, simulate } from 'headroom-ai';
import { withHeadroom } from 'headroom-ai/openai';
import OpenAI from 'openai';

const HEADROOM_BASE_URL = process.env.HEADROOM_BASE_URL || 'http://localhost:8787';

export function createHeadroomNvidiaClient(apiKey: string, baseURL: string): OpenAI {
  return withHeadroom(new OpenAI({ apiKey, baseURL }));
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
  if (!contents || (typeof contents === 'string' && contents.length < 500) || (Array.isArray(contents) && contents.length < 3)) {
    return { contents, compressed: false };
  }

  try {
    const messages = geminiContentsToMessages(contents);
    const result = await compress(messages, {
      model,
      baseUrl: HEADROOM_BASE_URL,
      fallback: true,
      timeout: 5000,
    });

    if (result?.messages?.length) {
      const compressed: any = typeof contents === 'string'
        ? result.messages.map((m: any) => m.content).join('\n')
        : messagesToGeminiContents(result.messages);
      const tokensSaved = result.tokensSaved || 0;
      if (tokensSaved > 0) {
        console.log(`[Headroom] Compressed ${tokensSaved} tokens (${model})`);
      }
      return { contents: compressed, compressed: tokensSaved > 0, tokensSaved };
    }
  } catch {
    // Headroom proxy unavailable — use original contents
  }

  return { contents, compressed: false };
}
