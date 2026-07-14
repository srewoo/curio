const KEY_STORAGE_KEY = 'curio.sessionCryptoKey';

// Helper to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

// Helper to convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

let cachedKey: CryptoKey | null = null;

async function getOrCreateKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const webCrypto = typeof crypto !== 'undefined' ? crypto : null;
  if (!webCrypto || !webCrypto.subtle) {
    throw new Error('Web Crypto API not available');
  }

  const isBrowser = typeof chrome !== 'undefined' && chrome.storage?.local;

  if (isBrowser) {
    const data = await chrome.storage.local.get(KEY_STORAGE_KEY);
    const savedBase64 = data[KEY_STORAGE_KEY];
    if (typeof savedBase64 === 'string' && savedBase64.length > 0) {
      const rawKey = base64ToArrayBuffer(savedBase64);
      cachedKey = await webCrypto.subtle.importKey(
        'raw',
        rawKey,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      return cachedKey;
    }
  }

  const key = await webCrypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  if (isBrowser) {
    const rawKey = await webCrypto.subtle.exportKey('raw', key);
    const keyBase64 = arrayBufferToBase64(rawKey);
    await chrome.storage.local.set({ [KEY_STORAGE_KEY]: keyBase64 });
  }

  cachedKey = key;
  return key;
}

export async function encryptSession(plaintext: string): Promise<string> {
  const webCrypto = typeof crypto !== 'undefined' ? crypto : null;
  if (!webCrypto || !webCrypto.subtle) {
    throw new Error('Web Crypto API not available');
  }

  const key = await getOrCreateKey();
  const iv = webCrypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encodedPlaintext = encoder.encode(plaintext);

  const ciphertextBuffer = await webCrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedPlaintext
  );

  const combined = new Uint8Array(iv.length + ciphertextBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertextBuffer), iv.length);

  return arrayBufferToBase64(combined.buffer);
}

export async function decryptSession(base64Ciphertext: string): Promise<string> {
  const webCrypto = typeof crypto !== 'undefined' ? crypto : null;
  if (!webCrypto || !webCrypto.subtle) {
    throw new Error('Web Crypto API not available');
  }

  const key = await getOrCreateKey();
  const combined = new Uint8Array(base64ToArrayBuffer(base64Ciphertext));

  if (combined.length < 12) {
    throw new Error('Invalid ciphertext payload');
  }

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decryptedBuffer = await webCrypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext.buffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}
