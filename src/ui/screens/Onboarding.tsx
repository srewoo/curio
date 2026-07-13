import { useState } from 'react';
import { AGE_BANDS, LANGUAGES, PROVIDERS, defaultUnifiedModelId, unifiedModels, type ProviderId } from '@/config/providers';
import { DEFAULT_SETTINGS, type Settings } from '@/types/settings';
import { setApiKey, clearApiKey } from '@/lib/storage/settings-store';
import { callBroker } from '@/lib/llm/client';
import { useCurio } from '@/state/store';
import { Brand } from '@/ui/components/Brand';

// Adult-facing first-run setup (PRD §6.8). A grown-up provides the key; the
// child never sees this screen once a key is set.
export function Onboarding(): JSX.Element {
  const { saveSettings } = useCurio();
  const [provider, setProvider] = useState<ProviderId>(DEFAULT_SETTINGS.provider);
  const [textModel, setTextModel] = useState<string>(defaultUnifiedModelId(DEFAULT_SETTINGS.provider));
  const [key, setKey] = useState('');
  const [age, setAge] = useState<number>(DEFAULT_SETTINGS.ageBand);
  const [language, setLanguage] = useState(DEFAULT_SETTINGS.language);
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spec = PROVIDERS[provider];

  function pickProvider(id: ProviderId): void {
    setProvider(id);
    setTextModel(defaultUnifiedModelId(id)); // reset to the provider's default model
    setConsented(false); // consent is provider-specific — re-confirm
  }

  async function finish(): Promise<void> {
    setError(null);
    if (key.trim().length < 8) {
      setError('Please paste a valid API key.');
      return;
    }
    if (!consented) {
      setError('Please confirm you consent as the parent or teacher to continue.');
      return;
    }
    setBusy(true);
    try {
      await setApiKey(key.trim());
      const next: Settings = {
        ...DEFAULT_SETTINGS,
        provider,
        ageBand: age,
        language,
        textModel,
        visionModel: textModel, // one model handles both text + vision
        consent: { provider, acceptedAt: new Date().toISOString() },
      };
      // Validate the key with a cheap no-content ping before completing (PRD §6.8).
      const res = await callBroker({ kind: 'validateKey', provider, model: next.textModel });
      if (!res.ok) {
        await clearApiKey();
        setError(res.error.code === 'invalid_key' ? 'That key was rejected by the provider.' : 'Could not verify the key. Check your connection and try again.');
        return;
      }
      await saveSettings(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Brand tag="A grown-up sets this up once" />
      <h1 className="text-xl font-medium tracking-tight mb-1.5">Welcome to Curio</h1>
      <p className="text-sm text-ink-2 leading-relaxed mb-5">
        Curio becomes a private tutor for one chapter at a time. A parent or teacher adds an AI key once — it stays on
        this device and is only used with the provider you choose. Your chapter and questions are sent to that provider;
        nothing is stored on our servers.
      </p>

      <div className="curio-card p-5 space-y-4">
        <Field label="AI provider" hint="Your key stays on this device.">
          <select className="curio-input min-w-[180px]" value={provider} onChange={(e) => pickProvider(e.target.value as ProviderId)}>
            {Object.values(PROVIDERS).map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </Field>

        <Field label="AI model" hint="Reads your chapter and answers questions. Newer is better.">
          <select className="curio-input min-w-[180px]" value={textModel} onChange={(e) => setTextModel(e.target.value)}>
            {unifiedModels(provider).map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </Field>

        <Field label="API key" hint={<a className="text-[#0F6E56] underline" href={spec.getKeyUrl} target="_blank" rel="noreferrer">Where do I get a key?</a>}>
          <input
            className="curio-input font-mono min-w-[220px]"
            type="password"
            placeholder="sk-…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </Field>

        <Field label="Child's age" hint="Curio matches its words to this age.">
          <div className="flex gap-1.5 flex-wrap justify-end">
            {AGE_BANDS.filter((a) => a >= 6 && a <= 16).map((a) => (
              <button key={a} className={a === age ? 'curio-pill curio-pill-on' : 'curio-pill'} onClick={() => setAge(a)}>{a}</button>
            ))}
          </div>
        </Field>

        <Field label="Language" hint="Chat and puzzles use this language.">
          <select className="curio-input min-w-[160px]" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <label className="flex items-start gap-2.5 mt-5 text-xs text-ink-2 leading-relaxed cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 accent-[#5DCAA5]"
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
        />
        <span>
          I'm the parent or teacher, and I consent to <b>{spec.label}</b> processing my child's uploaded
          chapter and questions to provide tutoring. I've reviewed their{' '}
          <a className="text-[#0F6E56] underline" href={spec.tosUrl} target="_blank" rel="noreferrer">terms</a> and{' '}
          <a className="text-[#0F6E56] underline" href={spec.privacyUrl} target="_blank" rel="noreferrer">privacy policy</a>.
          Curio itself stores nothing on our servers.
        </span>
      </label>

      {error && <p className="text-sm text-amber-ink mt-3">{error}</p>}

      <div className="flex justify-end mt-5">
        <button className="curio-btn curio-btn-primary" disabled={busy || !consented} onClick={() => void finish()}>
          {busy ? 'Checking key…' : 'Start learning'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-5">
      <div>
        <div className="text-sm text-ink">{label}</div>
        {hint && <div className="text-xs text-ink-3 mt-0.5">{hint}</div>}
      </div>
      <div className="flex justify-end">{children}</div>
    </div>
  );
}
