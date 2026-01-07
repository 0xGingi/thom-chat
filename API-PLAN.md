# API Implementation Plan

## Goal
Implement Personal Access Tokens (API Keys) to allow external tools (like `curl`) to authenticate and create chats via the existing `generate-message` API endpoint.

## 1. Database Schema
*   **Table Name**: `api_keys`
*   **Fields**:
    *   `id` (text, primary key)
    *   `userId` (text, foreign key to `user.id`)
    *   `key` (text, unique, the actual API key string)
    *   `name` (text, label for the key e.g., "CLI Script")
    *   `lastUsedAt` (timestamp, optional)
    *   `createdAt` (timestamp)
*   **Action**: 
    *   Create migration file `drizzle/0022_add_api_keys.sql`.
    *   Update `src/lib/db/schema.ts` to export `apiKeys` table.

## 2. API Key Management (Backend)
*   **Endpoint**: `src/routes/api/api-keys/+server.ts`
*   **Methods**:
    *   `GET`: List all API keys for the current authenticated user.
    *   `POST`: Create a new API key.
        *   Generate a secure random key (e.g., `nc_` + random UUID).
        *   Store in DB.
        *   Return to user.
    *   `DELETE`: Revoke an API key by ID.

## 3. Chat Integration (Backend)
*   **Target Endpoint**: `src/routes/api/generate-message/+server.ts`
*   **Modifications**:
    *   **Validation Schema**: Update Zod schema to make `session_token` optional (`z.string().optional()`).
    *   **Authentication Logic**:
        *   Check for `Authorization` header with `Bearer <KEY>`.
        *   If present, validate against `api_keys` table.
        *   If valid, resolve `userId` from the key record.
        *   If invalid/missing, fall back to existing `session_token` / `better-auth` session logic.
        *   Update `lastUsedAt` for the API key if used successfully.
    *   **Context**: Ensure existing logic (models, settings, limits) works using the resolved `userId`.

## 4. User Interface (Frontend)
*   **New Page**: `src/routes/account/developer/`
    *   **+page.svelte**: 
        *   List active API keys with name, creation date, last used date.
        *   Button to "Generate New Key".
        *   Delete button for each key.
    *   **+page.server.ts**: Load keys for server-side rendering.
*   **Navigation**:
    *   Update `src/routes/account/+layout.svelte` to add "Developer" to the side navigation menu.

## 5. Verification
*   Create a test script using `curl` to hit the API with a generated key.
*   Verify the chat appears in the user's history in the main app.
