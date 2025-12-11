/**
 * Result Processing Utilities
 *
 * Extract images, filter code blocks, and format results for notifications
 */

/**
 * Extract image URLs/paths from markdown content
 */
export function extractImages(content: string, maxImages = 3): string[] {
    const images: string[] = [];

    // Match markdown images: ![alt](url)
    const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;

    while ((match = markdownImageRegex.exec(content)) !== null && images.length < maxImages) {
        images.push(match[2]);
    }

    // Match HTML img tags: <img src="url">
    const htmlImageRegex = /<img[^>]+src="([^">]+)"/g;
    while ((match = htmlImageRegex.exec(content)) !== null && images.length < maxImages) {
        images.push(match[1]);
    }

    return images.slice(0, maxImages);
}

/**
 * Filter out code blocks from markdown content
 */
export function filterCodeBlocks(content: string): string {
    // Remove fenced code blocks (```language ... ```)
    let filtered = content.replace(/```[\s\S]*?```/g, '_[Code Block Removed]_');

    // Remove inline code
    filtered = filtered.replace(/`[^`]+`/g, '');

    // Remove HTML/XML tags
    filtered = filtered.replace(/<[^>]+>/g, '');

    // Limit length
    const maxLength = 1000;
    if (filtered.length > maxLength) {
        filtered = filtered.substring(0, maxLength) + '...';
    }

    return filtered.trim();
}

/**
 * Extract summary from result (first paragraph or first 200 chars)
 */
export function extractSummary(content: string, maxLength = 200): string {
    // Remove markdown headers
    let text = content.replace(/^#+\s+/gm, '');

    // Get first paragraph
    const paragraphs = text.split('\n\n');
    let summary = paragraphs[0] || '';

    // Remove code blocks
    summary = filterCodeBlocks(summary);

    // Limit length
    if (summary.length > maxLength) {
        summary = summary.substring(0, maxLength) + '...';
    }

    return summary.trim();
}

/**
 * Check if content is primarily code
 */
export function isPrimarilyCode(content: string): boolean {
    const codeBlockMatches = content.match(/```[\s\S]*?```/g);
    if (!codeBlockMatches) return false;

    const codeLength = codeBlockMatches.reduce((sum, block) => sum + block.length, 0);
    const totalLength = content.length;

    return codeLength / totalLength > 0.5;
}

/**
 * Detect programming language from content
 */
export function detectLanguage(content: string): string | null {
    const match = content.match(/```(\w+)/);
    return match ? match[1].toLowerCase() : null;
}

/**
 * Get file extension from language
 */
export function getFileExtension(language: string | null): string {
    const extensions: Record<string, string> = {
        javascript: '.js',
        typescript: '.ts',
        python: '.py',
        java: '.java',
        html: '.html',
        css: '.css',
        json: '.json',
        yaml: '.yaml',
        sql: '.sql',
        bash: '.sh',
        shell: '.sh',
    };

    return language ? extensions[language] || '.txt' : '.txt';
}
