import mammoth from 'mammoth';
import pdf from 'pdf-parse';
import * as fs from 'fs/promises';

export interface ParsedDocument {
    content: string;
    metadata: Record<string, any>;
    raw?: any;
}

export class DocumentParser {
    static async parse(
        filePath: string,
        type: 'docx' | 'pdf' | 'text' | 'markdown'
    ): Promise<ParsedDocument> {
        if (type === 'docx') {
            return this.parseDocx(filePath);
        }
        if (type === 'pdf') {
            return this.parsePdf(filePath);
        }
        if (type === 'text' || type === 'markdown') {
            const content = await fs.readFile(filePath, 'utf-8');
            return { content, metadata: { type } };
        }
        throw new Error(`Unsupported document type: ${type}`);
    }

    private static async parseDocx(filePath: string): Promise<ParsedDocument> {
        try {
            const buffer = await fs.readFile(filePath);
            const result = await mammoth.extractRawText({ buffer });
            return {
                content: result.value,
                metadata: {
                    messages: result.messages, // Warnings/Errors
                    type: 'docx',
                },
            };
        } catch (e: any) {
            throw new Error(`Failed to parse DOCX: ${e.message}`);
        }
    }

    private static async parsePdf(filePath: string): Promise<ParsedDocument> {
        try {
            const buffer = await fs.readFile(filePath);
            const data = await pdf(buffer);
            return {
                content: data.text,
                metadata: {
                    numpages: data.numpages,
                    info: data.info,
                    metadata: data.metadata,
                    version: data.version,
                    type: 'pdf',
                },
            };
        } catch (e: any) {
            throw new Error(`Failed to parse PDF: ${e.message}`);
        }
    }
}
