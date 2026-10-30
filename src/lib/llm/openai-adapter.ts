import { z } from 'zod';
import { PROVIDERS } from '@/config/providers';
import type { ChatRequest, LlmMessage, VisionRequest } from '@/types/messages';
import { cleanSources } from './web-sources';
import { AdapterError, postOk, statusToCode, type DeltaHandler, type LlmResult, type ProviderAdapter } from './provider';
import { readSse } from './sse';

// OpenAI Chat Completions adapter. Responses are zod-validated (CLAUDE.md §2).
const BASE = PROVIDERS.openai.apiBase;

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
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AdapterError('network', 'Could not reach OpenAI.');
  }
  if (!res.ok) throw new AdapterError(statusToCode(res.status), `OpenAI error ${res.status}.`);
  const parsed = responseSchema.safeParse(await res.json());
  if (!parsed.success) throw new AdapterError('unknown', 'Unexpected OpenAI response shape.');
  return {
    text: (parsed.data.choices[0]?.message.content ?? '').trim(),
    usage: {
      inputTokens: parsed.data.usage?.prompt_tokens ?? 0,
      outputTokens: parsed.data.usage?.completion_tokens ?? 0,
    },
  };
}

const chunkSchema = z.object({
  choices: z.array(z.object({ delta: z.object({ content: z.string().nullish() }).partial().optional() })).optional(),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).nullish(),
});

// Shared by OpenAI-compatible APIs (OpenRouter): accumulate delta.content and
// take usage from the final chunk.
export async function readChatCompletionStream(res: Response, onDelta: DeltaHandler): Promise<LlmResult> {
  let text = '';
  let usage = { inputTokens: 0, outputTokens: 0 };
  await readSse(res, (data) => {
    const c = chunkSchema.safeParse(data);
    if (!c.success) return;
    const piece = c.data.choices?.[0]?.delta?.content;
    if (piece) {
      text += piece;
      onDelta(piece);
    }
    if (c.data.usage) usage = { inputTokens: c.data.usage.prompt_tokens, outputTokens: c.data.usage.completion_tokens };
  });
  return { text: text.trim(), usage };
}

const responsesSchema = z.object({
  output: z.array(
    z.object({
      type: z.string(),
      content: z
        .array(
          z.object({
            type: z.string(),
            text: z.string().optional(),
            annotations: z.array(z.object({ type: z.string(), url: z.string().optional(), title: z.string().nullish() })).nullish(),
          }),
        )
        .optional(),
    }),
  ),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).nullish(),
});

export const openaiAdapter: ProviderAdapter = {
  // Responses API with the built-in web_search tool.
  async webSearch(apiKey, req): Promise<LlmResult> {
    const res = await postOk(
      `${BASE}/v1/responses`,
      {
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: req.model,
          instructions: req.system,
          input: req.question,
          tools: [{ type: 'web_search' }],
          max_output_tokens: req.maxTokens ?? 1024,
        }),
      },
      'OpenAI',
    );
    const parsed = responsesSchema.safeParse(await res.json());
    if (!parsed.success) throw new AdapterError('unknown', 'Unexpected OpenAI response shape.');
    const parts = parsed.data.output.filter((o) => o.type === 'message').flatMap((o) => o.content ?? []);
    return {
      text: parts.filter((p) => p.type === 'output_text').map((p) => p.text ?? '').join('').trim(),
      usage: { inputTokens: parsed.data.usage?.input_tokens ?? 0, outputTokens: parsed.data.usage?.output_tokens ?? 0 },
      sources: cleanSources(parts.flatMap((p) => p.annotations ?? []).filter((a) => a.type === 'url_citation')),
    };
  },

  async chatStream(apiKey, req, onDelta): Promise<LlmResult> {
    const res = await postOk(
      `${BASE}/v1/chat/completions`,
      {
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: req.model,
          temperature: req.temperature ?? 0.3,
          max_tokens: req.maxTokens ?? 1024,
          messages: toMessages(req.system, req.messages),
          stream: true,
          stream_options: { include_usage: true },
        }),
      },
      'OpenAI',
    );
    return readChatCompletionStream(res, onDelta);
  },

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
