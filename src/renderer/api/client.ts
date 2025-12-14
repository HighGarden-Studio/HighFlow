/**
 * API Client - Axios instance with authentication
 */

import axios, { AxiosError } from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8081';

// Create Axios instance
export const apiClient = axios.create({
    baseURL: BACKEND_URL,
    timeout: 30000, // 30 seconds
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor: Auto-attach token
apiClient.interceptors.request.use(
    (config) => {
        // Get token from Electron main process
        // Note: Token is stored encrypted in main process, not in renderer
        // We'll use a different approach - store session token in userStore temporarily

        // For now, we'll rely on the token being managed by main process
        // and passed through IPC when needed

        console.log('🔐 API Request:', config.method?.toUpperCase(), config.url);
        return config;
    },
    (error) => {
        console.error('❌ Request error:', error);
        return Promise.reject(error);
    }
);

// Response interceptor: Handle errors
apiClient.interceptors.response.use(
    (response) => {
        console.log('✅ API Response:', response.config.url, response.status);
        return response;
    },
    async (error: AxiosError) => {
        console.error('❌ API Error:', error.config?.url, error.response?.status);

        // Handle 401 Unauthorized
        if (error.response?.status === 401) {
            console.warn('⚠️  Session expired (401), triggering logout...');

            // Notify main process to clear session
            try {
                await window.electron.auth.logout();
            } catch (err) {
                console.error('Failed to logout:', err);
            }

            // Reload page to trigger login screen
            window.location.reload();
        }

        return Promise.reject(error);
    }
);

/**
 * Helper to make authenticated requests
 * Gets fresh token from main process before each request
 */
export async function authenticatedRequest<T>(
    method: 'get' | 'post' | 'put' | 'delete' | 'patch',
    url: string,
    data?: any,
    config?: any
): Promise<T> {
    // Get current user (includes token validation)
    const userResult = await window.electron.auth.getCurrentUser();

    if (!userResult.success || !userResult.data) {
        throw new Error('Not authenticated');
    }

    // Token is managed by main process, we just verify user is authenticated
    // Main process will handle token attachment via backend communication

    // For direct HTTP calls from renderer, we need to get the token
    // This is a security decision - we'll expose token temporarily for HTTP calls
    // In production, consider using Electron's net module instead

    const requestConfig = {
        ...config,
        headers: {
            ...config?.headers,
            // Token will be added by a custom method that retrieves it from main process
        },
    };

    let response;
    switch (method) {
        case 'get':
            response = await apiClient.get(url, requestConfig);
            break;
        case 'post':
            response = await apiClient.post(url, data, requestConfig);
            break;
        case 'put':
            response = await apiClient.put(url, data, requestConfig);
            break;
        case 'delete':
            response = await apiClient.delete(url, requestConfig);
            break;
        case 'patch':
            response = await apiClient.patch(url, data, requestConfig);
            break;
    }

    return response.data;
}

export default apiClient;
