/**
 * Application Configuration
 */

export const config = {
    // Google OAuth
    GOOGLE_CLIENT_ID: '640717443650-2c4butc5qp8kfrfhg4s6n4kha8v14o0d.apps.googleusercontent.com',
    OAUTH_REDIRECT_URI: 'http://127.0.0.1:45678/callback',
    OAUTH_SCOPES: 'openid email profile',

    // Backend API
    BACKEND_URL: process.env.BACKEND_URL || process.env.VITE_BACKEND_URL || 'http://localhost:8081',

    // OAuth Settings
    OAUTH_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes
    OAUTH_CALLBACK_PORT: 45678,
} as const;

export type Config = typeof config;
