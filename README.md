# ForkGPT

https://forkgpt.vercel.app/

A tiny, scrappy chat playground. It’s like ChatGPT, but with a superpower: a right‑side Reply Viewer where you can follow multiple what‑ifs without wrecking your main thread. And allows you to branch, nest, and curate which answers should count as context for future messages. 

## What It Is
- Chat UI for exploring ideas and questions - to any depths.
- Branch replies on the right, keep your main chat tidy on the left.
- Decide which assistant answers influence future responses with an “Include in context” toggle.

## The Point   
- Compare alternate answers side‑by‑side, keep only the replies you *want* in memory.
- Curate context explicitly instead of hoping the model guesses what to remember.
- Keep conversations neat while you explore deep rabbit holes in parallel.

## Highlights
- Reply Viewer: clean nesting, collapsible nodes, subtle indent guides.
- Session settings: temperature slider and model-aware reasoning controls (values depend on the selected model/provider).
- Local persistence: your sessions live in your browser profile.
- Safer keys: encrypt your API key at rest with a password; unlock per reload. The key stays in memory only after you unlock.
- Streams model responses by default.
- Supports Web Search, Attachments (including images and PDFs).

## Supported Models
- OpenAI: `gpt-5.2`, `gpt-5.2-codex`, `o3`
- Anthropic: `claude-opus-4.6`, `claude-sonnet-4.6`
- Google Gemini: `gemini-3-pro-preview`
- Moonshot: `kimi-2.5` (API model `kimi-k2.5`)

## Privacy & Security
- Where data lives: `localStorage` for chat data (per‑origin, per‑profile).
- API key storage: encrypted in `localStorage` with a password you set; decrypted only in memory after you unlock. This helps against casual inspection, but if a tab is compromised (XSS), an attacker could still act as you. For maximum safety, proxy through your own backend and don’t store the key in the browser.

## Notes
- The main composer selects a model; reply branches inherit the anchor message’s model.
- “Include in context” appears only on assistant messages; user prompts are pulled in automatically when needed for coherence.

## Todo
- ~Attachments~ ✅
- ~Web Search~ ✅
- ~Claude models integration~ ✅
- Optional context preview before sending
- Better token budgeting with a real tokenizer
- ~Export and Import Sessions (including replies and context selections)~ ✅
- Add browser storage limit warnings
- Replace localStorage with IndexedDB

## Local Development
- Install deps and build
   - yarn install
   - yarn build

- Start dev server
   - yarn dev

- Open http://localhost:5173

- Click Settings to add provider API keys (OpenAI, Anthropic, Gemini, Moonshot). Set a strong password to encrypt them at rest.
