import { useRef, useState } from 'react';
import { INGEST_LIMITS } from '@/config/constants';
import { estimateIngestCostUsd } from '@/lib/cost/budget';
import { validateSelection } from '@/lib/ingest/validate';
import { findModel, LANGUAGES } from '@/config/providers';
import { useCurio } from '@/state/store';
import { Brand } from '@/ui/components/Brand';
import { Icon } from '@/ui/components/Icon';

// Upload / empty state (mockup screen 1). Child-facing: just add pages.
export function Upload(): JSX.Element {
  const { settings, startIngest, recentProgress } = useCurio();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const langLabel = LANGUAGES.find((l) => l.code === settings.language)?.label ?? 'English';

  function handleFiles(list: FileList | null): void {
    if (!list) return;
    const files = Array.from(list);
    const result = validateSelection(files);
    if (!result.ok) {
      setError(result.error ?? 'Those files cannot be used.');
      return;
    }
    setError(null);
    const visionModel = findModel(settings.provider, settings.visionModel);
    const est = visionModel ? estimateIngestCostUsd(files.length, visionModel) : null;
    // Show the estimate implicitly via console for now; the ingest screen carries it.
    void est;
    void startIngest(files);
  }

  const accept = INGEST_LIMITS.acceptedExtensions.map((e) => `.${e}`).join(',');

  return (
    <div>
      <Brand tag={`Age ${settings.ageBand} · ${langLabel}`} />
      <h1 className="text-xl font-medium tracking-tight mb-1.5">What are we learning today?</h1>
      <p className="text-sm text-ink-2 leading-relaxed mb-5">
        Add up to {INGEST_LIMITS.maxFiles} pages of your chapter. Photos, PDFs, or docs — Curio reads them and becomes
        your tutor for that chapter only.
      </p>

      <div
        className={`rounded-xl border-[1.5px] border-dashed p-8 text-center bg-paper-2 ${dragging ? 'border-sage' : 'border-line-2'}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
      >
        <div className="text-[#8A8067] flex justify-center mb-2.5"><Icon name="upload" size={28} /></div>
        <div className="text-sm font-medium mb-1">Drop pages here or browse</div>
        <div className="text-xs text-ink-3">
          Up to {INGEST_LIMITS.maxFiles} files, {Math.round(INGEST_LIMITS.maxTotalBytes / (1024 * 1024))} MB total · jpg, png, pdf, docx
        </div>
        <div className="flex gap-2 justify-center mt-3.5">
          <button className="curio-btn curio-btn-primary" onClick={() => inputRef.current?.click()}>
            <Icon name="photo" size={14} /> Add pages
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-amber-ink mt-3">{error}</p>}

      {recentProgress.length > 0 && (
        <div className="mt-6">
          <div className="text-[11px] text-ink-3 uppercase tracking-wide mb-2">Your recent chapters</div>
          <div className="flex flex-col gap-1.5">
            {recentProgress.slice(0, 3).map((p) => {
              const last = p.attempts[p.attempts.length - 1];
              return (
                <div key={p.key} className="flex items-center justify-between text-sm bg-card border border-line rounded-lg px-3 py-2">
                  <span className="text-ink truncate">{p.title}</span>
                  <span className="text-ink-3 text-xs whitespace-nowrap ml-3">
                    {last ? `last score ${last.score}/100` : ''}
                    {p.weakTopics.length > 0 ? ` · ${p.weakTopics.length} to review` : ''}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-ink-3 mt-2">Re-upload a chapter to pick up where you left off — Curio will focus on what was tricky.</p>
        </div>
      )}

      <input ref={inputRef} type="file" multiple accept={accept} className="hidden" onChange={(e) => handleFiles(e.target.files)} />
    </div>
  );
}
