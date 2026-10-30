import { z } from 'zod';
import { PROVIDERS } from '@/config/providers';
import type { ChatRequest, LlmMessage, VisionRequest } from '@/types/messages';
import { WEB_SEARCH } from '@/config/constants';
import { cleanSources } from './web-sources';
import { AdapterError, postOk, statusToCode, type LlmResult, type ProviderAdapter } from './provider';
import { readChatCompletionStream } from './openai-adapter';

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

function headers(apiKey: string): HeadersInit {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://github.com/srewoo/curio',
    'X-Title': 'Curio AI Tutor',
  };
}

async function call(apiKey: string, body: unknown): Promise<LlmResult> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: headers(apiKey),
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

const webSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable(),
          annotations: z
            .array(z.object({ type: z.string(), url_citation: z.object({ url: z.string(), title: z.string().nullish() }).optional() }))
            .nullish(),
        }),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).optional(),
});

export const openrouterAdapter: ProviderAdapter = {
  // OpenRouter's web plugin works with any model it routes to.
  async webSearch(apiKey, req): Promise<LlmResult> {
    const res = await postOk(
      `${BASE}/v1/chat/completions`,
      {
        headers: headers(apiKey),
        body: JSON.stringify({
          model: req.model,
          max_tokens: req.maxTokens ?? 1024,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.question },
          ],
          plugins: [{ id: 'web', max_results: WEB_SEARCH.maxSources }],
        }),
      },
      'OpenRouter',
    );
    const parsed = webSchema.safeParse(await res.json());
    if (!parsed.success) throw new AdapterError('unknown', 'Unexpected OpenRouter response shape.');
    const msg = parsed.data.choices[0]!.message;
    return {
      text: (msg.content ?? '').trim(),
      usage: { inputTokens: parsed.data.usage?.prompt_tokens ?? 0, outputTokens: parsed.data.usage?.completion_tokens ?? 0 },
      sources: cleanSources((msg.annotations ?? []).flatMap((a) => (a.url_citation ? [a.url_citation] : []))),
    };
  },

  async chatStream(apiKey, req, onDelta): Promise<LlmResult> {
    const res = await postOk(
      `${BASE}/v1/chat/completions`,
      {
        headers: headers(apiKey),
        body: JSON.stringify({
          model: req.model,
          temperature: req.temperature ?? 0.3,
          max_tokens: req.maxTokens ?? 1024,
          messages: toMessages(req.system, req.messages),
          stream: true,
          usage: { include: true },
        }),
      },
      'OpenRouter',
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
