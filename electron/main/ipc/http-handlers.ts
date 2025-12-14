/**
 * IPC handlers for HTTP requests (with token)
 */

import { ipcMain } from 'electron';
import { loadSessionToken } from '../auth/google-oauth';
import { config } from '../config';

export function registerHttpHandlers() {
    // Generic authenticated HTTP request
    ipcMain.handle('http:request', async (_event, { method, url, data, params }) => {
        try {
            const token = loadSessionToken();

            if (!token) {
                return { success: false, error: 'Not authenticated' };
            }

            const fullUrl = url.startsWith('http') ? url : `${config.BACKEND_URL}${url}`;

            // Build query string
            const queryString = params ? '?' + new URLSearchParams(params).toString() : '';

            const fetchOptions: RequestInit = {
                method: method.toUpperCase(),
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            };

            if (data && (method === 'post' || method === 'put' || method === 'patch')) {
                fetchOptions.body = JSON.stringify(data);
            }

            const response = await fetch(fullUrl + queryString, fetchOptions);

            if (!response.ok) {
                const errorText = await response.text();
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch {
                    errorData = { message: errorText };
                }

                return {
                    success: false,
                    status: response.status,
                    error: errorData.message || `HTTP ${response.status}`,
                    data: errorData,
                };
            }

            const responseData = await response.json();

            return {
                success: true,
                status: response.status,
                data: responseData,
            };
        } catch (error: any) {
            console.error('HTTP request error:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    });

    console.log('✅ HTTP IPC handlers registered');
}
