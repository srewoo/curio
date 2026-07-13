import { z } from 'zod';
import { PROVIDERS } from '@/config/providers';
import type { ChatRequest, VisionRequest } from '@/types/messages';
import { AdapterError, statusToCode, type LlmResult, type ProviderAdapter } from './provider';

// Google Gemini (generativelanguage) adapter. zod-validated (CLAUDE.md §2).
const BASE = PROVIDERS.gemini.apiBase;

const responseSchema = z.object({
  candidates: z
    .array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }).optional() }))
    .optional(),
  usageMetadata: z
    .object({ promptTokenCount: z.number().optional(), candidatesTokenCount: z.number().optional() })
    .optional(),
});

async function call(apiKey: string, model: string, body: unknown): Promise<LlmResult> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AdapterError('network', 'Could not reach Gemini.');
  }
  if (!res.ok) throw new AdapterError(statusToCode(res.status), `Gemini error ${res.status}.`);
  const parsed = responseSchema.safeParse(await res.json());
  if (!parsed.success) throw new AdapterError('unknown', 'Unexpected Gemini response shape.');
  const text = (parsed.data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
    .trim();
  return {
    text,
    usage: {
      inputTokens: parsed.data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: parsed.data.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

export const geminiAdapter: ProviderAdapter = {
  async chat(apiKey, req: ChatRequest): Promise<LlmResult> {
    return call(apiKey, req.model, {
      systemInstruction: { parts: [{ text: req.system }] },
      generationConfig: { temperature: req.temperature ?? 0.3, maxOutputTokens: req.maxTokens ?? 1024 },
      contents: req.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    });
  },

  async vision(apiKey, req: VisionRequest): Promise<LlmResult> {
    return call(apiKey, req.model, {
      systemInstruction: { parts: [{ text: req.system }] },
      generationConfig: { maxOutputTokens: req.maxTokens ?? 2048 },
      contents: [
        {
          role: 'user',
          parts: [
            { text: req.prompt },
            { inlineData: { mimeType: req.image.mimeType, data: req.image.dataBase64 } },
          ],
        },
      ],
    });
  },

  async validateKey(apiKey, model): Promise<void> {
    await call(apiKey, model, {
      generationConfig: { maxOutputTokens: 1 },
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });
  },
};
