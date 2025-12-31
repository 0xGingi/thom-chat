<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils/utils';
	import type { PageData } from './$types';
	import StarIcon from '~icons/lucide/star';
	import TrendingUpIcon from '~icons/lucide/trending-up';
	import DollarSignIcon from '~icons/lucide/dollar-sign';
	import MessageSquareIcon from '~icons/lucide/message-square';
	import ThumbsUpIcon from '~icons/lucide/thumbs-up';
	import ThumbsDownIcon from '~icons/lucide/thumbs-down';
	import RefreshCwIcon from '~icons/lucide/refresh-cw';
	import CheckCircleIcon from '~icons/lucide/check-circle';
	import SparklesIcon from '~icons/lucide/sparkles';
	import ZapIcon from '~icons/lucide/zap';

	let { data }: { data: PageData } = $props();

	let sortColumn = $state<'model' | 'rating' | 'uses' | 'cost' | 'thumbsRatio' | 'speed'>('uses');
	let sortDirection = $state<'asc' | 'desc'>('desc');
	let isRefreshing = $state(false);

	const sortedStats = $derived.by(() => {
		const stats = [...data.stats];
		stats.sort((a, b) => {
			let aVal: number;
			let bVal: number;

				switch (sortColumn) {
					case 'model':
						return sortDirection === 'asc'
							? a.modelId.localeCompare(b.modelId)
							: b.modelId.localeCompare(a.modelId);
					case 'rating':
						aVal = a.avgRating ?? 0;
						bVal = b.avgRating ?? 0;
						break;
					case 'uses':
						aVal = a.totalMessages;
						bVal = b.totalMessages;
						break;
					case 'cost':
						aVal = a.totalMessages > 0 ? a.totalCost / a.totalMessages : 0;
						bVal = b.totalMessages > 0 ? b.totalCost / b.totalMessages : 0;
						break;
					case 'thumbsRatio':
						const aTotal = a.thumbsUpCount + a.thumbsDownCount;
						const bTotal = b.thumbsUpCount + b.thumbsDownCount;
						aVal = aTotal > 0 ? a.thumbsUpCount / aTotal : 0;
						bVal = bTotal > 0 ? b.thumbsUpCount / bTotal : 0;
						break;
					case 'speed':
						aVal = getTokensPerSecond(a);
						bVal = getTokensPerSecond(b);
						break;
					default:
						aVal = 0;
						bVal = 0;
				}

			return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
		});
		return stats;
	});

	function toggleSort(column: typeof sortColumn) {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = 'desc';
		}
	}

	async function refreshStats() {
		isRefreshing = true;
		try {
			await fetch('/api/db/model-performance?recalculate=true');
			window.location.reload();
		} catch (error) {
			console.error('Failed to refresh stats:', error);
		} finally {
			isRefreshing = false;
		}
	}

	function formatCost(cost: number): string {
		return `$${cost.toFixed(6)}`;
	}

	function getThumbsRatio(upCount: number, downCount: number): string {
		const total = upCount + downCount;
		if (total === 0) return 'N/A';
		const ratio = (upCount / total) * 100;
		return `${ratio.toFixed(0)}%`;
	}

	function getTokensPerSecond(stat: (typeof sortedStats)[0]): number {
		if (!stat.avgTokens || !stat.avgResponseTime || stat.avgResponseTime <= 0) return 0;
		return stat.avgTokens / (stat.avgResponseTime / 1000);
	}

	function getTopCategories(stat: (typeof sortedStats)[0]): Array<{ name: string; count: number }> {
		const categories = [
			{ name: 'Accurate', count: stat.accurateCount },
			{ name: 'Helpful', count: stat.helpfulCount },
			{ name: 'Creative', count: stat.creativeCount },
			{ name: 'Fast', count: stat.fastCount },
			{ name: 'Cost-effective', count: stat.costEffectiveCount },
		];
		return categories
			.filter((c) => c.count > 0)
			.sort((a, b) => b.count - a.count)
			.slice(0, 3);
	}

	function getCategoryIcon(name: string) {
		switch (name) {
			case 'Accurate':
				return CheckCircleIcon;
			case 'Helpful':
				return ThumbsUpIcon;
			case 'Creative':
				return SparklesIcon;
			case 'Fast':
				return ZapIcon;
			case 'Cost-effective':
				return DollarSignIcon;
			default:
				return StarIcon;
		}
	}
</script>

<svelte:head>
	<title>Model Analytics - nanochat</title>
</svelte:head>

<div class="container mx-auto max-w-7xl p-6">
	<div class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">Model Performance Analytics</h1>
			<p class="text-muted-foreground mt-2">Track and compare AI model performance</p>
		</div>
		<Button onclick={refreshStats} disabled={isRefreshing}>
			<RefreshCwIcon class={cn('mr-2 size-4', { 'animate-spin': isRefreshing })} />
			{isRefreshing ? 'Refreshing...' : 'Refresh Stats'}
		</Button>
	</div>

	<!-- Insights Cards -->
	{#if data.stats.length > 0}
		<div class="mb-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			<div class="bg-card rounded-lg border p-6">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-muted-foreground text-sm">Total Messages</p>
						<p class="text-2xl font-bold">{data.insights.totalMessages.toLocaleString()}</p>
					</div>
					<MessageSquareIcon class="text-muted-foreground size-8" />
				</div>
			</div>

			<div class="bg-card rounded-lg border p-6">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-muted-foreground text-sm">Total Cost</p>
						<p class="text-2xl font-bold">${data.insights.totalCost.toFixed(2)}</p>
					</div>
					<DollarSignIcon class="text-muted-foreground size-8" />
				</div>
			</div>

			<div class="bg-card rounded-lg border p-6">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-muted-foreground text-sm">Avg Rating</p>
						<p class="text-2xl font-bold">
							{data.insights.avgRating ? data.insights.avgRating.toFixed(2) : 'N/A'}
						</p>
					</div>
					<StarIcon class="text-muted-foreground size-8" />
				</div>
			</div>
		</div>

		<div class="bg-card mb-8 rounded-lg border p-6">
			<div class="flex items-center justify-between">
				<div class="min-w-0 flex-1">
					<p class="text-muted-foreground mb-1 text-sm">Most Used Model</p>
					<p class="text-2xl font-bold break-words" title={data.insights.mostUsedModel?.modelId}>
						{data.insights.mostUsedModel?.modelId ?? 'N/A'}
					</p>
				</div>
				<TrendingUpIcon class="text-muted-foreground ml-4 size-8 flex-shrink-0" />
			</div>
		</div>

		<!-- Additional Insights -->
		<div class="mb-8 grid gap-4 md:grid-cols-2">
			{#if data.insights.bestRatedModel}
				<div class="bg-card rounded-lg border p-6">
					<h3 class="mb-2 text-lg font-semibold">Best Rated Model</h3>
					<p class="text-muted-foreground text-sm">
						<strong>{data.insights.bestRatedModel.modelId}</strong>
						with an average rating of
						<strong>{data.insights.bestRatedModel.avgRating?.toFixed(2)}</strong>
						({data.insights.bestRatedModel.totalMessages} messages)
					</p>
				</div>
			{/if}

			{#if data.insights.mostCostEffective}
				<div class="bg-card rounded-lg border p-6">
					<h3 class="mb-2 text-lg font-semibold">Most Cost-Effective</h3>
					<p class="text-muted-foreground text-sm">
						<strong>{data.insights.mostCostEffective.modelId}</strong>
						at
						<strong
							>{formatCost(
								data.insights.mostCostEffective.totalCost /
									data.insights.mostCostEffective.totalMessages
							)}</strong
						>
						per message
					</p>
				</div>
			{/if}

			{#if data.insights.fastestModel}
				<div class="bg-card rounded-lg border p-6">
					<h3 class="mb-2 text-lg font-semibold">Fastest Model</h3>
					<p class="text-muted-foreground text-sm">
						<strong>{data.insights.fastestModel.modelId}</strong>
						with an average speed of
						<strong>{getTokensPerSecond(data.insights.fastestModel).toFixed(1)} tokens/sec</strong>
						({data.insights.fastestModel.totalMessages} messages)
					</p>
				</div>
			{/if}
		</div>

		<!-- Model Comparison Table -->
		<div class="bg-card rounded-lg border">
			<div class="p-6">
				<h2 class="mb-4 text-xl font-bold">Model Comparison</h2>
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead>
							<tr class="border-border border-b">
								<th class="pr-4 pb-3 text-left">
									<button
										type="button"
										onclick={() => toggleSort('model')}
										class="hover:text-foreground text-muted-foreground flex items-center gap-1 font-medium"
									>
										Model
										{#if sortColumn === 'model'}
											<span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
										{/if}
									</button>
								</th>
								<th class="pr-4 pb-3 text-center">
									<button
										type="button"
										onclick={() => toggleSort('rating')}
										class="hover:text-foreground text-muted-foreground flex items-center gap-1 font-medium"
									>
										Rating
										{#if sortColumn === 'rating'}
											<span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
										{/if}
									</button>
								</th>
								<th class="pr-4 pb-3 text-center">
									<button
										type="button"
										onclick={() => toggleSort('uses')}
										class="hover:text-foreground text-muted-foreground flex items-center gap-1 font-medium"
									>
										Uses
										{#if sortColumn === 'uses'}
											<span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
										{/if}
									</button>
								</th>
								<th class="pr-4 pb-3 text-center">
									<button
										type="button"
										onclick={() => toggleSort('cost')}
										class="hover:text-foreground text-muted-foreground flex items-center gap-1 font-medium"
									>
										Avg Cost
										{#if sortColumn === 'cost'}
											<span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
										{/if}
									</button>
								</th>
								<th class="pr-4 pb-3 text-center">
									<button
										type="button"
										onclick={() => toggleSort('thumbsRatio')}
										class="hover:text-foreground text-muted-foreground flex items-center gap-1 font-medium"
									>
										Thumbs Up
										{#if sortColumn === 'thumbsRatio'}
											<span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
										{/if}
									</button>
								</th>
								<th class="pr-4 pb-3 text-center">
									<button
										type="button"
										onclick={() => toggleSort('speed')}
										class="hover:text-foreground text-muted-foreground flex items-center gap-1 font-medium"
									>
										Speed (t/s)
										{#if sortColumn === 'speed'}
											<span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
										{/if}
									</button>
								</th>
								<th class="pr-4 pb-3 text-center">
									<span class="text-muted-foreground font-medium">Top Categories</span>
								</th>
								<th class="pb-3 text-center">
									<span class="text-muted-foreground font-medium">Errors</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{#each sortedStats as stat}
								<tr class="border-border border-b last:border-b-0">
									<td class="py-3 pr-4">
										<div>
											<div class="font-medium" title={stat.modelId}>{stat.modelId}</div>
											<div class="text-muted-foreground text-xs">{stat.provider}</div>
										</div>
									</td>
									<td class="py-3 pr-4 text-center">
										<div class="flex items-center justify-center gap-1">
											{#if stat.avgRating !== null}
												<StarIcon class="size-4 fill-yellow-500 text-yellow-500" />
												<span>{stat.avgRating.toFixed(2)}</span>
											{:else}
												<span class="text-muted-foreground">N/A</span>
											{/if}
										</div>
									</td>
									<td class="py-3 pr-4 text-center">{stat.totalMessages}</td>
									<td class="py-3 pr-4 text-center">
										{formatCost(stat.totalCost / stat.totalMessages)}
									</td>
									<td class="py-3 pr-4">
										<div class="flex items-center justify-center gap-2">
											<div class="flex items-center gap-1">
												<ThumbsUpIcon class="size-4 text-green-500" />
												<span class="text-sm">{stat.thumbsUpCount}</span>
											</div>
											<div class="flex items-center gap-1">
												<ThumbsDownIcon class="size-4 text-red-500" />
												<span class="text-sm">{stat.thumbsDownCount}</span>
											</div>
											<span class="text-muted-foreground text-sm">
												({getThumbsRatio(stat.thumbsUpCount, stat.thumbsDownCount)})
											</span>
										</div>
									</td>
									<td class="py-3 pr-4 text-center">
										{#if stat.avgTokens !== null && stat.avgTokens !== undefined && stat.avgResponseTime && stat.avgResponseTime > 0}
											{@const tps = getTokensPerSecond(stat)}
											<span>{tps.toFixed(1)}</span>
										{:else}
											<span class="text-muted-foreground text-sm">N/A</span>
										{/if}
									</td>
									<td class="py-3 pr-4">
										{#if getTopCategories(stat).length > 0}
											{@const topCategories = getTopCategories(stat)}
											<div class="flex flex-wrap items-center justify-center gap-1">
												{#each topCategories as category}
													{@const Icon = getCategoryIcon(category.name)}
													<span
														class="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
														title={`${category.name}: ${category.count}`}
													>
														<Icon class="size-3" />
														{category.name}
														<span class="text-muted-foreground">{category.count}</span>
													</span>
												{/each}
											</div>
										{:else}
											<span class="text-muted-foreground text-sm">—</span>
										{/if}
									</td>
									<td class="py-3 text-center">
										<span
											class={cn('text-sm', {
												'text-destructive': stat.errorCount > 0,
												'text-muted-foreground': stat.errorCount === 0,
											})}
										>
											{stat.errorCount}
										</span>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	{:else}
		<div class="bg-card flex flex-col items-center justify-center rounded-lg border p-12">
			<MessageSquareIcon class="text-muted-foreground mb-4 size-16" />
			<h2 class="mb-2 text-xl font-semibold">No Data Yet</h2>
			<p class="text-muted-foreground text-center">
				Start chatting with AI models to see performance analytics here.
			</p>
		</div>
	{/if}
</div>
