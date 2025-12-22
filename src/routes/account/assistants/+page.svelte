<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { api, useCachedQuery, invalidateQueryPattern } from '$lib/cache/cached-query.svelte.js';
	import { session } from '$lib/state/session.svelte.js';
	import { models } from '$lib/state/models.svelte';
	import { Provider } from '$lib/types';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Card from '$lib/components/ui/card';
	import Input from '$lib/components/ui/input/input.svelte';
	import Textarea from '$lib/components/ui/textarea/textarea.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import LoaderCircle from '~icons/lucide/loader-circle';
	import Trash from '~icons/lucide/trash-2';
	import Pencil from '~icons/lucide/pencil';
	import Plus from '~icons/lucide/plus';
	import X from '~icons/lucide/x';
	import Save from '~icons/lucide/save';
	import Star from '~icons/lucide/star';

	models.init();

	const enabledModelsQuery = useCachedQuery(api.user_enabled_models.get_enabled, {});
	const enabledModels = $derived(Object.values(enabledModelsQuery.data ?? {}) as { id: string; modelId: string }[]);

	const assistantsQuery = useCachedQuery(api.assistants.list, {
		session_token: session.current?.session.token ?? '',
	});

	let assistants = $derived(assistantsQuery.data ?? []);
	let isLoading = $derived(assistantsQuery.isLoading);

	let editingId = $state<string | null>(null);
	let isCreating = $state(false);

	let formName = $state('');
	let formSystemPrompt = $state('');
	let formDefaultModelId = $state<string>('');
	let formDefaultWebSearchMode = $state<string>('');
	let formDefaultWebSearchProvider = $state<string>('');
	let isSubmitting = $state(false);

	function startEdit(assistant: any) {
		editingId = assistant.id;
		formName = assistant.name;
		formSystemPrompt = assistant.systemPrompt;
		formDefaultModelId = assistant.defaultModelId ?? '';
		formDefaultWebSearchMode = assistant.defaultWebSearchMode ?? '';
		formDefaultWebSearchProvider = assistant.defaultWebSearchProvider ?? '';
		isCreating = false;
	}

	function startCreate() {
		editingId = null;
		formName = '';
		formSystemPrompt = '';
		formDefaultModelId = '';
		formDefaultWebSearchMode = '';
		formDefaultWebSearchProvider = '';
		isCreating = true;
	}

	function cancelForm() {
		editingId = null;
		isCreating = false;
		formName = '';
		formSystemPrompt = '';
		formDefaultModelId = '';
		formDefaultWebSearchMode = '';
		formDefaultWebSearchProvider = '';
		// Clear the create query param if present
		if (page.url.searchParams.has('create')) {
			goto('/account/assistants', { replaceState: true });
		}
	}

	// Auto-open create form when navigating with ?create=true
	$effect(() => {
		if (page.url.searchParams.get('create') === 'true' && !isCreating && !editingId) {
			startCreate();
		}
	});

	async function handleSubmit() {
		if (!formName) return;

		isSubmitting = true;
		try {
			if (isCreating) {
				const res = await fetch(api.assistants.create.url, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: formName,
						systemPrompt: formSystemPrompt,
						defaultModelId: formDefaultModelId || undefined,
						defaultWebSearchMode: formDefaultWebSearchMode || undefined,
						defaultWebSearchProvider: formDefaultWebSearchProvider || undefined,
					}),
				});
				if (!res.ok) throw new Error('Failed to create');
			} else if (editingId) {
				const res = await fetch(`${api.assistants.list.url}/${editingId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: formName,
						systemPrompt: formSystemPrompt,
						defaultModelId: formDefaultModelId || null,
						defaultWebSearchMode: formDefaultWebSearchMode || null,
						defaultWebSearchProvider: formDefaultWebSearchProvider || null,
					}),
				});
				if (!res.ok) throw new Error('Failed to update');
			}

			invalidateQueryPattern(api.assistants.list.url);
			cancelForm();
		} catch (e) {
			console.error(e);
			alert('Error saving assistant');
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDelete(id: string) {
		if (!confirm('Are you sure you want to delete this assistant?')) return;

		try {
			const res = await fetch(`${api.assistants.list.url}/${id}`, {
				method: 'DELETE',
			});
			if (!res.ok) throw new Error('Failed to delete');
			invalidateQueryPattern(api.assistants.list.url);
		} catch (e) {
			console.error(e);
			alert('Error deleting assistant');
		}
	}

	async function handleSetDefault(id: string) {
		try {
			const res = await fetch(`${api.assistants.list.url}/${id}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'setDefault' }),
			});
			if (!res.ok) throw new Error('Failed to set default');
			invalidateQueryPattern(api.assistants.list.url);
		} catch (e) {
			console.error(e);
			alert('Error setting default assistant');
		}
	}
</script>

<svelte:head>
	<title>Assistants | Settings</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h3 class="text-lg font-medium">Assistants</h3>
			<p class="text-muted-foreground text-sm">
				Create and manage system prompts to customize your AI assistant's persona and behavior.
			</p>
		</div>
		{#if !isCreating && !editingId}
			<Button onclick={startCreate} size="sm" class="gap-2">
				<Plus class="size-4" />
				Create New
			</Button>
		{/if}
	</div>

	{#if isCreating || editingId}
		<Card.Root class="border-border/50 bg-card/50 backdrop-blur-sm">
			<Card.Header class="pb-4">
				<Card.Title class="text-xl">{isCreating ? 'Create Assistant' : 'Edit Assistant'}</Card.Title>
				<p class="text-muted-foreground text-sm">
					{isCreating ? 'Set up a new AI assistant with a custom persona.' : 'Update your assistant\'s name and system prompt.'}
				</p>
			</Card.Header>
			<Card.Content class="space-y-6">
				<div class="space-y-3">
					<Label for="name" class="text-sm font-medium">Name</Label>
					<Input 
						id="name" 
						bind:value={formName} 
						placeholder="e.g. Coding Expert"
						class="h-11 bg-background/50 border-border/50 focus:border-primary/50 transition-colors"
					/>
					<p class="text-xs text-muted-foreground">Give your assistant a memorable name.</p>
				</div>
				<div class="space-y-3">
					<Label for="prompt" class="text-sm font-medium">System Prompt</Label>
					<Textarea
						id="prompt"
						bind:value={formSystemPrompt}
						placeholder="You are a helpful assistant that..."
						class="min-h-[180px] bg-background/50 border-border/50 focus:border-primary/50 transition-colors resize-y leading-relaxed"
					/>
					<p class="text-xs text-muted-foreground">Define your assistant's personality, expertise, and how it should respond.</p>
				</div>

				<!-- Default Settings Section -->
				<div class="border-t border-border/30 pt-6 mt-6">
					<h4 class="text-sm font-medium mb-4">Default Settings</h4>
					<p class="text-xs text-muted-foreground mb-4">These settings will be applied automatically when you switch to this assistant.</p>
					
					<div class="grid gap-4 sm:grid-cols-3">
						<div class="space-y-2">
							<Label for="defaultModel" class="text-sm font-medium">Default Model</Label>
							<select
								id="defaultModel"
								bind:value={formDefaultModelId}
								class="w-full h-10 px-3 rounded-md bg-background/50 border border-border/50 text-sm focus:border-primary/50 focus:outline-none transition-colors"
							>
								<option value="">None</option>
								{#each enabledModels as model (model.id)}
									<option value={model.modelId}>{model.modelId.split('/').pop() ?? model.modelId}</option>
								{/each}
							</select>
						</div>

						<div class="space-y-2">
							<Label for="defaultSearchMode" class="text-sm font-medium">Web Search</Label>
							<select
								id="defaultSearchMode"
								bind:value={formDefaultWebSearchMode}
								class="w-full h-10 px-3 rounded-md bg-background/50 border border-border/50 text-sm focus:border-primary/50 focus:outline-none transition-colors"
							>
								<option value="">None</option>
								<option value="off">Off</option>
								<option value="standard">Standard</option>
								<option value="deep">Deep</option>
							</select>
						</div>

						<div class="space-y-2">
							<Label for="defaultSearchProvider" class="text-sm font-medium">Search Provider</Label>
							<select
								id="defaultSearchProvider"
								bind:value={formDefaultWebSearchProvider}
								class="w-full h-10 px-3 rounded-md bg-background/50 border border-border/50 text-sm focus:border-primary/50 focus:outline-none transition-colors"
							>
								<option value="">None</option>
								<option value="linkup">Linkup</option>
								<option value="tavily">Tavily</option>
							</select>
						</div>
					</div>
				</div>
			</Card.Content>
			<Card.Footer class="flex justify-end gap-3 pt-4 border-t border-border/30">
				<Button variant="ghost" onclick={cancelForm} disabled={isSubmitting}>Cancel</Button>
				<Button onclick={handleSubmit} disabled={isSubmitting || !formName} class="min-w-[100px]">
					{#if isSubmitting}
						<LoaderCircle class="mr-2 size-4 animate-spin" />
						Saving...
					{:else}
						<Save class="mr-2 size-4" />
						Save
					{/if}
				</Button>
			</Card.Footer>
		</Card.Root>
	{/if}

	{#if isLoading}
		<div class="flex justify-center p-8">
			<LoaderCircle class="size-6 animate-spin text-muted-foreground" />
		</div>
	{:else}
		<div class="grid gap-4">
			{#each assistants as assistant (assistant.id)}
				<Card.Root class="border-border/50 bg-card/30 transition-all hover:bg-card/50 {editingId === assistant.id ? 'border-primary ring-1 ring-primary/20' : ''}">
					<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-3">
						<div class="flex items-center gap-2">
							<Card.Title class="text-base font-semibold">
								{assistant.name}
							</Card.Title>
							{#if assistant.isDefault}
								<span class="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Default</span>
							{/if}
						</div>
						{#if !isCreating && !editingId}
							<div class="flex gap-1">
								{#if !assistant.isDefault}
									<Button
										variant="ghost"
										size="icon"
										class="size-8 text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
										onclick={() => handleSetDefault(assistant.id)}
										title="Set as default"
									>
										<Star class="size-4" />
										<span class="sr-only">Set as Default</span>
									</Button>
								{/if}
								<Button
									variant="ghost"
									size="icon"
									class="size-8 hover:bg-primary/10 hover:text-primary transition-colors"
									onclick={() => startEdit(assistant)}
								>
									<Pencil class="size-4" />
									<span class="sr-only">Edit</span>
								</Button>
								{#if !assistant.isDefault}
									<Button
										variant="ghost"
										size="icon"
										class="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
										onclick={() => handleDelete(assistant.id)}
									>
										<Trash class="size-4" />
										<span class="sr-only">Delete</span>
									</Button>
								{/if}
							</div>
						{/if}
					</Card.Header>
					<Card.Content class="pt-0">
						{#if assistant.systemPrompt}
							<p class="text-sm text-muted-foreground line-clamp-3 font-mono bg-muted/30 rounded-lg p-3 border border-border/30">
								{assistant.systemPrompt}
							</p>
						{:else}
							<p class="text-sm text-muted-foreground/60 italic">No system prompt configured</p>
						{/if}
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>
