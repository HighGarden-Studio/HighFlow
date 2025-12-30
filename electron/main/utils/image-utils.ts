import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Save Base64 image to a temporary file
 */
export function saveBase64ImageToTempFile(base64Data: string, taskId?: number | string): string {
    try {
        // Detect format: data:image/png;base64,... or raw base64
        let imageData = base64Data;
        let extension = 'png';

        const dataUrlMatch = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
        if (dataUrlMatch) {
            extension = dataUrlMatch[1] ?? 'png';
            imageData = dataUrlMatch[2] ?? base64Data;
        }

        const tempDir = path.join(os.tmpdir(), 'workflow-manager-images');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const timestamp = Date.now();
        const filename = taskId
            ? `task-${taskId}-${timestamp}.${extension}`
            : `image-${timestamp}.${extension}`;
        const filePath = path.join(tempDir, filename);

        const buffer = Buffer.from(imageData, 'base64');
        fs.writeFileSync(filePath, buffer);

        console.log(`✨ Saved image to temp file: ${filePath}`);
        return filePath;
    } catch (error) {
        console.error('Failed to save base64 image to temp file:', error);
        return '[Image save failed]';
    }
}

/**
 * Check if string is a base64 image
 */
export function isBase64Image(str: string): boolean {
    if (str.startsWith('data:image/')) {
        return true;
    }

    // Heuristic: long string with base64 characters
    if (str.length > 50000 && /^[A-Za-z0-9+/=\s]+$/.test(str)) {
        return true;
    }

    return false;
}
