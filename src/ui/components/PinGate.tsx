import { useState } from 'react';
import { verifyPin } from '@/lib/util/pin';
import { Brand } from './Brand';

// Settings lock (PRD §6.8). A forgotten PIN can be reset only by also clearing
// the API key — so a child can't bypass the lock and keep using the tutor.
export function PinGate({
  pinHash,
  onUnlock,
  onCancel,
  onForgot,
}: {
  pinHash: string;
  onUnlock: () => void;
  onCancel: () => void;
  onForgot: () => Promise<void>;
}): JSX.Element {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmForgot, setConfirmForgot] = useState(false);

  async function submit(): Promise<void> {
    if (await verifyPin(pin, pinHash)) onUnlock();
    else {
      setError("That PIN didn't match.");
      setPin('');
    }
  }

  return (
    <div>
      <Brand title="Grown-ups only" tag="Enter the Settings PIN" icon="lock" />
      <div className="flex gap-2 max-w-xs">
        <input
          className="curio-input flex-1 font-mono tracking-[0.3em]"
          type="password"
          inputMode="numeric"
          autoFocus
          aria-label="Settings PIN"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
        />
        <button className="curio-btn curio-btn-primary" onClick={() => void submit()}>Unlock</button>
      </div>
      {error && <p className="text-sm text-amber-ink mt-2">{error}</p>}
      <div className="flex items-center gap-4 mt-6 text-xs">
        <button className="curio-btn" onClick={onCancel}>Back</button>
        {!confirmForgot ? (
          <button className="text-ink-3 hover:text-ink underline" onClick={() => setConfirmForgot(true)}>Forgot PIN?</button>
        ) : (
          <span className="flex items-center gap-2 text-ink-2">
            This removes the PIN <b>and the API key</b>.
            <button className="curio-btn py-1 px-2 text-xs" onClick={() => void onForgot()}>Reset</button>
            <button className="curio-btn py-1 px-2 text-xs" onClick={() => setConfirmForgot(false)}>Cancel</button>
          </span>
        )}
      </div>
    </div>
  );
}
