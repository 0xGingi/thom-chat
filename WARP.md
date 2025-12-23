# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Structure & Architecture

This is a SvelteKit application using Bun, Drizzle ORM (SQLite), and TailwindCSS. It serves as a self-hostable T3 Chat fork with Nano-GPT integration.

### High-Level Architecture
- **Frontend**: SvelteKit (Svelte 5) with TailwindCSS and Bits UI/Melt UI.
  - Components: `src/lib/components/`
  - State Management: `src/lib/state/`
  - Global Styles: `src/app.css`
- **Backend**: SvelteKit server endpoints and server-side logic.
  - Database: SQLite managed by Drizzle ORM.
    - Schema: `src/lib/db/schema.ts`
    - Config: `drizzle.config.ts`
    - Data: `./data/thom-chat.db`
  - Auth: Better Auth (`src/lib/auth.ts`)
  - AI/Logic: `src/lib/spells/` (AI integration), `src/lib/backend/`
- **API**: 
  - Routes: `src/routes/api/`
  - Client: `src/lib/api.ts`

### Key Directories
- `src/routes/`: SvelteKit file-based routing.
- `src/lib/db/`: Database schema and connection logic.
- `src/lib/components/`: Reusable UI components.
- `src/lib/spells/`: Logic related to AI features (Nano-GPT, etc.).

## Development Workflow

### Prerequisites
- Runtime: Bun
- Database: SQLite

### Common Commands

- **Setup**:
  ```bash
  bun install
  cp .env.example .env # Configure environment variables
  ```

- **Development Server**:
  ```bash
  bun run dev
  ```

- **Database Management** (Drizzle):
  - Push schema changes to the database:
    ```bash
    bun x drizzle-kit push
    ```
  - Generate migrations (if using migrations flow):
    ```bash
    bun x drizzle-kit generate
    ```

- **Testing**:
  - Run all tests (Unit + E2E):
    ```bash
    bun run test
    ```
  - Run unit tests (Vitest):
    ```bash
    bun run test:unit
    ```
  - Run E2E tests (Playwright):
    ```bash
    bun run test:e2e
    ```

- **Linting & Formatting**:
  ```bash
  bun run lint   # Check formatting and linting
  bun run format # Fix formatting
  ```

- **Building**:
  ```bash
  bun run build
  ```

## Testing Guidelines
- Unit tests are located alongside code or in `*.spec.ts` files, run with Vitest.
- E2E tests are in `e2e/` or `src/routes` (if co-located), run with Playwright.
- Ensure the database is in a known state or mocked when running integration tests.
