# ForkGPT UI MVP

A UI-only ChatGPT-like tool with a right-side Reply Viewer for nested replies. Replies have an "Include in context" toggle (default OFF). Disabling a parent cascades OFF to all descendants. Enabled replies affect both reply-thread generations and the main chat context.

## Tech Stack
- React + TypeScript + Vite
- Tailwind CSS (lightweight shadcn-like styling)
- LocalStorage persistence (no backend)
- Jest for unit tests (context builder, cascade logic)

## Getting Started
1. Install deps

   yarn

2. Start dev server

   yarn dev

3. Open http://localhost:5173

4. Click Settings and add your OpenAI API key.

## Notes
- Single model per main message (dropdown in main composer). Reply Viewer uses the anchor message's model.
- Only one Reply Viewer open at a time (right fixed-width drawer).
- Streams responses; Stop cancels the request.

## Tests

   yarn test

## Roadmap
- Replace basic Tailwind controls with shadcn/ui components.
- Improve trimming/token counting with a real tokenizer.
- Persist UI view state more granularly.

