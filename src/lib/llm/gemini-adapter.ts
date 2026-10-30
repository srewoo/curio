import { z } from 'zod';
import { PROVIDERS } from '@/config/providers';
import type { ChatRequest, VisionRequest } from '@/types/messages';
import { cleanSources } from './web-sources';
import { AdapterError, postOk, statusToCode, type LlmResult, type ProviderAdapter } from './provider';
import { readSse } from './sse';

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

function chatBody(req: ChatRequest): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: req.system }] },
    generationConfig: { temperature: req.temperature ?? 0.3, maxOutputTokens: req.maxTokens ?? 1024 },
    contents: req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
  };
}

const groundingSchema = z.object({
  candidates: z
    .array(
      z.object({
        groundingMetadata: z
          .object({
            groundingChunks: z.array(z.object({ web: z.object({ uri: z.string(), title: z.string().nullish() }).optional() })).nullish(),
            searchEntryPoint: z.object({ renderedContent: z.string().optional() }).nullish(),
          })
          .nullish(),
      }),
    )
    .optional(),
});

export const geminiAdapter: ProviderAdapter = {
  // Grounding with Google Search (gemini-2.0+; older models reject the tool and
  // the caller falls back to the "not in this chapter" reply).
  async webSearch(apiKey, req): Promise<LlmResult> {
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      generationConfig: { maxOutputTokens: req.maxTokens ?? 1024 },
      contents: [{ role: 'user', parts: [{ text: req.question }] }],
      tools: [{ google_search: {} }],
    };
    const res = await postOk(
      `${BASE}/v1beta/models/${req.model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
      'Gemini',
    );
    const json: unknown = await res.json();
    const parsed = responseSchema.safeParse(json);
    if (!parsed.success) throw new AdapterError('unknown', 'Unexpected Gemini response shape.');
    const chunks = groundingSchema.safeParse(json);
    const meta = chunks.success ? chunks.data.candidates?.[0]?.groundingMetadata : undefined;
    const web = meta?.groundingChunks ?? [];
    return {
      text: (parsed.data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim(),
      usage: {
        inputTokens: parsed.data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: parsed.data.usageMetadata?.candidatesTokenCount ?? 0,
      },
      sources: cleanSources(web.flatMap((g) => (g.web ? [{ url: g.web.uri, title: g.web.title }] : []))),
      searchEntryHtml: meta?.searchEntryPoint?.renderedContent,
    };
  },

  async chat(apiKey, req: ChatRequest): Promise<LlmResult> {
    return call(apiKey, req.model, chatBody(req));
  },

  async chatStream(apiKey, req, onDelta): Promise<LlmResult> {
    const res = await postOk(
      `${BASE}/v1beta/models/${req.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
      { headers: { 'content-type': 'application/json' }, body: JSON.stringify(chatBody(req)) },
      'Gemini',
    );
    let text = '';
    let usage = { inputTokens: 0, outputTokens: 0 };
    await readSse(res, (data) => {
      const c = responseSchema.safeParse(data);
      if (!c.success) return;
      const piece = (c.data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
      if (piece) {
        text += piece;
        onDelta(piece);
      }
      const u = c.data.usageMetadata;
      if (u) usage = { inputTokens: u.promptTokenCount ?? usage.inputTokens, outputTokens: u.candidatesTokenCount ?? usage.outputTokens };
    });
    return { text: text.trim(), usage };
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
