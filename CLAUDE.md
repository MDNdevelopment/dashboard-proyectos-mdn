# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Project management dashboard for **MDN Publicidad**, a Venezuelan advertising agency. Built with React + Vite, styled with Tailwind CSS, using Firebase Firestore as the real-time backend. Deployed on Netlify.

The UI is entirely in Spanish. The branch `feat/integrate-supabase-login` is an active migration effort to add Supabase authentication.

## Commands

- `npm run dev` — Start dev server (Vite, http://localhost:5173)
- `npm run build` — Production build to `dist/`
- `npm run preview` — Preview production build locally
- No test framework is configured.
- No linter is configured.

## Environment Variables

All Firebase config is injected via `VITE_FIREBASE_*` env vars (see `.env.example`). Copy to `.env.local` for local dev. These are accessed via `import.meta.env` in `src/firebase.js`.

## Architecture

**Single-page React app with no router.** All state lives in `App.jsx` and flows down via props. There is no state management library.

### Data Flow

- `App.jsx` — Top-level state owner. Subscribes to Firestore `projects` collection via `onSnapshot` (real-time). Provides CRUD operations (`createProject`, `updateProject`, `deleteProject`) as props to children.
- `Dashboard.jsx` — Main content area. Handles search filtering, metrics computation, and renders the project grid. Receives all data/callbacks as props.
- `Sidebar.jsx` — Navigation with status-based views (All/En proceso/Pendiente/Completado) and department filters (`dept:` prefix convention).
- `ProjectCard.jsx` — Individual project display with expandable phases/tasks. Task status changes cascade to auto-derive project status. Uses portal-based dropdowns (`createPortal`) for status selectors.
- `ProjectModal.jsx` — Unified create/edit modal (create when `project` is `null`, edit when it's an object). The modal convention in App is: `undefined` = closed, `null` = create, object = edit.

### Data Model (Firestore `projects` collection)

Each project document contains:

- `name`, `team`, `requirements`, `status` ("Pendiente" | "En proceso" | "Completado")
- `departments` (array of strings: "Redes", "Diseño", "Audiovisual", "Tecnología")
- `phases` — array of `{ id, name, tasks: [{ id, name, status }] }` where task status is lowercase: "pendiente", "en_proceso", "pausada", "completada"
- `createdAt` (Firestore serverTimestamp)

Note: Project-level status uses title-case Spanish, task-level status uses lowercase with underscores.

### Legacy Code

`CreateProjectModal.jsx` is an older version of the create modal (single department via `department` field). The current code uses `ProjectModal.jsx` which supports multi-department via `departments` array. The codebase has backward-compat handling: `project.departments ?? (project.department ? [project.department] : [])`.

## Styling

- **Tailwind CSS 3** with custom fonts: DM Sans (body) and DM Mono (labels/numbers), loaded via Google Fonts in `index.html`.
- Brand color: `#FFB800` (yellow/gold) for active states and accents.
- Background: `#f2f0e8` (warm cream) with dot-grid pattern (`.main-bg` class).
- Custom `.input-base` class defined in `src/index.css` for form inputs.
- All color values are hardcoded hex — no Tailwind theme extensions for colors.

## Development Rules

- Every new feature must include tests that pass before the work is considered complete. Do not return success on a feature without writing and running passing tests.
- Never modify a test just to make it pass. When a test fails, investigate the root cause in the implementation code. If the failure cannot be resolved, ask the developer for guidance before proceeding.
- Before executing any destructive database operation (DROP, DELETE, TRUNCATE, or destructive
  migrations), ask for explicit confirmation 3 times before proceeding.

## Deployment

Netlify config in `netlify.toml`: SPA redirect rule, no-cache on `index.html`, immutable cache on `/assets/*`.
