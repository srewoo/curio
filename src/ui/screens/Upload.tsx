import { useRef, useState, useEffect } from 'react';
import { INGEST_LIMITS } from '@/config/constants';
import { estimateIngestCostUsd } from '@/lib/cost/budget';
import { validateSelection } from '@/lib/ingest/validate';
import { findModel, LANGUAGES } from '@/config/providers';
import { useCurio } from '@/state/store';
import { Brand } from '@/ui/components/Brand';
import { Icon } from '@/ui/components/Icon';

// Upload / empty state (mockup screen 1). Child-facing: just add pages.
export function Upload(): JSX.Element {
  const { settings, startIngest, recentProgress, goToDashboard, loadChapterSession, renameChapter, deleteChapter } = useCurio();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [availableKeys, setAvailableKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(null).then((all) => {
        const keys = new Set<string>();
        for (const k of Object.keys(all)) {
          if (k.startsWith('curio.session.')) {
            keys.add(k.substring('curio.session.'.length));
          }
        }
        setAvailableKeys(keys);
      });
    }
  }, [recentProgress]);

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
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-ink-3 uppercase tracking-wide">Your recent chapters</span>
            <button 
              className="text-[11px] text-[#8A8067] hover:underline font-medium flex items-center gap-0.5 cursor-pointer"
              onClick={goToDashboard}
            >
              View Performance Dashboard &rarr;
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {recentProgress.slice(0, 5).map((p) => {
              const last = p.attempts[p.attempts.length - 1];
              const isEditing = editingKey === p.key;

              return (
                <div 
                  key={p.key} 
                  className={`flex items-center justify-between text-sm bg-card border border-line rounded-lg px-3 py-2 transition-all ${isEditing ? 'border-sage ring-1 ring-sage' : 'hover:border-sage cursor-pointer'}`}
                  onClick={() => {
                    if (!isEditing) {
                      if (availableKeys.has(p.key)) {
                        void loadChapterSession(p.key);
                      } else {
                        setError('This chapter was created under a previous version and its session data is not saved. Please upload the file again to study.');
                      }
                    }
                  }}
                >
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1 mr-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        className="curio-input flex-1 py-0.5 px-2 text-xs"
                        value={renameVal}
                        onChange={(e) => setRenameVal(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (renameVal.trim()) {
                              void renameChapter(p.key, renameVal.trim());
                            }
                            setEditingKey(null);
                          } else if (e.key === 'Escape') {
                            setEditingKey(null);
                          }
                        }}
                      />
                      <button 
                        className="text-sage-ink font-semibold text-xs hover:underline cursor-pointer"
                        onClick={() => {
                          if (renameVal.trim()) {
                            void renameChapter(p.key, renameVal.trim());
                          }
                          setEditingKey(null);
                        }}
                      >
                        Save
                      </button>
                      <button 
                        className="text-ink-3 text-xs hover:underline cursor-pointer"
                        onClick={() => setEditingKey(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-ink truncate font-medium flex-1">{p.title}</span>
                      <span className="text-ink-3 text-xs whitespace-nowrap ml-3 mr-4">
                        {last ? `last score ${last.score}/100` : ''}
                        {p.weakTopics.length > 0 ? ` · ${p.weakTopics.length} to review` : ''}
                        {!availableKeys.has(p.key) && <span className="text-amber-ink ml-1.5 font-medium">(re-upload to chat)</span>}
                      </span>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="text-ink-3 hover:text-ink cursor-pointer p-0.5"
                          title="Rename chapter"
                          onClick={() => {
                            setEditingKey(p.key);
                            setRenameVal(p.title);
                          }}
                        >
                          <Icon name="settings" size={13} />
                        </button>
                        <button
                          className="text-ink-3 hover:text-red-ink cursor-pointer p-0.5"
                          title="Delete chapter"
                          onClick={() => void deleteChapter(p.key)}
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-ink-3 mt-2">Click a chapter card to load it instantly, or use settings/trash to manage your library.</p>
        </div>
      )}

      <input ref={inputRef} type="file" multiple accept={accept} className="hidden" onChange={(e) => handleFiles(e.target.files)} />
    </div>
  );
}
