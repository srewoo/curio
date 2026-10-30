import type { Route } from '@playwright/test';

// A fake Anthropic Messages API: picks a canned reply by recognising which of
// Curio's prompts is calling. Keeps e2e runs offline, free and deterministic.

const usage = { input_tokens: 100, output_tokens: 50 };
const headers = { 'access-control-allow-origin': '*' };

export const TUTOR_ANSWER = 'Evaporation is when water turns into vapour because the sun heats it [p. 1].';
export const WEB_ANSWER = 'A rainbow forms when sunlight bends inside raindrops.';

const concepts = [
  { name: 'Evaporation', kind: 'idea', front: 'What is evaporation?', back: 'Water turning into vapour when heated.' },
  { name: 'Condensation', kind: 'idea', front: 'What is condensation?', back: 'Vapour cooling into droplets.' },
];

function quiz(): unknown[] {
  const mcq = (q: string, concept: string) => ({ kind: 'mcq', question: q, choices: ['Heat', 'Cold', 'Wind', 'Salt'], correctIndex: 0, rubric: '', concept });
  return [mcq('What makes water evaporate?', 'c1'), mcq('What forms clouds?', 'c2')];
}

function replyFor(body: { system?: string; messages?: { content: unknown }[]; tools?: unknown[]; max_tokens?: number }): string {
  const system = body.system ?? '';
  if (body.tools) return WEB_ANSWER;
  if (body.max_tokens === 1) return 'hi';
  if (system.includes('child-safety reviewer')) return 'SAFE';
  if (system.includes('You screen material')) return 'OK';
  if (system.includes('You plan study')) return JSON.stringify(concepts);
  if (system.includes('introduce a chapter')) return JSON.stringify({ overview: 'We will learn about the water cycle.', starters: ['What is evaporation?', 'How do clouds form?', 'Why does it rain?'] });
  if (system.includes('suggest follow-up')) return JSON.stringify(['What is condensation?', 'What is rain?', 'Where does water go?']);
  if (system.includes('first lines of each page')) return JSON.stringify([{ title: 'The Water Cycle', startPage: 1, endPage: 99 }]);
  if (system.includes('end-of-chapter quiz')) return JSON.stringify(quiz());
  if (system.includes('grade a child')) return JSON.stringify([]);
  if (system.includes('ONE quick comprehension check')) {
    return JSON.stringify({ kind: 'true-false', question: 'Clouds are made of droplets.', choices: ['True', 'False'], correctIndex: 0, explanation: 'Yes!', concept: 'c2' });
  }
  if (system.includes("explanation of one concept")) return JSON.stringify({ score: 1, feedback: 'Great explaining!' });
  return TUTOR_ANSWER;
}

function sse(text: string): string {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 100 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...text.match(/.{1,12}/gs)!.map((t) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })),
    { type: 'message_delta', usage: { output_tokens: 50 } },
    { type: 'message_stop' },
  ];
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

export async function mockAnthropic(route: Route): Promise<void> {
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'access-control-allow-headers': '*' } });
  const body = route.request().postDataJSON() as Parameters<typeof replyFor>[0] & { stream?: boolean };
  const text = replyFor(body);
  if (body.stream) {
    return route.fulfill({ status: 200, headers: { ...headers, 'content-type': 'text/event-stream' }, body: sse(text) });
  }
  const content = body.tools
    ? [
        { type: 'server_tool_use', id: 'srv1', name: 'web_search', input: { query: 'rainbow' } },
        { type: 'web_search_tool_result', tool_use_id: 'srv1', content: [{ type: 'web_search_result', url: 'https://kids.example.org/rainbow', title: 'Rainbows for kids' }] },
        { type: 'text', text, citations: [{ type: 'web_search_result_location', url: 'https://kids.example.org/rainbow', title: 'Rainbows for kids', cited_text: 'bends' }] },
      ]
    : [{ type: 'text', text }];
  return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ content, usage }) });
}
