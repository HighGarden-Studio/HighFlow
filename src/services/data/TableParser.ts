import * as fs from 'fs/promises';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';

export interface TableResult {
    columns: string[];
    rows: Record<string, any>[];
    metadata: {
        sheetName?: string;
        rowCount: number;
        format: 'csv' | 'excel';
    };
}

export class TableParser {
    /**
     * Parse a file (CSV or Excel) and return structured table data
     */
    static async parseFile(filePath: string): Promise<TableResult> {
        const ext = path.extname(filePath).toLowerCase();

        if (ext === '.csv') {
            return this.parseCSV(filePath);
        } else if (['.xlsx', '.xls'].includes(ext)) {
            return this.parseExcel(filePath);
        }

        throw new Error(`Unsupported file format for table parsing: ${ext}`);
    }

    /**
     * Parse CSV file using csv-parse
     */
    private static async parseCSV(filePath: string): Promise<TableResult> {
        const content = await fs.readFile(filePath, 'utf-8');

        // Parse with auto-discovery of delimiter, cast types, and columns
        const records = parse(content, {
            columns: true,
            skip_empty_lines: true,
            cast: true,
            bom: true,
        });

        if (records.length === 0) {
            return {
                columns: [],
                rows: [],
                metadata: { rowCount: 0, format: 'csv' },
            };
        }

        // Extract columns from the first record keys
        const firstRecord = records[0] as Record<string, any>;
        const columns = Object.keys(firstRecord);

        return {
            columns,
            rows: records as Record<string, any>[],
            metadata: {
                rowCount: records.length,
                format: 'csv',
            },
        };
    }

    /**
     * Parse Excel file using xlsx (SheetJS)
     */
    private static async parseExcel(filePath: string): Promise<TableResult> {
        // Read file buffer
        const buffer = await fs.readFile(filePath);

        // Parse workbook
        const workbook = XLSX.read(buffer, { type: 'buffer' });

        if (workbook.SheetNames.length === 0) {
            throw new Error('Excel file contains no sheets');
        }

        // Use the first sheet by default
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error('Excel file contains no valid sheet name');

        const sheet = workbook.Sheets[sheetName];
        if (!sheet) throw new Error('Excel sheet data not found');

        // Convert to JSON
        // header: 1 returns array of arrays (good for finding headers), header: 'A' returns raw.
        // We use xlsx.utils.sheet_to_json directly which assumes first row is header by default
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

        if (rows.length === 0) {
            return {
                columns: [],
                rows: [],
                metadata: { sheetName, rowCount: 0, format: 'excel' },
            };
        }

        // Extract columns from first row
        const firstRow = rows[0] as Record<string, any>;
        const columns = Object.keys(firstRow);

        return {
            columns,
            rows,
            metadata: {
                sheetName,
                rowCount: rows.length,
                format: 'excel',
            },
        };
    }
}
