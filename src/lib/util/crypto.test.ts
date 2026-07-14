import { describe, it, expect } from 'vitest';
import { encryptSession, decryptSession } from './crypto';

describe('crypto session encryption', () => {
  it('should encrypt and decrypt strings successfully', async () => {
    const original = 'Hello, this is a test of session encryption for Curio AI!';
    const ciphertext = await encryptSession(original);
    
    // Ciphertext should be base64-encoded and not equal to plaintext
    expect(ciphertext).toBeTypeOf('string');
    expect(ciphertext.length).toBeGreaterThan(0);
    expect(ciphertext).not.toBe(original);
    
    const decrypted = await decryptSession(ciphertext);
    expect(decrypted).toBe(original);
  });

  it('should encrypt and decrypt JSON payloads successfully', async () => {
    const originalObj = {
      summary: { title: 'Chapter 1', overview: 'Introduction', starters: ['A', 'B'] },
      history: [{ id: 't1', role: 'user', text: 'Hi' }],
      turnCount: 1,
      spentUsd: 0.05,
    };
    
    const originalJson = JSON.stringify(originalObj);
    const ciphertext = await encryptSession(originalJson);
    const decryptedJson = await decryptSession(ciphertext);
    
    expect(decryptedJson).toBe(originalJson);
    expect(JSON.parse(decryptedJson)).toEqual(originalObj);
  });

  it('should throw error on invalid ciphertext input', async () => {
    // Too short / invalid Base64 input
    await expect(decryptSession('Short')).rejects.toThrow();
  });
});
