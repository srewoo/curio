// Settings-lock PIN hashing (PRD §6.8, TRD §10). We store a salted SHA-256
// hash, never the PIN. Format: "<saltHex>:<hashHex>".

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function digest(saltHex: string, pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${saltHex}:${pin}`);
  return toHex(await crypto.subtle.digest('SHA-256', bytes));
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = toHex(salt.buffer);
  return `${saltHex}:${await digest(saltHex, pin)}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  return (await digest(saltHex, pin)) === hashHex;
}
