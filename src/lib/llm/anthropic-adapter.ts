import { z } from 'zod';
import { PROVIDERS } from '@/config/providers';
import type { ChatRequest, VisionRequest, WebSearchRequest } from '@/types/messages';
import { WEB_SEARCH } from '@/config/constants';
import { cleanSources } from './web-sources';
import { AdapterError, postOk, statusToCode, type DeltaHandler, type LlmResult, type ProviderAdapter } from './provider';
import { readSse } from './sse';

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

const streamEventSchema = z.object({
  type: z.string(),
  delta: z.object({ text: z.string().optional() }).optional(),
  message: z.object({ usage: z.object({ input_tokens: z.number() }).partial() }).partial().optional(),
  usage: z.object({ output_tokens: z.number() }).partial().optional(),
});

function chatBody(req: ChatRequest): Record<string, unknown> {
  return {
    model: req.model,
    system: req.system,
    max_tokens: req.maxTokens ?? 1024,
    temperature: req.temperature ?? 0.3,
    messages: req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content })),
  };
}

async function stream(apiKey: string, req: ChatRequest, onDelta: DeltaHandler): Promise<LlmResult> {
  const res = await postOk(
    `${BASE}/v1/messages`,
    { headers: headers(apiKey), body: JSON.stringify({ ...chatBody(req), stream: true }) },
    'Anthropic',
  );
  let text = '';
  let inputTokens = 0;
  let outputTokens = 0;
  await readSse(res, (data) => {
    const ev = streamEventSchema.safeParse(data);
    if (!ev.success) return;
    if (ev.data.type === 'error') throw new AdapterError('server', 'Anthropic stream error.');
    if (ev.data.type === 'content_block_delta' && ev.data.delta?.text) {
      text += ev.data.delta.text;
      onDelta(ev.data.delta.text);
    }
    inputTokens = ev.data.message?.usage?.input_tokens ?? inputTokens;
    outputTokens = ev.data.usage?.output_tokens ?? outputTokens;
  });
  return { text: text.trim(), usage: { inputTokens, outputTokens } };
}

const webSchema = z.object({
  content: z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
      citations: z.array(z.object({ url: z.string().optional(), title: z.string().nullish() })).nullish(),
      content: z.unknown().optional(), // web_search_tool_result: list of results, or an error object
    }),
  ),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
});

const resultListSchema = z.array(z.object({ url: z.string().optional(), title: z.string().nullish() }));

async function webSearch(apiKey: string, req: WebSearchRequest): Promise<LlmResult> {
  // Basic web_search_20250305: accepted by every model in our catalog (incl.
  // Haiku) and avoids the code-execution cost of the dynamic-filtering variant.
  // Requires web search to be enabled for the org in the Anthropic Console.
  const res = await postOk(
    `${BASE}/v1/messages`,
    {
      headers: headers(apiKey),
      body: JSON.stringify({
        model: req.model,
        system: req.system,
        max_tokens: req.maxTokens ?? 1024,
        messages: [{ role: 'user', content: req.question }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: WEB_SEARCH.maxSearches }],
      }),
    },
    'Anthropic',
  );
  const parsed = webSchema.safeParse(await res.json());
  if (!parsed.success) throw new AdapterError('unknown', 'Unexpected Anthropic response shape.');
  const blocks = parsed.data.content;
  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  const cited = blocks.flatMap((b) => b.citations ?? []);
  // Fall back to raw results only if the answer cited nothing.
  const results = blocks
    .filter((b) => b.type === 'web_search_tool_result')
    .flatMap((b) => {
      const list = resultListSchema.safeParse(b.content);
      return list.success ? list.data : [];
    });
  return {
    text,
    usage: { inputTokens: parsed.data.usage.input_tokens, outputTokens: parsed.data.usage.output_tokens },
    sources: cleanSources(cited.length > 0 ? cited : results),
  };
}

export const anthropicAdapter: ProviderAdapter = {
  webSearch,

  async chat(apiKey, req: ChatRequest): Promise<LlmResult> {
    return call(apiKey, chatBody(req));
  },

  chatStream: stream,

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
