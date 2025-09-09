# ForkGPT

A tiny, scrappy chat playground. It’s like ChatGPT, but with a superpower: a right‑side Reply Viewer where you can branch, nest, and curate which answers should count as context for future messages. Follow multiple what‑ifs without wrecking your main thread.

## What It Is
- A local‑first (too lazy to add persistence - coming soon), browser‑based chat UI for exploring ideas.
- Branch replies on the right, keep your main chat tidy on the left.
- Decide which assistant answers influence future responses with an “Include in context” toggle (assistant messages only). Disabling a parent cascades to its children.

## Why You’ll Like It
- Compare alternate answers side‑by‑side, keep only the good stuff in memory.
- Curate context explicitly instead of hoping the model guesses what to remember.
- Keep conversations neat while you explore deep rabbit holes in parallel.

## Highlights
- Reply Viewer: clean nesting, collapsible nodes, subtle indent guides.
- Resizable panel: drag the thin divider; we remember your width.
- Session settings: temperature slider and reasoning effort for `gpt-5` (`low` | `medium` | `high`).
- Local persistence: your sessions live in your browser profile.
- Safer keys: encrypt your API key at rest with a password; unlock per reload. The key stays in memory only after you unlock.
- Streams by default, with a Stop button when you need it.

## Privacy & Security
- Where data lives: `localStorage` for chat data (per‑origin, per‑profile).
- API key storage: encrypted in `localStorage` with a password you set; decrypted only in memory after you unlock. This helps against casual inspection, but if a tab is compromised (XSS), an attacker could still act as you. For maximum safety, proxy through your own backend and don’t store the key in the browser.

## Notes
- The main composer selects a model; reply branches inherit the anchor message’s model.
- “Include in context” appears only on assistant messages; user prompts are pulled in automatically when needed for coherence.

## Roadmap
- Claude model integration
- Optional context preview before sending.
- Better token budgeting with a real tokenizer.
- Keyboard navigation in the Reply Viewer (j/k to move, Enter to reply).
- Tighter security controls

## Getting Started
1. Install deps

   yarn

2. Start dev server

   yarn dev

3. Open http://localhost:5173

4. Click Settings to add your OpenAI API key. Optionally set a password to encrypt it at rest.
