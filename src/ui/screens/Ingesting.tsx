import type { IngestPhase, IngestProgress } from '@/lib/ingest/pipeline';
import { useCurio } from '@/state/store';
import { Brand } from '@/ui/components/Brand';
import { Icon, type IconName } from '@/ui/components/Icon';

// Ingest progress (mockup screen 2). Three steps in the order the pipeline
// actually runs them: read pages, prepare the reader (embedder warm-up),
// build tutor (chunk + embed). Maps to the pipeline's phases.
const STEPS: { key: IngestPhase; label: string; icon: IconName }[] = [
  { key: 'opening', label: 'Opening your files', icon: 'file' },
  { key: 'reading', label: 'Reading pages', icon: 'check' },
  { key: 'preparing', label: 'Preparing the reader', icon: 'eye' },
  { key: 'indexing', label: 'Building tutor', icon: 'clock' },
];

// Transcribing replaces "opening" for recordings (shown under the same row).
const ORDER: Record<IngestPhase, number> = { opening: 0, transcribing: 0, reading: 1, preparing: 2, indexing: 3 };
const LABEL_OVERRIDE: Partial<Record<IngestPhase, string>> = { transcribing: 'Listening to the recording' };

export function Ingesting(): JSX.Element {
  const { ingestProgress } = useCurio();
  const p: IngestProgress = ingestProgress ?? { phase: 'opening', done: 0, total: 1 };
  const current = ORDER[p.phase];

  return (
    <div>
      <Brand tag="Reading your chapter…" />
      <h1 className="text-xl font-medium tracking-tight mb-1.5">Building your tutor</h1>
      <p className="text-sm text-ink-2 leading-relaxed mb-5">
        Curio is reading your pages and building the tutor. This takes about a minute — longer for recordings, which
        are transcribed privately on this device.
      </p>

      <div className="flex flex-col gap-3 mt-4">
        {STEPS.map((step, i) => {
          const state = i < current ? 'done' : i === current ? 'active' : 'queued';
          const pct = state === 'done' ? 100 : state === 'active' ? Math.round((p.done / Math.max(p.total, 1)) * 100) : 0;
          return (
            <div key={step.key} className="flex items-center gap-3 text-sm">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${badge(state)}`}>
                <Icon name={step.icon} size={12} />
              </div>
              <div className="text-ink min-w-[170px]">{i === current ? LABEL_OVERRIDE[p.phase] ?? step.label : step.label}</div>
              <div className="flex-1 h-1 bg-[#EAE4D2] rounded overflow-hidden">
                <div className="h-full bg-sage transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-xs text-ink-3 ml-auto">
                {state === 'queued' ? 'queued' : state === 'done' ? 'done' : `${p.done} of ${p.total}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function badge(state: 'done' | 'active' | 'queued'): string {
  if (state === 'done') return 'bg-sage-tint text-[#0F6E56]';
  if (state === 'active') return 'bg-amber-tint text-amber-ink';
  return 'bg-[#F1EFE8] text-[#888780]';
}
