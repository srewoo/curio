import { useState } from 'react';
import { AGE_BANDS, LANGUAGES, PROVIDERS, coerceUnifiedModelId, defaultUnifiedModelId, unifiedModels, type ProviderId } from '@/config/providers';
import type { Settings as SettingsModel } from '@/types/settings';
import { clearApiKey, setApiKey } from '@/lib/storage/settings-store';
import { callBroker } from '@/lib/llm/client';
import { useCurio } from '@/state/store';
import { Brand } from '@/ui/components/Brand';
import { PinGate } from '@/ui/components/PinGate';
import { effectiveTutorMode, type TutorMode } from '@/types/settings';
import { hashPin } from '@/lib/util/pin';
import { LEARNER_NOTE_MAX } from '@/lib/profile/store';

// Settings (mockup screen 5). Age, language, provider, models, API key.
export function Settings(): JSX.Element {
  const { settings, saveSettings, closeSettings, clearChapter, learnerNote, saveLearnerNote } = useCurio();
  const [unlocked, setUnlocked] = useState(!settings.pinHash);
  const [note, setNote] = useState(learnerNote);
  const [newPin, setNewPin] = useState('');
  // One model drives both text + vision; coerce any older text-only saved value.
  const [draft, setDraft] = useState<SettingsModel>(() => {
    const model = coerceUnifiedModelId(settings.provider, settings.textModel);
    return { ...settings, textModel: model, visionModel: model };
  });
  const [newKey, setNewKey] = useState('');
  const [reConsented, setReConsented] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const spec = PROVIDERS[draft.provider];
  const providerLabel = spec.label;
  // Consent is provider-specific — a provider switch requires re-confirmation.
  const needsConsent = draft.provider !== settings.consent?.provider;

  function update(patch: Partial<SettingsModel>): void {
    setDraft((d) => ({ ...d, ...patch }));
  }

  function pickModel(id: string): void {
    update({ textModel: id, visionModel: id }); // same model reads photos + answers
  }

  function pickProvider(id: ProviderId): void {
    const model = defaultUnifiedModelId(id);
    update({ provider: id, textModel: model, visionModel: model });
  }

  async function save(): Promise<void> {
    setStatus(null);
    if (newPin && !/^\d{4,6}$/.test(newPin)) {
      setStatus('The PIN must be 4 to 6 digits.');
      return;
    }
    if (needsConsent && !reConsented) {
      setStatus(`Please confirm consent for ${providerLabel} before saving.`);
      return;
    }
    if (newKey.trim().length >= 8) {
      await setApiKey(newKey.trim());
      const res = await callBroker({ kind: 'validateKey', provider: draft.provider, model: draft.textModel });
      if (!res.ok) {
        setStatus(res.error.code === 'invalid_key' ? 'That key was rejected.' : 'Could not verify the key.');
        return;
      }
      setNewKey('');
    }
    const consent = needsConsent
      ? { provider: draft.provider, acceptedAt: new Date().toISOString() }
      : settings.consent;
    const pinHash = newPin ? await hashPin(newPin) : draft.pinHash;
    if (note !== learnerNote) await saveLearnerNote(note);
    await saveSettings({ ...draft, consent, pinHash });
  }

  async function forgotPin(): Promise<void> {
    await clearApiKey();
    await saveSettings({ ...settings, pinHash: undefined });
  }

  if (!unlocked && settings.pinHash) {
    return <PinGate pinHash={settings.pinHash} onUnlock={() => setUnlocked(true)} onCancel={closeSettings} onForgot={forgotPin} />;
  }

  const mode = effectiveTutorMode(draft);
  const modeLabel: Record<TutorMode, string> = { hints: 'Hints first', explain: 'Full answers' };

  return (
    <div>
      <Brand title="Settings" tag="Saved on this device only" icon="settings" />

      <Row label="Age" hint="Curio will match its words to this age.">
        <div className="flex gap-1.5 flex-wrap justify-end">
          {AGE_BANDS.filter((a) => a >= 6 && a <= 16).map((a) => (
            <button key={a} className={a === draft.ageBand ? 'curio-pill curio-pill-on' : 'curio-pill'} onClick={() => update({ ageBand: a })}>{a}</button>
          ))}
        </div>
      </Row>

      <Row label="Language" hint="Chat and puzzles will be in this language.">
        <select className="curio-input min-w-[160px]" value={draft.language} onChange={(e) => update({ language: e.target.value })}>
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </Row>

      <Row label="Tutor style" hint={mode === 'hints' ? 'Guides homework with hints; shows the full answer after two tries or when asked.' : 'Explains and solves problems fully, step by step.'}>
        <div className="flex gap-1.5">
          {(['hints', 'explain'] as const).map((m) => (
            <button key={m} className={m === mode ? 'curio-pill curio-pill-on' : 'curio-pill'} onClick={() => update({ tutorMode: m })}>{modeLabel[m]}</button>
          ))}
        </div>
      </Row>

      <Row label="Voice input" hint="Speak questions instead of typing. Chrome sends the voice recording to Google to turn it into text.">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="accent-[#5DCAA5]" checked={draft.voiceInput ?? false} onChange={(e) => update({ voiceInput: e.target.checked })} />
          Allow
        </label>
      </Row>

      <Row label="Web search" hint="When a question isn't in the chapter, search the web through your AI provider. Answers are labelled and list their sources. Each search adds a small provider fee.">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="accent-[#5DCAA5]" checked={draft.webSearch ?? false} onChange={(e) => update({ webSearch: e.target.checked })} />
          Allow
        </label>
      </Row>

      <div className="py-3.5 border-b border-line">
        <div className="text-sm text-ink">About your child <span className="text-ink-3">(optional)</span></div>
        <div className="text-xs text-ink-3 mt-0.5 mb-2">
          Helps Curio pick examples and pace — e.g. "loves football, finds long paragraphs hard". Please don't include names or school. Encrypted on this device.
        </div>
        <textarea
          className="curio-input w-full min-h-[64px]"
          maxLength={LEARNER_NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <Row label="Settings PIN" hint={settings.pinHash ? 'Settings are locked. Enter a new PIN to change it.' : 'Lock Settings so only a grown-up can change them.'}>
        <div className="flex gap-2 items-center">
          <input
            className="curio-input font-mono w-[120px]"
            type="password"
            inputMode="numeric"
            placeholder="4–6 digits"
            aria-label="New settings PIN"
            maxLength={6}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
          />
          {draft.pinHash && (
            <button className="curio-btn" onClick={() => update({ pinHash: undefined })}>Remove</button>
          )}
        </div>
      </Row>

      <Row label="Model provider" hint="Your key stays on this device.">
        <select className="curio-input min-w-[160px]" value={draft.provider} onChange={(e) => pickProvider(e.target.value as ProviderId)}>
          {Object.values(PROVIDERS).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </Row>

      <Row label="AI model" hint="Reads your chapter photos and answers questions.">
        <select className="curio-input min-w-[160px]" value={draft.textModel} onChange={(e) => pickModel(e.target.value)}>
          {unifiedModels(draft.provider).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </Row>

      <Row label="API key" hint={`Lets Curio use your ${providerLabel} account. It stays on this device and is sent only to ${providerLabel} — never to us.`}>
        <div className="flex gap-2">
          <input className="curio-input font-mono min-w-[200px]" type="password" placeholder="Paste a new key to replace" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
          <button className="curio-btn" onClick={() => void clearApiKey()}>Clear key</button>
        </div>
      </Row>

      {needsConsent && (
        <label className="flex items-start gap-2.5 mt-4 text-xs text-ink-2 leading-relaxed cursor-pointer">
          <input type="checkbox" className="mt-0.5 accent-[#5DCAA5]" checked={reConsented} onChange={(e) => setReConsented(e.target.checked)} />
          <span>
            I consent to <b>{providerLabel}</b> processing my child's chapter and questions. I've reviewed their{' '}
            <a className="text-[#0F6E56] underline" href={spec.tosUrl} target="_blank" rel="noreferrer">terms</a> and{' '}
            <a className="text-[#0F6E56] underline" href={spec.privacyUrl} target="_blank" rel="noreferrer">privacy policy</a>.
          </span>
        </label>
      )}

      {status && <p className="text-sm text-amber-ink mt-3">{status}</p>}

      <div className="flex justify-between items-center mt-6">
        <button className="curio-btn" onClick={clearChapter}>Clear chapter</button>
        <div className="flex gap-2">
          <button className="curio-btn" onClick={closeSettings}>Cancel</button>
          <button className="curio-btn curio-btn-primary" onClick={() => void save()}>Save</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-5 py-3.5 border-b border-line last:border-0">
      <div>
        <div className="text-sm text-ink">{label}</div>
        <div className="text-xs text-ink-3 mt-0.5">{hint}</div>
      </div>
      <div className="flex justify-end">{children}</div>
    </div>
  );
}
