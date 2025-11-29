/**
 * Google OAuth Authentication Service
 *
 * Handles Google OAuth flow in Electron, token storage,
 * automatic token refresh, and profile management.
 */

import crypto from 'crypto';

// ========================================
// Types
// ========================================

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
  scope: string;
}

export interface GoogleProfile {
  id: string;
  email: string;
  name: string;
  givenName: string;
  familyName: string;
  picture: string;
  locale: string;
}

export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface AuthResult {
  success: boolean;
  tokens?: GoogleTokens;
  profile?: GoogleProfile;
  error?: string;
}

interface StoredTokens extends GoogleTokens {
  iv: string;
  encryptedRefreshToken: string;
}

// ========================================
// Encryption Utilities
// ========================================

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  // In production, this should come from a more secure source
  // like Electron's safeStorage or a hardware key
  const machineId = process.env.MACHINE_ID || 'default-machine-id';
  return crypto.scryptSync(machineId, 'salt', 32);
}

function encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

function decrypt(encrypted: string, iv: string, authTag: string): string {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    key,
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ========================================
// Google Auth Service
// ========================================

export class GoogleAuthService {
  private config: GoogleAuthConfig;
  private tokens: GoogleTokens | null = null;
  private profile: GoogleProfile | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private storageKey = 'google_auth_tokens';
  private tokenStore: Map<string, StoredTokens> = new Map();

  // Event callbacks
  private onAuthStateChange: ((authenticated: boolean) => void) | null = null;
  private onTokenRefresh: ((tokens: GoogleTokens) => void) | null = null;

  constructor(config: GoogleAuthConfig) {
    this.config = config;
  }

  // ========================================
  // Public API
  // ========================================

  /**
   * Initialize the auth service and load stored tokens
   */
  async initialize(): Promise<boolean> {
    try {
      const storedTokens = await this.loadTokensFromStorage();

      if (storedTokens) {
        this.tokens = storedTokens;

        // Check if tokens are expired
        if (this.isTokenExpired()) {
          await this.refreshAccessToken();
        } else {
          // Schedule token refresh before expiration
          this.scheduleTokenRefresh();
        }

        // Fetch profile
        await this.fetchProfile();
        this.notifyAuthStateChange(true);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to initialize Google Auth:', error);
      return false;
    }
  }

  /**
   * Start OAuth flow - returns the auth URL to open in browser
   */
  getAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state: state || this.generateState(),
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Handle OAuth callback with authorization code
   */
  async handleCallback(code: string): Promise<AuthResult> {
    try {
      const tokens = await this.exchangeCodeForTokens(code);
      this.tokens = tokens;

      // Store tokens securely
      await this.saveTokensToStorage(tokens);

      // Fetch user profile
      await this.fetchProfile();

      // Schedule token refresh
      this.scheduleTokenRefresh();

      this.notifyAuthStateChange(true);

      return {
        success: true,
        tokens,
        profile: this.profile || undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(): Promise<boolean> {
    if (!this.tokens?.refreshToken) {
      console.error('No refresh token available');
      return false;
    }

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: this.tokens.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }

      const data = await response.json();

      const newTokens: GoogleTokens = {
        accessToken: data.access_token,
        refreshToken: this.tokens.refreshToken, // Keep existing refresh token
        expiresAt: Date.now() + data.expires_in * 1000,
        tokenType: data.token_type,
        scope: data.scope || this.tokens.scope,
      };

      this.tokens = newTokens;
      await this.saveTokensToStorage(newTokens);

      this.scheduleTokenRefresh();

      if (this.onTokenRefresh) {
        this.onTokenRefresh(newTokens);
      }

      return true;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return false;
    }
  }

  /**
   * Logout - clear tokens and revoke access
   */
  async logout(): Promise<void> {
    if (this.tokens?.accessToken) {
      try {
        // Revoke the token
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${this.tokens.accessToken}`,
          { method: 'POST' }
        );
      } catch (error) {
        console.error('Failed to revoke token:', error);
      }
    }

    // Clear local state
    this.tokens = null;
    this.profile = null;

    // Clear scheduled refresh
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    // Clear stored tokens
    await this.clearTokensFromStorage();

    this.notifyAuthStateChange(false);
  }

  /**
   * Get current access token (refreshing if needed)
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.tokens) {
      return null;
    }

    if (this.isTokenExpired()) {
      const refreshed = await this.refreshAccessToken();
      if (!refreshed) {
        return null;
      }
    }

    return this.tokens.accessToken;
  }

  /**
   * Get user profile
   */
  getProfile(): GoogleProfile | null {
    return this.profile;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.tokens !== null && !this.isTokenExpired();
  }

  /**
   * Set auth state change callback
   */
  setOnAuthStateChange(callback: (authenticated: boolean) => void): void {
    this.onAuthStateChange = callback;
  }

  /**
   * Set token refresh callback
   */
  setOnTokenRefresh(callback: (tokens: GoogleTokens) => void): void {
    this.onTokenRefresh = callback;
  }

  // ========================================
  // Private Methods
  // ========================================

  private async exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  private async fetchProfile(): Promise<void> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      return;
    }

    try {
      const response = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch profile');
      }

      const data = await response.json();

      this.profile = {
        id: data.id,
        email: data.email,
        name: data.name,
        givenName: data.given_name,
        familyName: data.family_name,
        picture: data.picture,
        locale: data.locale,
      };
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    }
  }

  private isTokenExpired(): boolean {
    if (!this.tokens) {
      return true;
    }
    // Consider token expired 5 minutes before actual expiration
    return Date.now() >= this.tokens.expiresAt - 5 * 60 * 1000;
  }

  private scheduleTokenRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.tokens) {
      return;
    }

    // Refresh 10 minutes before expiration
    const refreshIn = this.tokens.expiresAt - Date.now() - 10 * 60 * 1000;

    if (refreshIn > 0) {
      this.refreshTimer = setTimeout(() => {
        this.refreshAccessToken();
      }, refreshIn);
    }
  }

  private generateState(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private notifyAuthStateChange(authenticated: boolean): void {
    if (this.onAuthStateChange) {
      this.onAuthStateChange(authenticated);
    }
  }

  // ========================================
  // Storage Methods (using in-memory for now, should use electron-store)
  // ========================================

  private async saveTokensToStorage(tokens: GoogleTokens): Promise<void> {
    try {
      // Encrypt refresh token
      const { encrypted, iv, authTag } = encrypt(tokens.refreshToken);

      const storedTokens: StoredTokens = {
        ...tokens,
        iv,
        encryptedRefreshToken: `${encrypted}:${authTag}`,
      };

      // In a real implementation, use electron-store
      this.tokenStore.set(this.storageKey, storedTokens);

      // Also notify Electron main process to persist
      if (typeof window !== 'undefined' && window.electron?.store) {
        await window.electron.store.set(this.storageKey, storedTokens);
      }
    } catch (error) {
      console.error('Failed to save tokens:', error);
    }
  }

  private async loadTokensFromStorage(): Promise<GoogleTokens | null> {
    try {
      let storedTokens: StoredTokens | null = null;

      // Try to load from electron-store first
      if (typeof window !== 'undefined' && window.electron?.store) {
        storedTokens = await window.electron.store.get(this.storageKey);
      }

      // Fall back to in-memory storage
      if (!storedTokens) {
        storedTokens = this.tokenStore.get(this.storageKey) || null;
      }

      if (!storedTokens) {
        return null;
      }

      // Decrypt refresh token
      const parts = storedTokens.encryptedRefreshToken.split(':');
      const encrypted = parts[0] ?? '';
      const authTag = parts[1] ?? '';
      const refreshToken = decrypt(encrypted, storedTokens.iv, authTag);

      return {
        accessToken: storedTokens.accessToken,
        refreshToken,
        expiresAt: storedTokens.expiresAt,
        tokenType: storedTokens.tokenType,
        scope: storedTokens.scope,
      };
    } catch (error) {
      console.error('Failed to load tokens:', error);
      return null;
    }
  }

  private async clearTokensFromStorage(): Promise<void> {
    this.tokenStore.delete(this.storageKey);

    if (typeof window !== 'undefined' && window.electron?.store) {
      await window.electron.store.delete(this.storageKey);
    }
  }
}

// ========================================
// Singleton Instance
// ========================================

let googleAuthInstance: GoogleAuthService | null = null;

export function initializeGoogleAuth(config: GoogleAuthConfig): GoogleAuthService {
  googleAuthInstance = new GoogleAuthService(config);
  return googleAuthInstance;
}

export function getGoogleAuth(): GoogleAuthService | null {
  return googleAuthInstance;
}

// Default export
export default GoogleAuthService;
