# Curio — AI Chapter Tutor (Chrome Extension)

A private, grounded, age-appropriate AI tutor for a single chapter. Client-only MV3 extension. See [`prd.md`](./prd.md) (v0.2) and [`trd.md`](./trd.md) for intent and design; UI is derived from [`design/mockups.html`](./design/mockups.html).

## Quick start

```bash
npm install
npm run build        # tsc + vite build + fix reserved filenames + zip  →  dist/ and release/curio-<version>.zip
npm test             # vitest (pure-logic unit tests)
npm run dev          # vite dev server / HMR
```

`npm run build` produces two things: `dist/` (load unpacked for local testing) and `release/curio-<version>.zip` (ready to upload to the Chrome Web Store). Store listing assets (screenshots, promo tiles, suggested copy) live in [`webstore/`](./webstore/README.md).

### Load the built extension in Chrome

1. `npm run build`
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the `dist/` folder.
4. Click the Curio toolbar icon → a maximized window opens (PRD §6.1).
5. First run: a grown-up pastes a provider API key (Anthropic / OpenAI / Gemini / OpenRouter) — it is validated, then stored locally only.

## Architecture (TRD §3)

- **Popup page** (React + TS + Tailwind) owns **all** session state — chapter extracts, embeddings, vector store, chat.
- **Encrypted Local Storage**: Session data is automatically serialized, encrypted using browser-native `AES-GCM-256`, and saved in `chrome.storage.local` to survive popup closures.
- **Service worker** is a **stateless broker**: attaches the API key (read from `chrome.storage.local`), applies retry/backoff, and returns results. Holds no chapter state (MV3 workers are evicted when idle).
- **Only egress:** the selected provider's HTTPS API + a one-time embedding-model weights fetch (cached in the browser, not bundled).

### Source map

| Area | Path |
|------|------|
| Types / config | `src/types`, `src/config` |
| Settings + key storage | `src/lib/storage` |
| Provider adapters (D7) | `src/lib/llm` |
| Ingestion (readers, vision, moderation, pipeline) | `src/lib/ingest` |
| Indexing (chunk, embeddings, vector store) | `src/lib/index` |
| RAG (prompt, sanitize/D8, retriever) | `src/lib/rag` |
| Safety (system prompt, topic filter, 2nd-pass) | `src/lib/safety` |
| Cost / budget | `src/lib/cost` |
| UI screens | `src/ui/screens`, `src/state/store.tsx` |
| Service worker | `src/background/service-worker.ts` |

## Status — what's real vs. follow-up

**Implemented & buildable:**
* **MV3 Scaffold**: Client-side extension skeleton designed for child-safe education.
* **Provider Adapters**: OpenAI, Anthropic, Gemini, and **OpenRouter** API key integrations with full text + vision capabilities.
* **Local In-Browser RAG**: Cosine vector store, chunking, and local vector embeddings using transformers.js **with automatic lexical fallback** if SIMD/WASM is disabled under Chrome CSP.
* **Encrypted Session Resiliency & Chapter Library**: Native AES-GCM-256 local storage encryption. Saves up to 5 concurrent chapter summaries, vector chunks, chat histories, and budgets. Click any card in the library list to restore its state instantly, or use inline controls to rename or delete chapters from local storage.
* **Encrypted Performance Dashboard**: Visualizes assessment attempt histories over time using custom lightweight SVG progression sparklines, tracking score gains and weak-to-strong subject review lists.
* **Interactive SVG & Mermaid Diagrams**: Lazily parses Mermaid flowchart markdown blocks and compiles custom responsive SVGs dynamically inside user chats to plot water cycles, geometry, coordinate planes, and math concepts.
* **Math & LaTeX Integrity**: KaTeX MathML native rendering (saving bundle space) backed by a local `mathjs` **arithmetic verifier** that flags tutor math slips and limits assessment credit for invalid student calculations.
* **Child Safety Measures**: Pre-filter RegExp blockages, dynamic age-based system prompting (under 9, 10-13, 14+), parental minors-consent screens, prompt-injection sanitization, and secondary LLM safety checks.
* **Multi-chapter split detection** and ingest progress meters.
* **38 unit tests pass**; typecheck + build clean.

**Known follow-ups (tracked in TRD §16/§17):**
- **Native token streaming.** The broker currently emits the full answer as one delta over the streaming Port; per-provider SSE streaming is a follow-up. The UI shows a "thinking…" state meanwhile.
- **PIN settings-lock** util exists (`src/lib/util/pin.ts`) but isn't wired into the Settings UI yet (PRD §6.8).
- **Network-loss resumability** during ingest (PRD §6.9): per-page failures are handled; whole-ingest resume is not.

## Privacy

Chapter content and history live encrypted in local storage, and can be manually cleared at any time via the "Discard" header button or the "Clear Assessment History" dashboard button. The API key is stored in `chrome.storage.local`, never synced, never placed in page state. Your chosen LLM provider sees the chapter content and questions (disclosed at setup).
