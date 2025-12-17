import * as cheerio from 'cheerio';

export interface ExtractedContent {
    title: string;
    content: string;
    metadata: {
        url: string;
        extractedAt: string;
        author?: string;
        description?: string;
    };
}

export class WebContentExtractor {
    /**
     * Extract main content from HTML
     */
    static extract(html: string, url: string): ExtractedContent {
        const $ = cheerio.load(html);

        // Remove scripts, styles, and other non-content elements
        $('script').remove();
        $('style').remove();
        $('nav').remove();
        $('header').remove();
        $('footer').remove();
        $('iframe').remove();
        $('noscript').remove();
        $('[aria-hidden="true"]').remove();

        // Extract Metadata
        const title =
            $('title').text().trim() ||
            $('meta[property="og:title"]').attr('content') ||
            'No Title';

        const description =
            $('meta[name="description"]').attr('content') ||
            $('meta[property="og:description"]').attr('content');

        const author =
            $('meta[name="author"]').attr('content') ||
            $('meta[property="article:author"]').attr('content');

        // Extract Main Content
        // Try common main content selectors
        let contentSelector = 'body';
        const selectors = [
            'article',
            'main',
            '#content',
            '.content',
            '.post-content',
            '.entry-content',
        ];

        for (const selector of selectors) {
            if ($(selector).length > 0) {
                contentSelector = selector;
                break;
            }
        }

        // Clean up the text
        const content = $(contentSelector)
            .text()
            .replace(/\s+/g, ' ') // Replace multiple spaces/newlines with single space
            .trim();

        return {
            title,
            content,
            metadata: {
                url,
                extractedAt: new Date().toISOString(),
                author,
                description,
            },
        };
    }
}
