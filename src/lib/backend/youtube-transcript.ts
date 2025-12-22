/**
 * YouTube Transcript module for fetching YouTube video transcripts
 * Uses NanoGPT's YouTube Transcript API
 */

const NANO_GPT_TRANSCRIPT_URL = 'https://nano-gpt.com/api/youtube-transcribe';

export interface TranscriptResult {
	url: string;
	success: boolean;
	title?: string;
	transcript?: string;
	error?: string;
}

export interface YouTubeTranscriptResponse {
	transcripts: TranscriptResult[];
	summary: {
		requested: number;
		processed: number;
		successful: number;
		failed: number;
		totalCost: number;
	};
}

export async function fetchYouTubeTranscripts(
	urls: string[],
	apiKey: string
): Promise<YouTubeTranscriptResponse> {
	console.log(
		`[YouTube Transcripts] Fetching transcripts for ${urls.length} URLs: ${urls.join(', ')}`
	);

	try {
		const response = await fetch(NANO_GPT_TRANSCRIPT_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
			},
			body: JSON.stringify({
				urls: urls,
			}),
		});

		console.log(`[YouTube Transcripts] API response status: ${response.status}`);

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`[YouTube Transcripts] API error: ${response.status} ${errorText}`);

			// Provide specific guidance for common errors
			let errorMessage = `API error: ${response.status} ${errorText}`;
			if (response.status === 401) {
				errorMessage = `Authentication failed (401): Invalid API key or insufficient permissions.`;
			} else if (response.status === 402) {
				errorMessage = `Payment required (402): Insufficient balance for YouTube transcript requests.`;
			} else if (response.status === 429) {
				errorMessage = `Rate limit exceeded (429): Too many requests. Please wait before trying again.`;
			}

			throw new Error(errorMessage);
		}

		const data = (await response.json()) as YouTubeTranscriptResponse;
		console.log(
			`[YouTube Transcripts] Successfully fetched ${data.summary.successful}/${data.summary.requested} transcripts. Cost: $${data.summary.totalCost}`
		);

		return data;
	} catch (error) {
		console.error(`[YouTube Transcripts] Failed to fetch transcripts:`, error);

		// Return a failure response that matches the expected format
		return {
			transcripts: urls.map((url) => ({
				url,
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			})),
			summary: {
				requested: urls.length,
				processed: urls.length,
				successful: 0,
				failed: urls.length,
				totalCost: 0,
			},
		};
	}
}

export async function processYouTubeUrls(
	youtubeUrls: string[],
	apiKey: string
): Promise<{ content: string; successCount: number; cost: number }> {
	if (youtubeUrls.length === 0) {
		return { content: '', successCount: 0, cost: 0 };
	}

	console.log(`[YouTube Transcripts] Processing ${youtubeUrls.length} YouTube URLs`);

	// Validate URLs
	const validUrls: string[] = [];
	const invalidUrls: string[] = [];

	for (const url of youtubeUrls) {
		const videoId = extractYouTubeVideoId(url);
		if (videoId) {
			validUrls.push(url);
		} else {
			invalidUrls.push(url);
		}
	}

	if (validUrls.length === 0) {
		const content = `YouTube Video Processing Failed:

All provided YouTube URLs were invalid or not in a supported format.

Supported YouTube URL formats:
- https://www.youtube.com/watch?v=VIDEO_ID
- https://youtu.be/VIDEO_ID
- https://youtube.com/embed/VIDEO_ID
- https://m.youtube.com/watch?v=VIDEO_ID
- https://youtube.com/live/VIDEO_ID

Instructions: Let the user know they need to provide valid YouTube URLs.

`;
		return { content, successCount: 0, cost: 0 };
	}

	// Fetch transcripts using the NanoGPT API
	const response = await fetchYouTubeTranscripts(validUrls, apiKey);
	const { transcripts, summary } = response;

	if (summary.successful === 0) {
		// All failed - provide helpful error message
		const failedTranscripts = transcripts.filter((t) => !t.success);
		const mainError = failedTranscripts[0]?.error || 'Unknown error';

		console.log(`[YouTube Transcripts] All transcripts failed. Main error: ${mainError}`);

		const content = `YouTube Video Processing Failed:

YouTube URLs were detected but transcript extraction failed with the following error:
${mainError}

Possible solutions:
1. Verify the API key has sufficient balance and transcript access permissions
2. Ensure the YouTube videos have available captions/transcripts
3. Check if the videos are public and not age-restricted or deleted
4. Try again later if you received a rate limit error

Instructions: Let the user know that YouTube transcript processing is currently unavailable.

`;
		return { content, successCount: 0, cost: 0 };
	}

	// Format successful transcripts
	const successfulTranscripts = transcripts.filter((t) => t.success);
	const failedTranscripts = transcripts.filter((t) => !t.success);

	const formattedTranscripts = successfulTranscripts
		.map((result, index) => {
			const transcript = result.transcript || '';
			// Truncate very long transcripts
			const truncatedTranscript =
				transcript.length > 15000
					? transcript.substring(0, 15000) + '\n\n[Transcript truncated...]'
					: transcript;

			return `[YouTube Video ${index + 1}] ${result.title || 'Unknown Title'}
URL: ${result.url}

${truncatedTranscript}`;
		})
		.join('\n\n---\n\n');

	// Add info about any failed transcripts
	let failureInfo = '';
	if (failedTranscripts.length > 0) {
		failureInfo = `\n\nNote: ${failedTranscripts.length} YouTube video(s) could not be processed:\n`;
		failureInfo += failedTranscripts
			.map((t) => `- ${t.url}: ${t.error || 'Unknown error'}`)
			.join('\n');
		failureInfo += '\n';
	}

	if (invalidUrls.length > 0) {
		failureInfo += `\n\nNote: ${invalidUrls.length} URL(s) were invalid and skipped:\n`;
		failureInfo += invalidUrls.map((url) => `- ${url}`).join('\n');
		failureInfo += '\n';
	}

	const content = `YouTube Video Transcripts:

${formattedTranscripts}${failureInfo}
Instructions: Use the above YouTube video transcripts to answer the user's query. Reference specific content from the videos where relevant.

`;

	return {
		content,
		successCount: summary.successful,
		cost: summary.totalCost,
	};
}

/**
 * Extract YouTube video ID from various YouTube URL formats
 */
export function extractYouTubeVideoId(url: string): string | null {
	const patterns = [
		/youtube\.com\/watch\?v=([^&]+)/,
		/youtu\.be\/([^?]+)/,
		/youtube\.com\/embed\/([^?]+)/,
		/youtube\.com\/v\/([^?]+)/,
		/youtube\.com\/live\/([^?]+)/,
	];

	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match && match[1]) return match[1];
	}
	return null;
}
