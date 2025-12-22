<script lang="ts">
	import { useCachedQuery, api } from '$lib/cache/cached-query.svelte';
	import { session } from '$lib/state/session.svelte';
	import { ResultAsync } from 'neverthrow';
	import { mutate } from '$lib/client/mutation.svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import {
		Root as Card,
		Content as CardContent,
		Description as CardDescription,
		Header as CardHeader,
		Title as CardTitle
	} from '$lib/components/ui/card';
	import PasskeySettings from '$lib/components/account/PasskeySettings.svelte';
	import ChevronDown from '~icons/lucide/chevron-down';
	import ChevronRight from '~icons/lucide/chevron-right';

	let { data } = $props();
	const settings = useCachedQuery(api.user_settings.get, {});

	let privacyMode = $derived(settings.data?.privacyMode ?? false);
	let contextMemoryEnabled = $derived(settings.data?.contextMemoryEnabled ?? false);
	let persistentMemoryEnabled = $derived(settings.data?.persistentMemoryEnabled ?? false);
	let youtubeTranscriptsEnabled = $derived(settings.data?.youtubeTranscriptsEnabled ?? false);

	let karakeepUrl = $state(settings.data?.karakeepUrl ?? '');
	let karakeepApiKey = $state(settings.data?.karakeepApiKey ?? '');
	let karakeepSaving = $state(false);
	let karakeepTestStatus = $state<'idle' | 'testing' | 'success' | 'error'>('idle');
	let karakeepTestMessage = $state('');
	let karakeepExpanded = $state(false);

	$effect(() => {
		if (settings.data?.karakeepUrl) karakeepUrl = settings.data.karakeepUrl;
		if (settings.data?.karakeepApiKey) karakeepApiKey = settings.data.karakeepApiKey;
	});

	async function togglePrivacyMode(v: boolean) {
		privacyMode = v;
		if (!session.current?.user.id) return;

		const res = await ResultAsync.fromPromise(
			mutate(api.user_settings.set.url, {
				action: 'update',
				privacyMode: v,
			}),
			(e) => e
		);

		if (res.isErr()) privacyMode = !v;
	}

	async function toggleContextMemory(v: boolean) {
		contextMemoryEnabled = v;
		if (!session.current?.user.id) return;

		const res = await ResultAsync.fromPromise(
			mutate(api.user_settings.set.url, {
				action: 'update',
				contextMemoryEnabled: v,
			}),
			(e) => e
		);

		if (res.isErr()) contextMemoryEnabled = !v;
	}

	async function togglePersistentMemory(v: boolean) {
		persistentMemoryEnabled = v;
		if (!session.current?.user.id) return;

		const res = await ResultAsync.fromPromise(
			mutate(api.user_settings.set.url, {
				action: 'update',
				persistentMemoryEnabled: v,
			}),
			(e) => e
		);

		if (res.isErr()) persistentMemoryEnabled = !v;
	}

	async function toggleYoutubeTranscripts(v: boolean) {
		youtubeTranscriptsEnabled = v;
		if (!session.current?.user.id) return;

		const res = await ResultAsync.fromPromise(
			mutate(api.user_settings.set.url, {
				action: 'update',
				youtubeTranscriptsEnabled: v,
			}),
			(e) => e
		);

		if (res.isErr()) youtubeTranscriptsEnabled = !v;
	}

	async function saveKarakeepSettings() {
		if (!session.current?.user.id) return;

		karakeepSaving = true;
		const res = await ResultAsync.fromPromise(
			mutate(api.user_settings.set.url, {
				action: 'update',
				karakeepUrl,
				karakeepApiKey,
			}),
			(e) => e
		);

		karakeepSaving = false;
		if (res.isErr()) {
			console.error('Failed to save Karakeep settings:', res.error);
		}
	}

	async function testKarakeepConnection() {
		if (!karakeepUrl || !karakeepApiKey) {
			karakeepTestStatus = 'error';
			karakeepTestMessage = 'Please enter both URL and API key';
			return;
		}

		karakeepTestStatus = 'testing';
		karakeepTestMessage = '';

		try {
			const baseUrl = karakeepUrl.endsWith('/') ? karakeepUrl.slice(0, -1) : karakeepUrl;
			const response = await fetch(`${baseUrl}/api/v1/users/me`, {
				headers: {
					'Authorization': `Bearer ${karakeepApiKey}`,
				},
			});

			if (response.ok) {
				karakeepTestStatus = 'success';
				karakeepTestMessage = 'Connection successful!';
			} else {
				karakeepTestStatus = 'error';
				karakeepTestMessage = `Connection failed: ${response.status} ${response.statusText}`;
			}
		} catch (error) {
			karakeepTestStatus = 'error';
			karakeepTestMessage = `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
		}
	}
</script>

<svelte:head>
	<title>Account | not t3.chat</title>
</svelte:head>

<h1 class="text-2xl font-bold">Account Settings</h1>
<h2 class="text-muted-foreground mt-2 text-sm">Configure the settings for your account.</h2>

<div class="mt-6 flex flex-col gap-6">
	<!-- Account Settings Section -->
	<Card>
		<CardHeader>
			<CardTitle>General Settings</CardTitle>
			<CardDescription>
				Privacy and memory preferences for your account.
			</CardDescription>
		</CardHeader>
		<CardContent class="grid gap-4">
			<div class="flex place-items-center justify-between">
				<div class="flex flex-col gap-1">
					<span class="font-medium">Hide Personal Information</span>
					<span class="text-muted-foreground text-sm">Blur your name and avatar in the sidebar.</span>
				</div>
				<Switch bind:value={() => privacyMode, togglePrivacyMode} />
			</div>
			<div class="flex place-items-center justify-between">
				<div class="flex flex-col gap-1">
					<span class="font-medium">Context Memory</span>
					<span class="text-muted-foreground text-sm">Compress long conversations for better context retention.</span>
				</div>
				<Switch bind:value={() => contextMemoryEnabled, toggleContextMemory} />
			</div>
			<div class="flex place-items-center justify-between">
				<div class="flex flex-col gap-1">
					<span class="font-medium">Persistent Memory</span>
					<span class="text-muted-foreground text-sm">Remember facts about you across different conversations.</span>
				</div>
				<Switch bind:value={() => persistentMemoryEnabled, togglePersistentMemory} />
			</div>
		</CardContent>
	</Card>

	<!-- Karakeep Integration Section (Collapsible) -->
	<Card>
		<button
			type="button"
			class="w-full text-left"
			onclick={() => karakeepExpanded = !karakeepExpanded}
		>
			<CardHeader class="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
				<div class="flex items-center justify-between">
					<div>
						<CardTitle>Karakeep Integration</CardTitle>
						<CardDescription>
							Configure your Karakeep instance to save chats as bookmarks.
						</CardDescription>
					</div>
					<div class="text-muted-foreground">
						{#if karakeepExpanded}
							<ChevronDown class="h-5 w-5" />
						{:else}
							<ChevronRight class="h-5 w-5" />
						{/if}
					</div>
				</div>
			</CardHeader>
		</button>
		
		{#if karakeepExpanded}
			<CardContent class="grid gap-4 pt-0">
				<div class="flex flex-col gap-2">
					<label for="karakeep-url" class="text-sm font-medium">Karakeep URL</label>
					<Input
						id="karakeep-url"
						type="url"
						placeholder="https://karakeep.example.com"
						bind:value={karakeepUrl}
					/>
					<span class="text-muted-foreground text-xs">The URL of your Karakeep instance</span>
				</div>
				
				<div class="flex flex-col gap-2">
					<label for="karakeep-api-key" class="text-sm font-medium">API Key</label>
					<Input
						id="karakeep-api-key"
						type="password"
						placeholder="Enter your Karakeep API key"
						bind:value={karakeepApiKey}
					/>
					<span class="text-muted-foreground text-xs">Your Karakeep API authentication key</span>
				</div>
				
				<div class="flex gap-2">
					<Button
						onclick={saveKarakeepSettings}
						disabled={karakeepSaving}
					>
						{karakeepSaving ? 'Saving...' : 'Save Settings'}
					</Button>
					<Button
						variant="outline"
						onclick={testKarakeepConnection}
						disabled={karakeepTestStatus === 'testing'}
					>
						{karakeepTestStatus === 'testing' ? 'Testing...' : 'Test Connection'}
					</Button>
				</div>
				
				{#if karakeepTestStatus !== 'idle' && karakeepTestMessage}
					<div
						class="rounded-md p-3 text-sm {karakeepTestStatus === 'success'
							? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
							: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'}"
					>
						{karakeepTestMessage}
					</div>
				{/if}
			</CardContent>
		{/if}
	</Card>

	<!-- Passkeys Section -->
	<PasskeySettings passkeys={data.passkeys || []} />
</div>
