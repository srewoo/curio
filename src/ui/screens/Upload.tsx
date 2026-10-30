import { useRef, useState, useEffect } from 'react';
import { INGEST_LIMITS } from '@/config/constants';
import { estimateIngestCostUsd } from '@/lib/cost/budget';
import { validateSelection } from '@/lib/ingest/validate';
import { findModel, LANGUAGES } from '@/config/providers';
import { useCurio } from '@/state/store';
import { Brand } from '@/ui/components/Brand';
import { Icon } from '@/ui/components/Icon';
import { loadAllMastery } from '@/lib/mastery/store';
import { dueCards } from '@/lib/mastery/scheduler';
import { Library } from '@/ui/components/Library';

// Upload / empty state (mockup screen 1). Child-facing: just add pages.
export function Upload(): JSX.Element {
  const { settings, startIngest, recentProgress, startReview, capturableTab, startCapture } = useCurio();
  const [dueCount, setDueCount] = useState(0);

  useEffect(() => {
    void loadAllMastery().then((all) => setDueCount(dueCards(all, new Date()).length));
  }, [recentProgress]);
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
        Add your chapter — photos, a PDF or e-book, a document, or a lesson video. Curio reads it and becomes your tutor
        for that chapter only. Whole books work too: you pick the chapter.
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
          Up to {INGEST_LIMITS.maxFiles} files, {Math.round(INGEST_LIMITS.maxTotalBytes / (1024 * 1024))} MB total · photos, PDF, EPUB, Word, text, video, audio
        </div>
        <div className="flex gap-2 justify-center mt-3.5">
          <button className="curio-btn curio-btn-primary" onClick={() => inputRef.current?.click()}>
            <Icon name="photo" size={14} /> Add pages
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-amber-ink mt-3">{error}</p>}

      {capturableTab && (
        <button className="mt-3 w-full curio-card px-4 py-3 flex items-center gap-3 text-left hover:bg-paper-2" onClick={() => void startCapture()}>
          <span className="w-8 h-8 rounded-lg bg-paper-2 text-ink-2 flex items-center justify-center"><Icon name="file" size={16} /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium">Learn from the page you were reading</span>
            <span className="block text-xs text-ink-3 truncate">{capturableTab.title} · {new URL(capturableTab.url).hostname}</span>
          </span>
          <span className="text-sm text-[#0F6E56] font-medium">Import &rarr;</span>
        </button>
      )}

      {dueCount > 0 && (
        <button
          className="mt-5 w-full curio-card px-4 py-3 flex items-center gap-3 text-left hover:bg-paper-2"
          onClick={() => startReview(null)}
        >
          <span className="w-8 h-8 rounded-lg bg-sage text-sage-ink flex items-center justify-center"><Icon name="cards" size={16} /></span>
          <span className="flex-1">
            <span className="block text-sm font-medium">{dueCount} card{dueCount === 1 ? '' : 's'} ready to review</span>
            <span className="block text-xs text-ink-3">A quick review now helps you remember for longer.</span>
          </span>
          <span className="text-sm text-[#0F6E56] font-medium">Start &rarr;</span>
        </button>
      )}

      <Library />

      <input ref={inputRef} type="file" multiple accept={accept} className="hidden" onChange={(e) => handleFiles(e.target.files)} />
    </div>
  );
}
