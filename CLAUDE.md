# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Internal management suite for **MDN Publicidad**, a Venezuelan advertising agency. Covers 8 modules: Proyectos, Tareas, Métricas, Empresa, Evaluaciones, Tickets, Ads, and Auth. Built with React + Vite, styled with Tailwind CSS, using Supabase (PostgreSQL) as the backend. Deployed on Netlify.

The UI is entirely in Spanish.

## System Architecture

**Read `ARQUITECTURA.md` (root) before designing any feature that touches more than one module.**
It is the single source of truth for: module map (purpose, files, tables, routes, permissions),
full data model and table relationships, how modules interconnect today, and key conventions.

Keep `ARQUITECTURA.md` up to date: any commit that adds a module or changes routes, tables, or
inter-module relationships must also update the relevant sections of `ARQUITECTURA.md`.

## Commands

- `npm run dev` — Start dev server (Vite, http://localhost:5173)
- `npm run build` — Production build to `dist/`
- `npm run preview` — Preview production build locally
- `npm test` — Run Vitest test suite
- No linter is configured.

## Environment Variables

Supabase config is injected via two env vars. Copy to `.env.local` for local dev:

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (`https://xxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Supabase public anon key |

These are accessed via `import.meta.env` in `src/supabase.js`.

## Architecture

**React app with React Router (v6).** Full module map, data model, and inter-module connections are
in `ARQUITECTURA.md`. Below are the key patterns for the Proyectos module (the original core) and
the conventions that apply system-wide.

### Proyectos module — data flow

- `AppLayout.jsx` — State owner for projects. Subscribes to the Supabase `projects` table via `postgres_changes` realtime channel (cross-user live updates). Provides CRUD operations (`createProject`, `updateProject`, `deleteProject`) via outlet context to children.
- `App.jsx` — Thin wrapper; consumes outlet context and renders `<Dashboard />`.
- `Dashboard.jsx` — Main content area. Handles search filtering, metrics computation, and renders the project grid. Receives all data/callbacks as props.
- `Sidebar.jsx` — Navigation with status-based views (All/En proceso/Pendiente/Completado) and department filters (`dept:` prefix convention).
- `ProjectCard.jsx` — Individual project display with expandable phases/tasks. Task status changes cascade to auto-derive project status. Uses portal-based dropdowns (`createPortal`) for status selectors.
- `ProjectModal.jsx` — Unified create/edit modal (create when `project` is `null`, edit when it's an object). The modal convention in AppLayout is: `undefined` = closed, `null` = create, object = edit.

### Proyectos data model (Supabase `projects` table)

Each row contains:

- `id` (uuid, PK, auto-generated)
- `name`, `team`, `requirements`, `status` ("Pendiente" | "En proceso" | "Completado")
- `departments` (text array: "Redes", "Diseño", "Audiovisual", "Tecnología")
- `phases` (jsonb) — array of `{ id, name, tasks: [{ id, name, status }] }` where task status is lowercase: "pendiente", "en_proceso", "pausada", "completada"
- `created_at` (timestamptz, server default). Exposed to the UI as `createdAt` via a `normalize()` helper in AppLayout.

Note: Project-level status uses title-case Spanish, task-level status uses lowercase with underscores.

RLS: all authenticated users can read and write any project (no per-user or per-company scoping). See `supabase/migrations/20260525000000_create_projects.sql`.

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
  migrations), ask for explicit confirmation once before proceeding.
- **Keep `ARQUITECTURA.md` updated:** any commit that adds a module or changes routes, tables, or
  inter-module relationships must update the relevant sections of `ARQUITECTURA.md` in the same
  commit. Treat it as part of "feature complete", the same as tests.
- **Propose interconnections when designing any module:** before implementing, read `ARQUITECTURA.md`
  and identify where the new module can read or derive data from existing tables instead of manual
  capture, or where it can feed other modules. Suggest this explicitly — for example, deriving
  Métricas indicators from the `tasks` table by line/client/month instead of manual inputs. This
  rule applies whenever a module is being designed, not only in plan mode.

## Deployment

Netlify config in `netlify.toml`: SPA redirect rule, no-cache on `index.html`, immutable cache on `/assets/*`.
