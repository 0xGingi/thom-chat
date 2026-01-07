# Personal Access Tokens (API Keys) - Development Plan

This plan details how to implement Personal Access Tokens (PATs) that allow external tools like `curl` to authenticate with the nano-chat API.

## Overview

**Goal**: Enable users to generate API keys from a "Developer" settings page, then use those keys with `Authorization: Bearer <KEY>` headers to call the `generate-message` endpoint from external tools.

**Key Distinction**: This is **separate** from the existing "API Keys" page (`/account/api-keys`), which is for BYOK (Bring Your Own Key) provider API keys. PATs are user-generated tokens for authenticating with nano-chat itself.

---

## 1. Database Schema

### 1.1 Migration File

**File**: `drizzle/0022_add_api_keys.sql`

```sql
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `api_keys_user_id_idx` ON `api_keys` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_idx` ON `api_keys` (`key`);
```

### 1.2 Schema Definition

**File**: `src/lib/db/schema.ts`

Add after `userKeys` table definition (~line 129):

```typescript
export const apiKeys = sqliteTable(
	'api_keys',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		key: text('key').notNull().unique(),
		name: text('name').notNull(),
		lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		index('api_keys_user_id_idx').on(table.userId),
	]
);
```

**Relations**: Add to `userRelations`:
```typescript
apiKeys: many(apiKeys),
```

**New relation**:
```typescript
export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
	user: one(user, {
		fields: [apiKeys.userId],
		references: [user.id],
	}),
}));
```

**Type exports**:
```typescript
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
```

---

## 2. API Key Management Backend

**File**: `src/routes/api/api-keys/+server.ts`

### 2.1 GET - List API Keys

Returns all API keys for the authenticated user (excluding the actual key value for security).

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { apiKeys } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/auth';

export const GET: RequestHandler = async ({ request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	const keys = await db.query.apiKeys.findMany({
		where: eq(apiKeys.userId, session.user.id),
		columns: {
			id: true,
			name: true,
			lastUsedAt: true,
			createdAt: true,
			// Exclude 'key' for security - never expose after creation
		},
	});

	return json({ keys });
};
```

### 2.2 POST - Create API Key

Generates a new API key with format `nc_<uuid>`.

```typescript
import { z } from 'zod/v4';
import { generateId } from '$lib/db';
import { randomUUID } from 'crypto';

const createSchema = z.object({
	name: z.string().min(1).max(100),
});

export const POST: RequestHandler = async ({ request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	const body = await request.json();
	const parsed = createSchema.safeParse(body);
	if (!parsed.success) {
		return error(400, 'Invalid request body');
	}

	const keyId = generateId();
	const keyValue = `nc_${randomUUID().replace(/-/g, '')}`;
	const now = new Date();

	await db.insert(apiKeys).values({
		id: keyId,
		userId: session.user.id,
		key: keyValue,
		name: parsed.data.name,
		createdAt: now,
	});

	// Return the key value ONLY on creation
	return json({
		id: keyId,
		key: keyValue,
		name: parsed.data.name,
		createdAt: now,
	});
};
```

### 2.3 DELETE - Revoke API Key

```typescript
const deleteSchema = z.object({
	id: z.string(),
});

export const DELETE: RequestHandler = async ({ request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	const body = await request.json();
	const parsed = deleteSchema.safeParse(body);
	if (!parsed.success) {
		return error(400, 'Invalid request body');
	}

	// Ensure user owns this key
	const key = await db.query.apiKeys.findFirst({
		where: and(
			eq(apiKeys.id, parsed.data.id),
			eq(apiKeys.userId, session.user.id)
		),
	});

	if (!key) {
		return error(404, 'API key not found');
	}

	await db.delete(apiKeys).where(eq(apiKeys.id, parsed.data.id));

	return json({ success: true });
};
```

---

## 3. generate-message Integration

**File**: `src/routes/api/generate-message/+server.ts`

### 3.1 Modify Zod Schema

Change line 55 from:
```typescript
session_token: z.string(),
```

To:
```typescript
session_token: z.string().optional(),
```

### 3.2 Add API Key Authentication Helper

Add after `getUserIdFromSession` function (~line 126):

```typescript
// Helper to get user ID from API key (Bearer token)
async function getUserIdFromApiKey(authHeader: string | null): Promise<Result<string, string>> {
	if (!authHeader) {
		return err('Missing Authorization header. Use: Authorization: Bearer <your_api_key>');
	}
	
	if (!authHeader.startsWith('Bearer ')) {
		return err('Invalid Authorization header format. Expected: Bearer <your_api_key>');
	}

	const keyValue = authHeader.slice(7); // Remove 'Bearer ' prefix
	
	if (!keyValue) {
		return err('Empty API key. Provide your key after "Bearer "');
	}
	
	if (!keyValue.startsWith('nc_')) {
		return err('Invalid API key format. Keys should start with "nc_". Generate one at /account/developer');
	}

	try {
		const apiKeyRecord = await db.query.apiKeys.findFirst({
			where: eq(apiKeys.key, keyValue),
		});

		if (!apiKeyRecord) {
			return err('API key not found or has been revoked. Generate a new key at /account/developer');
		}

		// Update lastUsedAt timestamp
		await db
			.update(apiKeys)
			.set({ lastUsedAt: new Date() })
			.where(eq(apiKeys.id, apiKeyRecord.id));

		return ok(apiKeyRecord.userId);
	} catch (e) {
		return err(`Internal error validating API key. Please try again or contact support.`);
	}
}
```

### 3.3 Modify POST Handler Authentication Logic

In the POST handler, replace the `getUserIdFromSession` call with dual-path authentication:

```typescript
// Try API key auth first (Bearer token)
const authHeader = request.headers.get('Authorization');
let userIdResult: Result<string, string>;

if (authHeader?.startsWith('Bearer ')) {
	userIdResult = await getUserIdFromApiKey(authHeader);
} else if (body.session_token) {
	userIdResult = await getUserIdFromSession(body.session_token);
} else {
	return error(401, 'Authentication required: provide Bearer token or session_token');
}

if (userIdResult.isErr()) {
	return error(401, userIdResult.error);
}

const userId = userIdResult.value;
```

### 3.4 Required Import

Add to imports:
```typescript
import { apiKeys } from '$lib/db/schema';
```

---

## 4. Developer UI Page

### 4.1 Navigation Update

**File**: `src/routes/account/+layout.svelte`

Add after line 52 (after Analytics):
```typescript
{
	title: 'Developer',
	href: '/account/developer',
},
```

### 4.2 Server Load Function

**File**: `src/routes/account/developer/+page.server.ts`

```typescript
import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import { apiKeys } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	const session = await locals.auth();
	if (!session?.user?.id) {
		throw redirect(302, '/login');
	}

	const keys = await db.query.apiKeys.findMany({
		where: eq(apiKeys.userId, session.user.id),
		columns: {
			id: true,
			name: true,
			lastUsedAt: true,
			createdAt: true,
		},
		orderBy: (keys, { desc }) => [desc(keys.createdAt)],
	});

	return { keys };
};
```

### 4.3 Page Component

**File**: `src/routes/account/developer/+page.svelte`

```svelte
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import KeyIcon from '~icons/lucide/key';
	import PlusIcon from '~icons/lucide/plus';
	import TrashIcon from '~icons/lucide/trash-2';
	import CopyIcon from '~icons/lucide/copy';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	let showCreateModal = $state(false);
	let newKeyName = $state('');
	let newlyCreatedKey = $state<string | null>(null);
	let creating = $state(false);

	async function createKey() {
		if (!newKeyName.trim()) return;
		creating = true;

		try {
			const res = await fetch('/api/api-keys', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newKeyName }),
			});

			if (!res.ok) throw new Error('Failed to create key');

			const result = await res.json();
			newlyCreatedKey = result.key;
			newKeyName = '';
			await invalidateAll();
			toast.success('API key created');
		} catch (e) {
			toast.error('Failed to create API key');
		} finally {
			creating = false;
		}
	}

	async function deleteKey(id: string) {
		try {
			const res = await fetch('/api/api-keys', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id }),
			});

			if (!res.ok) throw new Error('Failed to delete key');

			await invalidateAll();
			toast.success('API key deleted');
		} catch (e) {
			toast.error('Failed to delete API key');
		}
	}

	function copyKey(key: string) {
		navigator.clipboard.writeText(key);
		toast.success('Copied to clipboard');
	}

	function formatDate(date: Date | null) {
		if (!date) return 'Never';
		return new Intl.DateTimeFormat('en-US', {
			dateStyle: 'medium',
			timeStyle: 'short',
		}).format(new Date(date));
	}
</script>

<svelte:head>
	<title>Developer | nanochat</title>
</svelte:head>

<div>
	<h1 class="text-2xl font-bold">Developer</h1>
	<p class="text-muted-foreground mt-2 text-sm">
		Personal Access Tokens for API authentication. Use these keys with the
		<code class="bg-muted rounded px-1">Authorization: Bearer &lt;KEY&gt;</code> header.
	</p>
</div>

<Card.Root class="mt-8">
	<Card.Header>
		<Card.Title>
			<KeyIcon class="inline size-4" />
			API Keys
		</Card.Title>
		<Card.Description>Generate and manage your personal access tokens.</Card.Description>
	</Card.Header>
	<Card.Content>
		<!-- Create new key form -->
		<div class="mb-6 flex gap-2">
			<Input
				bind:value={newKeyName}
				placeholder="Key name (e.g., CLI Script)"
				class="flex-1"
			/>
			<Button onclick={createKey} disabled={creating || !newKeyName.trim()}>
				<PlusIcon class="mr-1 size-4" />
				Generate Key
			</Button>
		</div>

		<!-- Show newly created key (only visible once) -->
		{#if newlyCreatedKey}
			<div class="mb-6 rounded-lg border border-green-500 bg-green-500/10 p-4">
				<p class="mb-2 text-sm font-medium text-green-600">
					Key created! Copy it now - you won't be able to see it again.
				</p>
				<div class="flex items-center gap-2">
					<code class="bg-muted flex-1 rounded p-2 font-mono text-sm">{newlyCreatedKey}</code>
					<Button variant="outline" size="sm" onclick={() => copyKey(newlyCreatedKey!)}>
						<CopyIcon class="size-4" />
					</Button>
				</div>
				<Button
					variant="ghost"
					size="sm"
					class="mt-2"
					onclick={() => (newlyCreatedKey = null)}
				>
					Dismiss
				</Button>
			</div>
		{/if}

		<!-- List of keys -->
		{#if data.keys.length === 0}
			<p class="text-muted-foreground text-center text-sm">No API keys yet.</p>
		{:else}
			<div class="space-y-3">
				{#each data.keys as key (key.id)}
					<div class="bg-muted/50 flex items-center justify-between rounded-lg p-3">
						<div>
							<p class="font-medium">{key.name}</p>
							<p class="text-muted-foreground text-xs">
								Created: {formatDate(key.createdAt)} • Last used: {formatDate(key.lastUsedAt)}
							</p>
						</div>
						<Button variant="ghost" size="sm" onclick={() => deleteKey(key.id)}>
							<TrashIcon class="size-4 text-red-500" />
						</Button>
					</div>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>

<!-- Usage example -->
<Card.Root class="mt-4">
	<Card.Header>
		<Card.Title>Usage Example</Card.Title>
	</Card.Header>
	<Card.Content>
		<pre class="bg-muted overflow-x-auto rounded-lg p-4 text-sm"><code>curl -X POST https://your-domain.com/api/generate-message \
  -H "Authorization: Bearer nc_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello!",
    "model_id": "gpt-4o"
  }'</code></pre>
	</Card.Content>
</Card.Root>
```

---

## 5. Verification Plan

### 5.1 Automated Testing

Create a test script to verify the implementation:

**File**: `scripts/test-api-key.sh`

```bash
#!/bin/bash
# Test script for API key authentication
# Run with: ./scripts/test-api-key.sh <API_KEY>

API_KEY="$1"
BASE_URL="${2:-http://localhost:5173}"

if [ -z "$API_KEY" ]; then
    echo "Usage: ./scripts/test-api-key.sh <API_KEY> [BASE_URL]"
    exit 1
fi

echo "Testing API key authentication..."
echo "Base URL: $BASE_URL"
echo ""

# Test the generate-message endpoint
response=$(curl -s -X POST "$BASE_URL/api/generate-message" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Say hello in exactly 5 words",
    "model_id": "gpt-4o-mini"
  }')

echo "Response:"
echo "$response" | jq .

if echo "$response" | jq -e '.ok == true' > /dev/null 2>&1; then
    echo ""
    echo "✅ SUCCESS: API key authentication works!"
    echo "Conversation ID: $(echo "$response" | jq -r '.conversation_id')"
else
    echo ""
    echo "❌ FAILED: API key authentication failed"
    exit 1
fi
```

### 5.2 Manual Verification Steps

1. **Database Migration**
   - Run `bun run db:push` to apply the migration
   - Verify `api_keys` table exists in the database

2. **UI Testing**
   - Navigate to `/account/developer`
   - Create a new API key with a descriptive name
   - Verify the key is displayed (copy it!)
   - Verify the key appears in the list (without the actual key value)
   - Delete a key and verify it's removed

3. **API Testing**
   - Use the copied key to make a curl request:
     ```bash
     curl -X POST http://localhost:5173/api/generate-message \
       -H "Authorization: Bearer nc_your_key" \
       -H "Content-Type: application/json" \
       -d '{"message": "Hello", "model_id": "gpt-4o-mini"}'
     ```
   - Verify a `conversation_id` is returned
   - Check that the chat appears in the user's chat history
   - Verify `lastUsedAt` is updated on the Developer page

4. **Security Testing**
   - Verify invalid keys return 401
   - Verify missing auth returns 401
   - Verify you cannot see other users' keys

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `drizzle/0022_add_api_keys.sql` | NEW | Database migration |
| `src/lib/db/schema.ts` | MODIFY | Add apiKeys table + relations + types |
| `src/routes/api/api-keys/+server.ts` | NEW | API key CRUD endpoints |
| `src/routes/api/generate-message/+server.ts` | MODIFY | Add Bearer token auth |
| `src/routes/account/+layout.svelte` | MODIFY | Add Developer nav item |
| `src/routes/account/developer/+page.server.ts` | NEW | Load keys for SSR |
| `src/routes/account/developer/+page.svelte` | NEW | Developer settings UI |
| `scripts/test-api-key.sh` | NEW | Verification script |

---

## Dependencies

No new npm packages required. Uses existing:
- `drizzle-orm` for database
- `zod` for validation
- `crypto` for UUID generation (Node.js built-in)
- `svelte-sonner` for toasts

---

## Rollback Plan

If issues arise:
1. Remove the `/account/developer` route
2. Remove the `/api/api-keys` endpoint
3. Revert changes to `generate-message` endpoint
4. The migration can be reversed by dropping the `api_keys` table
