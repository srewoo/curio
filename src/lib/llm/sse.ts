// Minimal Server-Sent Events reader for provider streaming APIs. Events are
// separated by a blank line; only `data:` lines matter to us.

export function splitSseEvents(buffer: string): { events: string[]; rest: string } {
  const parts = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = parts.pop() ?? '';
  const events = parts
    .map((block) =>
      block
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n'),
    )
    .filter((d) => d.length > 0 && d !== '[DONE]');
  return { events, rest };
}

// Read a streaming Response body, calling onJson for each parsed data payload.
// Malformed payloads (keep-alives, comments) are skipped.
export async function readSse(res: Response, onJson: (data: unknown) => void): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const flush = (events: string[]): void => {
    for (const e of events) {
      let data: unknown;
      try {
        data = JSON.parse(e);
      } catch {
        continue; // not JSON — ignore
      }
      onJson(data); // handler errors (e.g. a provider error event) propagate
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = splitSseEvents(buffer);
    buffer = rest;
    flush(events);
  }
  flush(splitSseEvents(`${buffer}\n\n`).events);
}
