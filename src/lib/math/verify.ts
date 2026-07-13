import { evaluate } from 'mathjs';

// Lightweight arithmetic verifier. The tutor's step-by-step math (system-prompt.ts)
// is still LLM-generated prose, not a symbolic solver — this catches the failure
// mode where the LLM states a numeric equality that is simply wrong (e.g. a slipped
// "6 * 7 = 43"). It only judges PURE NUMERIC identities; anything containing an
// unknown (e.g. "2x + 3 = 7") is left unverified rather than guessed at, so we
// never produce a false "wrong" on genuine algebra.

const EPS_ABS = 1e-6;
const EPS_REL = 1e-4;

const KNOWN_TOKENS = /\b(sqrt|sin|cos|tan|asin|acos|atan|log|ln|exp|abs|pi|e)\b/g;

function latexToMathJs(expr: string): string {
  return expr
    .replace(/\\left|\\right/g, '')
    .replace(/\\cdot/g, '*')
    .replace(/\\times/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\frac\s*{([^{}]+)}\s*{([^{}]+)}/g, '($1)/($2)')
    .replace(/\\sqrt\s*{([^{}]+)}/g, 'sqrt($1)')
    .replace(/\^\s*{([^{}]+)}/g, '^($1)')
    .replace(/\\pi/g, 'pi')
    .replace(/\\%/g, '/100')
    .replace(/(\d),(?=\d{3}(\D|$))/g, '$1') // strip thousand separators like 1,000
    .trim();
}

function containsUnknown(mathJsExpr: string): boolean {
  const stripped = mathJsExpr.replace(KNOWN_TOKENS, '');
  return /[a-zA-Z]/.test(stripped);
}

// Verify a single "LHS = RHS" LaTeX snippet. Returns true/false when both sides
// are pure numeric expressions, or null when it can't be judged (contains an
// unknown, has zero/multiple '=' signs, or fails to parse).
export function verifyEquation(latex: string): boolean | null {
  const parts = latex.split('=');
  if (parts.length !== 2) return null;
  const lhs = latexToMathJs(parts[0]!);
  const rhs = latexToMathJs(parts[1]!);
  if (containsUnknown(lhs) || containsUnknown(rhs)) return null;
  try {
    const lv = evaluate(lhs);
    const rv = evaluate(rhs);
    if (typeof lv !== 'number' || typeof rv !== 'number' || !Number.isFinite(lv) || !Number.isFinite(rv)) return null;
    return Math.abs(lv - rv) <= Math.max(EPS_ABS, Math.abs(rv) * EPS_REL);
  } catch {
    return null;
  }
}

export interface MathVerification {
  readonly expression: string;
  readonly ok: boolean;
}

// Extract $...$ / $$...$$ segments and verify any pure-numeric equalities found.
// Segments that can't be judged (algebra, chemistry, non-equations) are omitted
// — this function reports only on claims it can actually check.
export function verifyMathInText(text: string): MathVerification[] {
  const results: MathVerification[] = [];
  const mathRegex = /\$\$([\s\S]+?)\$\$|(?<!\\)\$([^\n$]+?)(?<!\\)\$/g;
  let m: RegExpExecArray | null;
  while ((m = mathRegex.exec(text))) {
    const expr = (m[1] ?? m[2] ?? '').trim();
    if (!expr.includes('=') || expr.includes('\\ce')) continue;
    const verified = verifyEquation(expr);
    if (verified !== null) results.push({ expression: expr, ok: verified });
  }
  return results;
}

// True only when at least one checkable equality was found and is wrong. Silent
// (returns false) when nothing checkable is present — we never flag algebra or
// prose as an "error" just because we can't evaluate it.
export function hasArithmeticError(text: string): boolean {
  return verifyMathInText(text).some((r) => !r.ok);
}
