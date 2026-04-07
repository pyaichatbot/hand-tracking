# Contributing to Hand Tracking AR

Thank you for your interest in contributing! Here's how to get involved.

## Getting Started

1. Fork the repo at <https://github.com/pyaichatbot/hand-tracking>
2. Clone your fork and install dependencies:
   ```bash
   cd hand-tracking-app
   npm install
   npm run dev
   ```
3. Create a feature branch: `git checkout -b feat/my-feature`

## Development Workflow

- `npm run dev` — start the Vite dev server at `http://localhost:5173`
- `npm run build` — production build (runs `tsc -b` first)
- `npm run lint` — ESLint check

All source code lives under `hand-tracking-app/src/`.

## Submitting a Pull Request

1. Make sure `npm run build` passes with no TypeScript errors
2. Run `npm run lint` and fix any warnings
3. Write a clear PR description explaining **what** changed and **why**
4. Link any related issues with `Closes #<number>`

## Reporting Bugs

Open an issue at <https://github.com/pyaichatbot/hand-tracking/issues> and include:

- Steps to reproduce
- Expected vs actual behaviour
- Browser and OS version
- Any console errors (open DevTools → Console)

## Suggesting Features

Open a GitHub Discussion or issue with the label `enhancement`. Please check existing issues first to avoid duplicates.

## Code Style

- TypeScript strict mode — no `any` unless unavoidable
- Functional React components only
- Keep Three.js logic inside `Scene3D.tsx`; keep gesture logic inside `utils/gestures.ts`
- No unnecessary comments or dead code in PRs

## Maintainer

**Praveen Yellamaraju** — <https://github.com/pyaichatbot>
