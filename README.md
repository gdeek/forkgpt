# ForkGPT UI MVP

A UI-only ChatGPT-like tool with a right-side Reply Viewer for nested replies. Replies have an "Include in context" toggle (default OFF). Disabling a parent cascades OFF to all descendants. Enabled replies affect both reply-thread generations and the main chat context.

## Getting Started
1. Install deps

   yarn

2. Start dev server

   yarn dev

3. Open http://localhost:5173

4. Click Settings and add your OpenAI API key.

## Tests

   yarn test
