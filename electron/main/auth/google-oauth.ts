/**
 * Google OAuth2 Authentication with PKCE
 */

import { shell, app, safeStorage } from 'electron';
import crypto from 'crypto';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

interface AuthResult {
    sessionToken: string;
    expiresAt: string;
    user: {
        id: string;
        email: string;
        displayName: string;
        photoUrl: string;
        creditBalance: number;
        createdAt: string;
    };
}

interface PKCEPair {
    codeVerifier: string;
    codeChallenge: string;
}

/**
 * Generate PKCE code verifier and challenge
 */
function generatePKCE(): PKCEPair {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    return { codeVerifier, codeChallenge };
}

/**
 * Start Google OAuth login flow
 */
export async function startGoogleLogin(): Promise<AuthResult> {
    console.log('[Auth Debug] Starting Google Login...');

    // 1. Generate PKCE
    const { codeVerifier, codeChallenge } = generatePKCE();
    console.log('[Auth Debug] 1. PKCE Generated');

    // 2. Generate state for CSRF protection
    const state = crypto.randomBytes(16).toString('hex');

    // 3. Construct OAuth URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', config.GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', config.OAUTH_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', config.OAUTH_SCOPES);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    console.log('[Auth Debug] 3. Auth URL Constructed:', authUrl.toString());

    // 4. Start local callback server
    console.log('[Auth Debug] 4. Starting Local Callback Server...');
    const authCode = await new Promise<string>((resolve, reject) => {
        const server = http.createServer((req, res) => {
            console.log('[Auth Debug] Local Server Request received:', req.url);
            const url = new URL(req.url!, config.OAUTH_REDIRECT_URI);
            const params = url.searchParams;

            // Validate state
            if (params.get('state') !== state) {
                console.error('[Auth Debug] State mismatch');
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h1>❌ 인증 실패: 잘못된 요청</h1>');
                reject(new Error('State mismatch - CSRF protection'));
                server.close();
                return;
            }

            const code = params.get('code');
            const error = params.get('error');

            if (error) {
                console.error('[Auth Debug] Auth Error from Google:', error);
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`<h1>❌ 인증 실패</h1><p>${error}</p>`);
                reject(new Error(`OAuth error: ${error}`));
                server.close();
                return;
            }

            if (code) {
                console.log('[Auth Debug] Auth Code received');
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`
          <html>
            <head><meta charset="utf-8"></head>
            <body style="font-family: 'Segoe UI', Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
              <div style="background: white; color: #333; padding: 40px; border-radius: 12px; max-width: 400px; margin: 0 auto; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
                <h1 style="color: #10B981; margin-bottom: 20px;">✅ 로그인 성공!</h1>
                <p style="font-size: 16px; color: #666;">이 창을 닫고 앱으로 돌아가주세요.</p>
                <p style="font-size: 14px; color: #999; margin-top: 20px;">2초 후 자동으로 닫힙니다...</p>
              </div>
              <script>setTimeout(() => window.close(), 2000);</script>
            </body>
          </html>
        `);
                resolve(code);
                setTimeout(() => server.close(), 2500);
            }
        });

        server.listen(config.OAUTH_CALLBACK_PORT, async () => {
            console.log(
                `✅ [Auth Debug] OAuth callback server listening on port ${config.OAUTH_CALLBACK_PORT}`
            );

            // 5. Open browser for OAuth (Moved here to prevent deadlock)
            try {
                console.log('[Auth Debug] 5. Opening default browser for OAuth...');
                await shell.openExternal(authUrl.toString());
                console.log('[Auth Debug] Browser opened successfully');
            } catch (err) {
                console.error('[Auth Debug] Failed to open browser:', err);
                reject(new Error(`Failed to open browser: ${err}`));
                server.close();
            }
        });

        // Timeout after 5 minutes
        setTimeout(() => {
            console.error('[Auth Debug] Timeout reached');
            server.close();
            reject(new Error('OAuth timeout - no response within 5 minutes'));
        }, config.OAUTH_TIMEOUT_MS);
    });

    console.log('[Auth Debug] Auth Code obtained, proceeding to token exchange...');

    // 6. Exchange code for JWT with backend
    console.log(
        '[Auth Debug] 6. Exchanging code with backend:',
        `${config.BACKEND_URL}/v1/auth/google`
    );

    try {
        const response = await fetch(`${config.BACKEND_URL}/v1/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                authorizationCode: authCode,
                codeVerifier,
                code_verifier: codeVerifier, // Add snake_case since backend might expect this
                redirectUri: config.OAUTH_REDIRECT_URI,
            }),
        });

        if (!response.ok) {
            console.error('[Auth Debug] Backend response not OK:', response.status);
            const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(errorData.message || `Backend auth failed: ${response.status}`);
        }

        const data: AuthResult = await response.json();
        console.log('[Auth Debug] Token exchange successful');

        // 7. Save session token
        await saveSessionToken(data.sessionToken);

        console.log('✅ OAuth login successful:', data.user.email);

        return data;
    } catch (error) {
        console.error('[Auth Debug] Token exchange error:', error);
        throw error;
    }
}

/**
 * Session token storage directory
 */
function getSessionDir(): string {
    const sessionDir = path.join(app.getPath('userData'), 'session');
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }
    return sessionDir;
}

/**
 * Save session token (encrypted with safeStorage)
 */
export function saveSessionToken(token: string): void {
    const sessionDir = getSessionDir();

    if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(token);
        fs.writeFileSync(path.join(sessionDir, 'token.dat'), encrypted);
        console.log('✅ Session token saved (encrypted)');
    } else {
        // Fallback (not recommended for production)
        console.warn('⚠️  Encryption not available, using plaintext fallback');
        fs.writeFileSync(
            path.join(sessionDir, 'token.json'),
            JSON.stringify({ token, createdAt: new Date().toISOString() })
        );
    }
}

/**
 * Load session token (decrypt with safeStorage)
 */
export function loadSessionToken(): string | null {
    const sessionDir = getSessionDir();

    try {
        if (safeStorage.isEncryptionAvailable()) {
            const tokenPath = path.join(sessionDir, 'token.dat');
            if (fs.existsSync(tokenPath)) {
                const encrypted = fs.readFileSync(tokenPath);
                const token = safeStorage.decryptString(encrypted);
                console.log('✅ Session token loaded (decrypted)');
                return token;
            }
        } else {
            const tokenPath = path.join(sessionDir, 'token.json');
            if (fs.existsSync(tokenPath)) {
                const data = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
                console.log('⚠️  Session token loaded (plaintext)');
                return data.token;
            }
        }
    } catch (err) {
        console.error('❌ Failed to load session token:', err);
    }

    return null;
}

/**
 * Delete session token
 */
export function deleteSessionToken(): void {
    const sessionDir = getSessionDir();

    try {
        const encryptedPath = path.join(sessionDir, 'token.dat');
        const plaintextPath = path.join(sessionDir, 'token.json');

        if (fs.existsSync(encryptedPath)) {
            fs.unlinkSync(encryptedPath);
        }
        if (fs.existsSync(plaintextPath)) {
            fs.unlinkSync(plaintextPath);
        }

        console.log('✅ Session token deleted');
    } catch (err) {
        console.error('❌ Failed to delete session token:', err);
    }
}

/**
 * Get current user from backend
 */
export async function getCurrentUser() {
    const token = loadSessionToken();

    if (!token) {
        return null;
    }

    try {
        const response = await fetch(`${config.BACKEND_URL}/v1/auth/me`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            // Token expired or invalid
            if (response.status === 401) {
                console.warn('⚠️  Session expired, clearing token');
                deleteSessionToken();
            }
            return null;
        }

        const user = await response.json();
        console.log('✅ Current user fetched:', user.email);
        return user;
    } catch (err) {
        console.error('❌ Failed to get current user:', err);
        return null;
    }
}

/**
 * Logout (invalidate session)
 */
export async function logout(): Promise<void> {
    const token = loadSessionToken();

    if (token) {
        try {
            await fetch(`${config.BACKEND_URL}/v1/auth/logout`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            console.log('✅ Logout successful');
        } catch (err) {
            console.error('❌ Logout request failed:', err);
        }
    }

    deleteSessionToken();
}
