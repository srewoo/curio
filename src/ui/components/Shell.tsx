import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface ShellProps {
  readonly children: ReactNode;
  readonly onSettings?: () => void;
  readonly banner?: string | null;
}

// Window frame matching design/mockups.html (.frame/.win/.titlebar/.screen).
export function Shell({ children, onSettings, banner }: ShellProps): JSX.Element {
  return (
    <div className="min-h-full bg-shell py-10 px-5 print:bg-white print:p-0">
      <div className="max-w-[820px] mx-auto">
        <div className="bg-paper-2 rounded-2xl p-2.5 print:p-0 print:bg-white">
          <div className="bg-paper rounded-[10px] border border-line overflow-hidden print:border-0">
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-line bg-paper-3 print:hidden">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E8B4A6]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#E8D2A6]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#A6C7B4]" />
              </div>
              <span className="flex-1 text-center text-xs text-ink-3">Curio — chapter tutor</span>
              <div className="w-[42px] flex justify-end">
                {onSettings && (
                  <button
                    className="w-7 h-7 rounded-md flex items-center justify-center text-ink-3 hover:text-ink hover:bg-paper-2"
                    aria-label="Settings"
                    onClick={onSettings}
                  >
                    <Icon name="settings" size={15} />
                  </button>
                )}
              </div>
            </div>
            <div className="relative px-8 py-7 min-h-[340px]">
              {banner && (
                <div className="mb-4 rounded-lg border border-amber-ink/20 bg-amber-tint text-amber-ink text-sm px-3 py-2">
                  {banner}
                </div>
              )}
              {children}
            </div>
          </div>
        </div>
        <div className="print:hidden">
          <Footer />
        </div>
      </div>
    </div>
  );
}

// Links to standalone extension pages (privacy.html, help.html). Plain anchors
// with target="_blank" reliably open a new browser tab from this full window
// context (matches the ToS/privacy link pattern already used in Onboarding).
function Footer(): JSX.Element {
  return (
    <div className="flex items-center justify-center gap-4 mt-3 text-xs text-ink-3">
      <a href={chrome.runtime.getURL('help.html')} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
        Help
      </a>
      <span aria-hidden="true">·</span>
      <a href={chrome.runtime.getURL('privacy.html')} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
        Privacy Policy
      </a>
    </div>
  );
}
