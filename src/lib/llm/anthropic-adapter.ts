import { z } from 'zod';
import { PROVIDERS } from '@/config/providers';
import type { ChatRequest, VisionRequest } from '@/types/messages';
import { AdapterError, statusToCode, type LlmResult, type ProviderAdapter } from './provider';

// Anthropic Messages API adapter. Responses are zod-validated (CLAUDE.md §2).
const BASE = PROVIDERS.anthropic.apiBase;
const VERSION = '2023-06-01';

const responseSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
});

function headers(apiKey: string): HeadersInit {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': VERSION,
    // Required for calling the API directly from a browser/extension context.
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

async function call(apiKey: string, body: unknown): Promise<LlmResult> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1/messages`, {
      method: 'POST',
      headers: headers(apiKey),
      body: JSON.stringify(body),
    });
  } catch {
    throw new AdapterError('network', 'Could not reach Anthropic.');
  }
  if (!res.ok) {
    throw new AdapterError(statusToCode(res.status), `Anthropic error ${res.status}.`);
  }
  const parsed = responseSchema.safeParse(await res.json());
  if (!parsed.success) throw new AdapterError('unknown', 'Unexpected Anthropic response shape.');
  const text = parsed.data.content.map((b) => b.text ?? '').join('').trim();
  return {
    text,
    usage: { inputTokens: parsed.data.usage.input_tokens, outputTokens: parsed.data.usage.output_tokens },
  };
}

export const anthropicAdapter: ProviderAdapter = {
  async chat(apiKey, req: ChatRequest): Promise<LlmResult> {
    return call(apiKey, {
      model: req.model,
      system: req.system,
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature ?? 0.3,
      messages: req.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content })),
    });
  },

  async vision(apiKey, req: VisionRequest): Promise<LlmResult> {
    return call(apiKey, {
      model: req.model,
      system: req.system,
      max_tokens: req.maxTokens ?? 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: req.image.mimeType, data: req.image.dataBase64 },
            },
            { type: 'text', text: req.prompt },
          ],
        },
      ],
    });
  },

  async validateKey(apiKey, model): Promise<void> {
    await call(apiKey, { model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] });
  },
};
