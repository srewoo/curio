import { describe, it, expect } from 'vitest';
import { verifyEquation, verifyMathInText, hasArithmeticError } from './verify';

describe('verifyEquation', () => {
  it('confirms correct arithmetic', () => {
    expect(verifyEquation('6 \\times 7 = 42')).toBe(true);
  });

  it('flags incorrect arithmetic', () => {
    expect(verifyEquation('6 \\times 7 = 43')).toBe(false);
  });

  it('handles fractions and division', () => {
    expect(verifyEquation('\\frac{1}{2} + \\frac{1}{4} = 0.75')).toBe(true);
  });

  it('handles square roots', () => {
    expect(verifyEquation('\\sqrt{16} = 4')).toBe(true);
    expect(verifyEquation('\\sqrt{16} = 5')).toBe(false);
  });

  it('handles exponents', () => {
    expect(verifyEquation('2^{10} = 1024')).toBe(true);
  });

  it('returns null (not verified) for algebra with an unknown', () => {
    expect(verifyEquation('2x + 3 = 7')).toBeNull();
  });

  it('returns null for non-equation or malformed input', () => {
    expect(verifyEquation('6 \\times 7')).toBeNull();
    expect(verifyEquation('a = b = c')).toBeNull();
  });

  it('tolerates thousand separators', () => {
    expect(verifyEquation('1,000 + 500 = 1500')).toBe(true);
  });
});

describe('verifyMathInText', () => {
  it('extracts and checks multiple equations from prose', () => {
    const text = 'First, $6 \\times 7 = 42$. Then $$10 - 3 = 6$$ which is wrong on purpose.';
    const results = verifyMathInText(text);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ ok: true });
    expect(results[1]).toMatchObject({ ok: false });
  });

  it('skips chemistry and algebra silently', () => {
    const text = 'The reaction is $\\ce{2H2 + O2 -> 2H2O}$ and here $2x + 3 = 7$.';
    expect(verifyMathInText(text)).toHaveLength(0);
  });
});

describe('hasArithmeticError', () => {
  it('is false when nothing checkable is wrong', () => {
    expect(hasArithmeticError('The answer is $6 \\times 7 = 42$.')).toBe(false);
  });

  it('is false when there is nothing to check (prose/algebra only)', () => {
    expect(hasArithmeticError('Solve for $x$ where $2x + 3 = 7$.')).toBe(false);
  });

  it('is true when a checkable equality is wrong', () => {
    expect(hasArithmeticError('So $6 \\times 7 = 43$, the final answer.')).toBe(true);
  });
});
