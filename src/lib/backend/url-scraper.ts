/**
 * URL Scraping module for extracting and scraping webpage content
 * Uses NanoGPT's Web Scraping API (https://nano-gpt.com/api/scrape-urls)
 */

const NANO_GPT_SCRAPE_URL = 'https://nano-gpt.com/api/scrape-urls';

// Regex to match HTTP/HTTPS URLs
const URL_REGEX = /https?:\/\/[^\s<>\[\]"'()]+/gi;

// Patterns to exclude from scraping
const EXCLUDED_PATTERNS = [
	/^https?:\/\/localhost/i,
	/^https?:\/\/127\./,
	/^https?:\/\/192\.168\./,
	/^https?:\/\/10\./,
	/^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./,
	/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/i, // YouTube URLs should use transcription endpoint
];

export interface ScrapeUrlResult {
	url: string;
	success: boolean;
	title?: string;
	content?: string;
	markdown?: string;
	error?: string;
}

export interface ScrapeSummary {
	requested: number;
	processed: number;
	successful: number;
	failed: number;
	totalCost?: number;
	stealthModeUsed: boolean;
}

export interface ScrapeResponse {
	results: ScrapeUrlResult[];
	summary: ScrapeSummary;
}

// Import YouTube video ID extraction from youtube-transcript module
import { extractYouTubeVideoId } from './youtube-transcript';

// Re-export for backward compatibility
export { extractYouTubeVideoId };

/**
 * Separate YouTube URLs from regular URLs
 */
export function extractUrlsByType(text: string): {
	regularUrls: string[];
	youtubeUrls: string[];
} {
	const matches = text.match(URL_REGEX);
	if (!matches) return { regularUrls: [], youtubeUrls: [] };

	const uniqueUrls = [...new Set(matches)];
	const regularUrls: string[] = [];
	const youtubeUrls: string[] = [];

	for (const url of uniqueUrls) {
		const cleanUrl = url.replace(/[.,;:!?)\]]+$/, '');

		if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/i.test(cleanUrl)) {
			youtubeUrls.push(cleanUrl);
		} else if (!EXCLUDED_PATTERNS.some((pattern) => pattern.test(cleanUrl))) {
			regularUrls.push(cleanUrl);
		}
	}

	return {
		regularUrls: regularUrls.slice(0, 5),
		youtubeUrls: youtubeUrls.slice(0, 5), // Also limit YouTube URLs
	};
}

/**
 * Extract valid URLs from a text string
 * Filters out localhost, private IPs, and YouTube URLs
 * @deprecated Use extractUrlsByType instead
 */
export function extractUrls(text: string): string[] {
	const { regularUrls } = extractUrlsByType(text);
	return regularUrls;
}

/**
 * Scrape URLs using NanoGPT's Web Scraping API
 */
export async function scrapeUrls(
	urls: string[],
	apiKey: string,
	stealthMode: boolean = false
): Promise<ScrapeResponse | null> {
	if (urls.length === 0) return null;

	try {
		const response = await fetch(NANO_GPT_SCRAPE_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
			},
			body: JSON.stringify({
				urls,
				stealthMode,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`[URL Scraper] API error: ${response.status} ${errorText}`);
			return null;
		}

		const data = (await response.json()) as ScrapeResponse;
		return data;
	} catch (error) {
		console.error(`[URL Scraper] Failed to scrape URLs: ${error}`);
		return null;
	}
}

/**
 * Format scraped results as context for the AI model
 */
export function formatScrapedContent(results: ScrapeUrlResult[]): string {
	const successfulResults = results.filter((r) => r.success && (r.markdown || r.content));

	if (successfulResults.length === 0) {
		return '';
	}

	const formattedPages = successfulResults
		.map((result, index) => {
			const content = result.markdown || result.content || '';
			// Truncate very long content to avoid context overflow
			const truncatedContent =
				content.length > 10000
					? content.substring(0, 10000) + '\n\n[Content truncated...]'
					: content;

			return `[Page ${index + 1}] ${result.title || 'Untitled'}
URL: ${result.url}

${truncatedContent}`;
		})
		.join('\n\n---\n\n');

	return `Scraped Page Content:

${formattedPages}

Instructions: Use the above scraped page content to answer the user's query. Reference the content where relevant.

`;
}

/**
 * Extract URLs from a message, scrape them, and return formatted context
 * This is the main function to use in the message generation flow
 */
export async function scrapeUrlsFromMessage(
	messageContent: string,
	apiKey: string
): Promise<{ content: string; successCount: number }> {
	const urls = extractUrls(messageContent);

	if (urls.length === 0) {
		return { content: '', successCount: 0 };
	}

	console.log(`[URL Scraper] Found ${urls.length} URLs to scrape:`, urls);

	const response = await scrapeUrls(urls, apiKey);

	if (!response || !response.results) {
		return { content: '', successCount: 0 };
	}

	console.log(
		`[URL Scraper] Scraped ${response.summary.successful}/${response.summary.requested} URLs successfully`
	);

	return {
		content: formatScrapedContent(response.results),
		successCount: response.summary.successful,
	};
}
