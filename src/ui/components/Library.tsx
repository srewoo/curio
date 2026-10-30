import { useCallback, useEffect, useState } from 'react';
import { useCurio } from '@/state/store';
import { listSavedSessions, type SavedSessionInfo } from '@/lib/storage/session-store';
import { deleteBook, listBooks, type BookInfo } from '@/lib/books/store';
import { Icon } from './Icon';

interface Entry {
  readonly key: string;
  readonly title: string;
  readonly saved: boolean; // has a session to reopen
  readonly bookKey?: string;
  readonly lastScore?: number;
  readonly toReview: number;
}

// Saved chapters (any chapter studied, quiz or not) plus saved books.
export function Library(): JSX.Element | null {
  const { recentProgress, goToDashboard, loadChapterSession, renameChapter, deleteChapter, openBookChapters } = useCurio();
  const [sessions, setSessions] = useState<SavedSessionInfo[]>([]);
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void listSavedSessions().then(setSessions);
    void listBooks().then(setBooks);
  }, []);
  useEffect(refresh, [recentProgress, refresh]);

  const progress = new Map(recentProgress.map((p) => [p.key, p]));
  const entries: Entry[] = [
    ...sessions.map((s) => {
      const p = progress.get(s.key);
      return { key: s.key, title: s.title ?? p?.title ?? s.key, saved: true, bookKey: s.bookKey, lastScore: p?.attempts.at(-1)?.score, toReview: p?.weakTopics.length ?? 0 };
    }),
    ...recentProgress
      .filter((p) => !sessions.some((s) => s.key === p.key))
      .map((p) => ({ key: p.key, title: p.title, saved: false, lastScore: p.attempts.at(-1)?.score, toReview: p.weakTopics.length })),
  ];
  if (entries.length === 0 && books.length === 0) return null;

  function commitRename(key: string): void {
    if (renameVal.trim()) void renameChapter(key, renameVal.trim()).then(refresh);
    setEditingKey(null);
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-ink-3 uppercase tracking-wide">Your library</span>
        <button className="text-[11px] text-[#8A8067] hover:underline font-medium" onClick={goToDashboard}>
          View Performance Dashboard &rarr;
        </button>
      </div>

      {books.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {books.map((b) => (
            <span key={b.key} className="inline-flex items-center gap-1.5 text-xs bg-sage-tint text-[#0F6E56] rounded-full pl-3 pr-1.5 py-1">
              <button className="hover:underline" onClick={() => void openBookChapters(b.key)} title="Pick a chapter from this book">
                📚 {b.title} · {b.chapters} chapters
              </button>
              <button className="text-ink-3 hover:text-red-ink" aria-label={`Remove book ${b.title}`} onClick={() => void deleteBook(b.key).then(refresh)}>
                <Icon name="trash" size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5 max-h-[320px] overflow-y-auto pr-1">
        {entries.map((e) => (
          <div
            key={e.key}
            className={`flex items-center justify-between text-sm bg-card border border-line rounded-lg px-3 py-2 ${editingKey === e.key ? 'border-sage ring-1 ring-sage' : 'hover:border-sage cursor-pointer'}`}
            onClick={() => {
              if (editingKey === e.key) return;
              if (e.saved) void loadChapterSession(e.key);
              else setNotice('This chapter was studied before chapters were saved — upload it again to keep studying.');
            }}
          >
            {editingKey === e.key ? (
              <div className="flex items-center gap-2 flex-1 mr-2" onClick={(ev) => ev.stopPropagation()}>
                <input
                  className="curio-input flex-1 py-0.5 px-2 text-xs"
                  aria-label="New chapter name"
                  value={renameVal}
                  onChange={(ev) => setRenameVal(ev.target.value)}
                  autoFocus
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter') commitRename(e.key);
                    else if (ev.key === 'Escape') setEditingKey(null);
                  }}
                />
                <button className="text-sage-ink font-semibold text-xs hover:underline" onClick={() => commitRename(e.key)}>Save</button>
                <button className="text-ink-3 text-xs hover:underline" onClick={() => setEditingKey(null)}>Cancel</button>
              </div>
            ) : (
              <>
                <span className="text-ink truncate font-medium flex-1">{e.title}</span>
                <span className="text-ink-3 text-xs whitespace-nowrap ml-3 mr-3">
                  {e.lastScore !== undefined ? `last score ${e.lastScore}/100` : ''}
                  {e.toReview > 0 ? ` · ${e.toReview} to review` : ''}
                  {!e.saved && <span className="text-amber-ink ml-1.5 font-medium">(re-upload to chat)</span>}
                </span>
                <div className="flex items-center gap-2" onClick={(ev) => ev.stopPropagation()}>
                  {e.bookKey && (
                    <button className="text-ink-3 hover:text-ink p-0.5" title="Other chapters in this book" aria-label="Other chapters in this book" onClick={() => void openBookChapters(e.bookKey!)}>
                      <Icon name="book" size={13} />
                    </button>
                  )}
                  <button className="text-ink-3 hover:text-ink p-0.5" title="Rename chapter" aria-label={`Rename ${e.title}`} onClick={() => { setEditingKey(e.key); setRenameVal(e.title); }}>
                    <Icon name="settings" size={13} />
                  </button>
                  <button className="text-ink-3 hover:text-red-ink p-0.5" title="Delete chapter" aria-label={`Delete ${e.title}`} onClick={() => void deleteChapter(e.key).then(refresh)}>
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {notice && <p className="text-xs text-amber-ink mt-2">{notice}</p>}
    </div>
  );
}
