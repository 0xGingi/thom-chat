<script lang="ts">
	import { useCachedQuery, api } from '$lib/cache/cached-query.svelte';
	import type { Doc } from '$lib/db/types';
	import { Button } from '$lib/components/ui/button';
	import Tooltip from '$lib/components/ui/tooltip.svelte';
	import DownloadIcon from '~icons/lucide/download';

	let { conversationId } = $props<{
		conversationId: string;
	}>();

	const conversationQuery = useCachedQuery(api.conversations.getById, () => ({
		id: conversationId,
	}));

	const messagesQuery = useCachedQuery(api.messages.getAllFromConversation, () => ({
		conversationId,
	}));

	function formatDate(timestamp: Date | number | undefined): string {
		if (!timestamp) return '';
		const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	function generateMarkdown(): string {
		const conversation = conversationQuery.data as Doc<'conversations'> | undefined;
		const messages = messagesQuery.data as Doc<'messages'>[] | undefined;

		if (!conversation || !messages) return '';

		let markdown = `# ${conversation.title || 'Untitled Conversation'}\n\n`;
		markdown += `**Exported on:** ${formatDate(new Date())}\n`;
		if (conversation.updatedAt) {
			markdown += `**Last updated:** ${formatDate(conversation.updatedAt)}\n`;
		}
		markdown += `\n---\n\n`;

		for (const message of messages) {
			const role = message.role === 'user' ? '**You**' : '**Assistant**';
			const modelInfo = message.modelId ? ` *(${message.modelId})*` : '';
			
			markdown += `### ${role}${message.role === 'assistant' ? modelInfo : ''}\n\n`;
			
			// Add images if present
			if (message.images && message.images.length > 0) {
				for (const image of message.images) {
					const fileName = image.fileName || 'image';
					markdown += `![${fileName}](${image.url})\n\n`;
				}
			}
			
			// Add reasoning if present
			if (message.reasoning) {
				markdown += `<details>\n<summary>💭 Reasoning</summary>\n\n${message.reasoning}\n\n</details>\n\n`;
			}
			
			markdown += `${message.content}\n\n`;
			markdown += `---\n\n`;
		}

		return markdown;
	}

	function downloadMarkdown() {
		const conversation = conversationQuery.data as Doc<'conversations'> | undefined;
		if (!conversation) return;

		const markdown = generateMarkdown();
		const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		
		const a = document.createElement('a');
		a.href = url;
		// Sanitize title for filename
		const sanitizedTitle = (conversation.title || 'conversation')
			.replace(/[^a-zA-Z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.toLowerCase()
			.slice(0, 50);
		a.download = `${sanitizedTitle}.md`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
</script>

<Tooltip>
	{#snippet trigger(tooltip)}
		<Button
			onclick={downloadMarkdown}
			variant="ghost"
			size="icon"
			class="size-8"
			disabled={!conversationQuery.data || !messagesQuery.data}
			{...tooltip.trigger}
		>
			<DownloadIcon class="size-4" />
		</Button>
	{/snippet}
	Export as Markdown
</Tooltip>
