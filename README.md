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
* **Learning engine** (`src/lib/mastery`): 4–8 key concepts extracted per chapter (fact / idea / skill) with flashcards; quiz questions and puzzles tagged by concept; a mastery score weighted toward recent answers that needs 3+ correct answers before "mastered"; spaced review on a fixed ladder per concept type; a toolbar badge for due reviews (`chrome.alarms`, built from due dates only, no chapter content).
* **Hint-first tutoring** (default for under-13s): guides homework with hints; shows the full worked solution after two tries or when asked. **Explain it back**: the child explains a concept in their own words and gets graded feedback. Missed quiz answers are labelled with why (forgot / mixed up / used it wrong / small slip).
* **Page citations** `[p. N]`: citations to pages that weren't retrieved are removed; clicking a chip opens the source passage.
* **Native token streaming** for all four providers (SSE). Ages at or below the second-pass safety gate still get the full answer only after review.
* **Read aloud** (`speechSynthesis`) and opt-in **voice input** (disclosed: Chrome sends audio to Google).
* **More inputs**: EPUB (TOC → chapters), PDFs read from their text layer (vision only for scanned pages, rendered lazily) with bookmarks → chapters, video/audio transcribed **on-device** with Whisper (transformers.js), and **"Learn from the page you were reading"** via `activeTab` + `scripting` (no host permissions).
* **Multi-chapter books**: pick a chapter before anything is read; the book is saved (encrypted) so any other chapter opens later without re-uploading. Library now lists every saved chapter (up to 20) plus books, with `unlimitedStorage`.
* **Export & report**: chat → Markdown study sheet; Dashboard → printable/PDF progress report.
* **Placement check**: on a new chapter, an optional one-question-per-concept check (with an honest "not sure" option) seeds mastery and the review schedule, so known material becomes review instead of teaching.
* **Optional web search** (Settings, off by default, PIN-protected): questions the chapter doesn't cover can be answered via the provider's built-in search tool — Anthropic `web_search_20250305`, OpenAI Responses `web_search`, Gemini `google_search`, OpenRouter `web` plugin. Labelled "From the web", sources shown (https only), same topic filter + second-pass safety, and a per-search fee estimate counted in the session budget.
* **Parent tools**: weekly summary + per-concept mastery bars on the Dashboard, an optional encrypted learner note, and the **Settings PIN lock** (forgot-PIN reset also clears the API key).
* **Tests**: 89 unit tests (`npm test`) and 10 end-to-end tests (`npm run test:e2e`) that drive the built extension in Chromium with the AI provider mocked (`e2e/mock-provider.ts`) — covering upload → streamed cited answer, placement, library, EPUB/PDF books, web search on/off, PIN lock, export, and page capture.

**Known follow-ups (tracked in TRD §16/§17):**
- **Review schedule** uses fixed intervals per concept type, not a fitted forgetting model (FSRS); `nextState` in `src/lib/mastery/scheduler.ts` is the only function that would need changing.
- **Network-loss resumability** during ingest (PRD §6.9): per-page failures are handled; whole-ingest resume is not.

## Privacy

Chapter content and history live encrypted in local storage, and can be manually cleared at any time via the "Discard" header button or the "Clear Assessment History" dashboard button. The API key is stored in `chrome.storage.local`, never synced, never placed in page state. Your chosen LLM provider sees the chapter content and questions (disclosed at setup).
