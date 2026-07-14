import { z } from 'zod';
import { PROVIDERS } from '@/config/providers';
import type { ChatRequest, LlmMessage, VisionRequest } from '@/types/messages';
import { AdapterError, statusToCode, type LlmResult, type ProviderAdapter } from './provider';

const BASE = PROVIDERS.openrouter.apiBase;

const responseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
  usage: z
    .object({ prompt_tokens: z.number(), completion_tokens: z.number() })
    .optional(),
});

function toMessages(system: string, messages: readonly LlmMessage[]): unknown[] {
  return [{ role: 'system', content: system }, ...messages.filter((m) => m.role !== 'system')];
}

async function call(apiKey: string, body: unknown): Promise<LlmResult> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/srewoo/curio',
        'X-Title': 'Curio AI Tutor',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AdapterError('network', 'Could not reach OpenRouter.');
  }
  if (!res.ok) throw new AdapterError(statusToCode(res.status), `OpenRouter error ${res.status}.`);
  const parsed = responseSchema.safeParse(await res.json());
  if (!parsed.success) throw new AdapterError('unknown', 'Unexpected OpenRouter response shape.');
  return {
    text: (parsed.data.choices[0]?.message.content ?? '').trim(),
    usage: {
      inputTokens: parsed.data.usage?.prompt_tokens ?? 0,
      outputTokens: parsed.data.usage?.completion_tokens ?? 0,
    },
  };
}

export const openrouterAdapter: ProviderAdapter = {
  async chat(apiKey, req: ChatRequest): Promise<LlmResult> {
    return call(apiKey, {
      model: req.model,
      temperature: req.temperature ?? 0.3,
      max_tokens: req.maxTokens ?? 1024,
      messages: toMessages(req.system, req.messages),
    });
  },

  async vision(apiKey, req: VisionRequest): Promise<LlmResult> {
    return call(apiKey, {
      model: req.model,
      max_tokens: req.maxTokens ?? 2048,
      messages: [
        { role: 'system', content: req.system },
        {
          role: 'user',
          content: [
            { type: 'text', text: req.prompt },
            {
              type: 'image_url',
              image_url: { url: `data:${req.image.mimeType};base64,${req.image.dataBase64}` },
            },
          ],
        },
      ],
    });
  },

  async validateKey(apiKey, model): Promise<void> {
    await call(apiKey, { model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] });
  },
};
