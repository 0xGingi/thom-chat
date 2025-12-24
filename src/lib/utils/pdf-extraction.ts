// PDF text extraction utility
import { readFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function extractTextFromPDF(filePath: string): Promise<string> {
	try {
		// Try using pdftotext (part of poppler-utils)
		try {
			const { stdout } = await execAsync(`pdftotext "${filePath}" -`, { 
				encoding: 'utf8',
				maxBuffer: 10 * 1024 * 1024 // 10MB buffer
			});
			return stdout.trim();
		} catch (error) {
			console.warn('pdftotext not available, trying alternative method');
		}

		// Fallback: try using pdf-parse if available
		try {
			const { PDFParse } = await import('pdf-parse');
			const dataBuffer = readFileSync(filePath);
			// @ts-ignore - PDFParse types might differ or be missing
			const parser = new PDFParse({ data: dataBuffer });
			const data = await parser.getText();
			await parser.destroy();
			return data.text;
		} catch (error) {
			console.warn('pdf-parse extraction failed', error);
		}

		// If no extraction method works, return a placeholder
		return '[PDF content could not be extracted. The PDF has been stored and is available for download.]';
		
	} catch (error) {
		console.error('Failed to extract text from PDF:', error);
		return '[Error: Failed to extract PDF content]';
	}
}