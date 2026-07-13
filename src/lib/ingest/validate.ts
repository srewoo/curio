import { INGEST_LIMITS } from '@/config/constants';

// File selection validation (PRD §6.2, §6.9). Reject at selection time with a
// specific reason — never silently drop.

export interface ValidationResult {
  readonly ok: boolean;
  readonly error?: string;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export function isAcceptedFile(file: File): boolean {
  const ext = extensionOf(file.name);
  return (INGEST_LIMITS.acceptedExtensions as readonly string[]).includes(ext);
}

export function validateSelection(files: readonly File[]): ValidationResult {
  if (files.length === 0) return { ok: false, error: 'Add at least one page.' };
  if (files.length > INGEST_LIMITS.maxFiles) {
    return { ok: false, error: `Up to ${INGEST_LIMITS.maxFiles} files at a time.` };
  }
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > INGEST_LIMITS.maxTotalBytes) {
    const mb = Math.round(INGEST_LIMITS.maxTotalBytes / (1024 * 1024));
    return { ok: false, error: `That's over the ${mb} MB total limit.` };
  }
  const bad = files.find((f) => !isAcceptedFile(f));
  if (bad) return { ok: false, error: `Can't read "${bad.name}". Use jpg, png, webp, pdf, docx, or txt.` };
  return { ok: true };
}

export function extensionCategory(file: File): 'image' | 'pdf' | 'docx' | 'txt' {
  const ext = extensionOf(file.name);
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'txt') return 'txt';
  return 'image';
}
