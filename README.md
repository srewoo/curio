# Curio — AI Chapter Tutor (Chrome Extension)

A private, grounded, age-appropriate AI tutor for a single chapter. Client-only
MV3 extension. See [`prd.md`](./prd.md) (v0.2) and [`trd.md`](./trd.md) for intent
and design; UI is derived from [`design/mockups.html`](./design/mockups.html).

## Quick start

```bash
npm install
npm run build        # tsc + vite build + fix reserved filenames + zip  →  dist/ and release/curio-<version>.zip
npm test             # vitest (pure-logic unit tests)
npm run dev          # vite dev server / HMR
```

`npm run build` produces two things: `dist/` (load unpacked for local testing) and
`release/curio-<version>.zip` (ready to upload to the Chrome Web Store). Store
listing assets (screenshots, promo tiles, suggested copy) live in
[`webstore/`](./webstore/README.md).

### Load the built extension in Chrome

1. `npm run build`
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the `dist/` folder.
4. Click the Curio toolbar icon → a maximized window opens (PRD §6.1).
5. First run: a grown-up pastes a provider API key (Anthropic / OpenAI / Gemini)
   — it is validated, then stored locally only.

## Architecture (TRD §3)

- **Popup page** (React + TS + Tailwind) owns **all** session state — chapter
  extracts, embeddings, vector store, chat. Destroyed on window close.
- **Service worker** is a **stateless broker**: attaches the API key (read from
  `chrome.storage.local`), applies retry/backoff, and returns results. Holds no
  chapter state (MV3 workers are evicted when idle).
- **Only egress:** the selected provider's HTTPS API + a one-time embedding-model
  weights fetch (cached in the browser, not bundled).

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

**Implemented & buildable:** full MV3 scaffold; three provider adapters (chat +
vision + key-validation) with `zod`-validated responses; local chunking; in-memory
cosine vector store; local embeddings via transformers.js **with an automatic
lexical fallback** if the neural model can't run under the extension CSP (so
retrieval never hard-fails); grounded prompt assembly with prompt-injection
neutralization (TRD D8); topic filter; conditional second-pass safety review
(TRD D6); inbound content-moderation gate; onboarding + key validation; a single
unified "AI model" picker; upload validation; ingest progress; grounded chat with
follow-ups; **Markdown + LaTeX (MathML) rendering with step-by-step math**;
puzzles every 5th turn; a **final graded assessment** (MCQ + short-answer, overall
score + rating/10 + feedback); an **adult minors-consent gate** with per-provider
ToS/privacy disclosures; per-session cost estimate + soft budget; real designed
icons; a Web Store zip on build; **chapter-boundary detection** (a multi-chapter
upload prompts a picker instead of blending chapters together); a **lightweight
arithmetic verifier** (mathjs) that flags — never silently rewrites — wrong
numeric equalities in tutor answers and caps assessment credit for a student's
own wrong calculation; a `webstore/` folder with real store screenshots + promo
tiles; and standalone `privacy.html` / `help.html` pages linked from the app
footer (opens in a new browser tab). 38 unit tests pass; typecheck + build clean.

**Known follow-ups (tracked in TRD §16/§17):**
- **Native token streaming.** The broker currently emits the full answer as one
  delta over the streaming Port; per-provider SSE streaming is a follow-up. The
  UI shows a "thinking…" state meanwhile.
- **Embeddings.** The ONNX WASM runtime is now **bundled in the extension**
  (`dist/ort/ort-wasm-simd.wasm`) instead of fetched from a CDN — removing the
  remote-wasm load MV3's CSP is most likely to block. Model weights come from
  `huggingface.co` (now declared in `host_permissions` + `connect-src`). The
  neural pipeline is **verified end-to-end** (model load + 384-d embeddings +
  sane retrieval, related 0.94 vs unrelated 0.35), with the lexical fallback
  still covering the rare no-SIMD/blocked case. A final in-panel confirmation is
  still worth doing. Bundling wasm puts `dist/` ~right at the 15 MB target (zip
  ~3.7 MB) — the self-imposed budget, not the Web Store limit.
- **Progress / retention (local-only).** Scores and weak-topic labels persist in
  `chrome.storage.local` (never content). Missed puzzles + low quiz answers seed
  weak topics that bias the next puzzle/quiz; Results shows a score delta vs. last
  time and "topics to review"; Upload lists recent chapters.
- **Math/diagrams.** LaTeX equations render (KaTeX→MathML) and the tutor solves
  step-by-step; rich generated **diagrams** (mermaid/SVG) are still a follow-up.
- **Minors-ToS legal review.** The product now captures adult consent + shows each
  provider's terms/privacy; the actual per-provider legal determination for
  processing minors' data (TRD O2) remains a human/legal task before launch.
- **PIN settings-lock** util exists (`src/lib/util/pin.ts`) but isn't wired into
  the Settings UI yet (PRD §6.8).
- **Network-loss resumability** during ingest (PRD §6.9): per-page failures are
  handled; whole-ingest resume is not.

## Privacy

Chapter content lives only in memory and is wiped on window close. The API key is
stored in `chrome.storage.local`, never synced, never placed in page state. Your
chosen LLM provider sees the chapter content and questions (disclosed at setup).
