import { describe, expect, it } from 'vitest';
import { readSse, splitSseEvents } from './sse';

describe('splitSseEvents', () => {
  it('splits complete events and keeps the partial tail', () => {
    const { events, rest } = splitSseEvents('event: x\ndata: {"a":1}\n\ndata: {"b":2}\n\ndata: {"c"');
    expect(events).toEqual(['{"a":1}', '{"b":2}']);
    expect(rest).toBe('data: {"c"');
  });

  it('handles CRLF and drops [DONE]', () => {
    expect(splitSseEvents('data: {"a":1}\r\n\r\ndata: [DONE]\r\n\r\n').events).toEqual(['{"a":1}']);
  });
});

describe('readSse', () => {
  it('parses JSON events split across network chunks', async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: {"t":"Hel'));
        c.enqueue(enc.encode('lo"}\n\n: keep-alive\n\ndata: {"t":" world"}'));
        c.close();
      },
    });
    const seen: unknown[] = [];
    await readSse(new Response(body), (d) => seen.push(d));
    expect(seen).toEqual([{ t: 'Hello' }, { t: ' world' }]);
  });
});

describe('readSse errors', () => {
  it('propagates errors thrown by the handler', async () => {
    const res = new Response('data: {"type":"error"}\n\n');
    await expect(
      readSse(res, () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
});
