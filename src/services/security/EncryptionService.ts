/**
 * Encryption Service
 *
 * Provides secure encryption/decryption using AES-256-GCM with OS keychain
 * integration via Electron's safeStorage API. Falls back to derived keys
 * when safeStorage is unavailable.
 */

import crypto from 'crypto';

// ========================================
// Types
// ========================================

export interface EncryptedData {
    encrypted: string;
    iv: string;
    authTag: string;
    version: number;
    algorithm: string;
}

export interface EncryptionConfig {
    keyDerivationIterations: number;
    keyLength: number;
    ivLength: number;
    authTagLength: number;
    algorithm: string;
}

export interface SecureStorageAPI {
    isEncryptionAvailable: () => boolean;
    encryptString: (plainText: string) => Buffer;
    decryptString: (encrypted: Buffer) => string;
}

// ========================================
// Constants
// ========================================

const CURRENT_VERSION = 1;
const DEFAULT_CONFIG: EncryptionConfig = {
    keyDerivationIterations: 100000,
    keyLength: 32, // 256 bits for AES-256
    ivLength: 16, // 128 bits
    authTagLength: 16, // 128 bits
    algorithm: 'aes-256-gcm',
};

// ========================================
// Encryption Service
// ========================================

export class EncryptionService {
    private config: EncryptionConfig;
    private safeStorage: SecureStorageAPI | null = null;
    private masterKey: Buffer | null = null;
    private isInitialized = false;

    constructor(config: Partial<EncryptionConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    // ========================================
    // Public API
    // ========================================

    /**
     * Initialize the encryption service
     * Should be called after app is ready in Electron
     */
    async initialize(safeStorage?: SecureStorageAPI): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        this.safeStorage = safeStorage || null;

        // Generate or retrieve master key
        this.masterKey = await this.getMasterKey();
        this.isInitialized = true;
    }

    /**
     * Check if the service is initialized and ready
     */
    isReady(): boolean {
        return this.isInitialized && this.masterKey !== null;
    }

    /**
     * Check if OS-level secure storage is available
     */
    isSecureStorageAvailable(): boolean {
        return this.safeStorage?.isEncryptionAvailable() ?? false;
    }

    /**
     * Encrypt a string value
     */
    encrypt(plainText: string): EncryptedData {
        this.ensureInitialized();

        const iv = crypto.randomBytes(this.config.ivLength);
        const cipher = crypto.createCipheriv(this.config.algorithm as any, this.masterKey!, iv, {
            authTagLength: this.config.authTagLength,
        } as any);

        let encrypted = cipher.update(plainText, 'utf8', 'base64');
        encrypted += cipher.final('base64');

        return {
            encrypted,
            iv: iv.toString('base64'),
            authTag: cipher.getAuthTag().toString('base64'),
            version: CURRENT_VERSION,
            algorithm: this.config.algorithm,
        };
    }

    /**
     * Decrypt encrypted data
     */
    decrypt(data: EncryptedData): string {
        this.ensureInitialized();

        // Version check for future migrations
        if (data.version !== CURRENT_VERSION) {
            throw new Error(`Unsupported encryption version: ${data.version}`);
        }

        const iv = Buffer.from(data.iv, 'base64');
        const authTag = Buffer.from(data.authTag, 'base64');

        const decipher = crypto.createDecipheriv(
            (data.algorithm || this.config.algorithm) as any,
            this.masterKey!,
            iv,
            { authTagLength: this.config.authTagLength } as any
        );

        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(data.encrypted, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }

    /**
     * Encrypt an object (serializes to JSON first)
     */
    encryptObject<T>(obj: T): EncryptedData {
        const json = JSON.stringify(obj);
        return this.encrypt(json);
    }

    /**
     * Decrypt to an object
     */
    decryptObject<T>(data: EncryptedData): T {
        const json = this.decrypt(data);
        return JSON.parse(json) as T;
    }

    /**
     * Securely encrypt using OS keychain (if available)
     * Falls back to regular encryption if not
     */
    encryptWithKeychain(plainText: string): string {
        if (this.isSecureStorageAvailable()) {
            const encrypted = this.safeStorage!.encryptString(plainText);
            return `keychain:${encrypted.toString('base64')}`;
        }

        // Fall back to regular encryption
        const data = this.encrypt(plainText);
        return `encrypted:${JSON.stringify(data)}`;
    }

    /**
     * Decrypt data that was encrypted with keychain
     */
    decryptWithKeychain(data: string): string {
        if (data.startsWith('keychain:')) {
            if (!this.isSecureStorageAvailable()) {
                throw new Error('Secure storage is not available to decrypt keychain data');
            }
            const encrypted = Buffer.from(data.slice(9), 'base64');
            return this.safeStorage!.decryptString(encrypted);
        }

        if (data.startsWith('encrypted:')) {
            const encryptedData = JSON.parse(data.slice(10)) as EncryptedData;
            return this.decrypt(encryptedData);
        }

        throw new Error('Invalid encrypted data format');
    }

    /**
     * Hash a value using SHA-256
     */
    hash(value: string): string {
        return crypto.createHash('sha256').update(value).digest('hex');
    }

    /**
     * Generate a secure random token
     */
    generateToken(length = 32): string {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Generate a secure random ID (URL-safe base64)
     */
    generateId(length = 16): string {
        return crypto
            .randomBytes(length)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    /**
     * Derive a key from a password
     */
    deriveKey(password: string, salt?: string): { key: string; salt: string } {
        const saltBuffer = salt ? Buffer.from(salt, 'base64') : crypto.randomBytes(16);

        const key = crypto.pbkdf2Sync(
            password,
            saltBuffer,
            this.config.keyDerivationIterations,
            this.config.keyLength,
            'sha512'
        );

        return {
            key: key.toString('base64'),
            salt: saltBuffer.toString('base64'),
        };
    }

    /**
     * Verify a password against a derived key
     */
    verifyPassword(password: string, key: string, salt: string): boolean {
        const derived = this.deriveKey(password, salt);
        return crypto.timingSafeEqual(
            Buffer.from(derived.key, 'base64'),
            Buffer.from(key, 'base64')
        );
    }

    /**
     * Encrypt a file buffer
     */
    encryptBuffer(buffer: Buffer): { encrypted: Buffer; metadata: EncryptedData } {
        this.ensureInitialized();

        const iv = crypto.randomBytes(this.config.ivLength);
        const cipher = crypto.createCipheriv(this.config.algorithm as any, this.masterKey!, iv, {
            authTagLength: this.config.authTagLength,
        } as any);

        const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);

        return {
            encrypted,
            metadata: {
                encrypted: '', // Buffer is separate
                iv: iv.toString('base64'),
                authTag: cipher.getAuthTag().toString('base64'),
                version: CURRENT_VERSION,
                algorithm: this.config.algorithm,
            },
        };
    }

    /**
     * Decrypt a file buffer
     */
    decryptBuffer(encrypted: Buffer, metadata: EncryptedData): Buffer {
        this.ensureInitialized();

        const iv = Buffer.from(metadata.iv, 'base64');
        const authTag = Buffer.from(metadata.authTag, 'base64');

        const decipher = crypto.createDecipheriv(
            (metadata.algorithm || this.config.algorithm) as any,
            this.masterKey!,
            iv,
            { authTagLength: this.config.authTagLength } as any
        );

        decipher.setAuthTag(authTag);

        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }

    /**
     * Securely compare two strings (constant-time)
     */
    secureCompare(a: string, b: string): boolean {
        if (a.length !== b.length) {
            return false;
        }
        return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    }

    /**
     * Destroy the service and clear sensitive data
     */
    destroy(): void {
        if (this.masterKey) {
            // Overwrite the key buffer
            crypto.randomFillSync(this.masterKey);
            this.masterKey = null;
        }
        this.isInitialized = false;
    }

    // ========================================
    // Private Methods
    // ========================================

    private ensureInitialized(): void {
        if (!this.isInitialized || !this.masterKey) {
            throw new Error('EncryptionService is not initialized');
        }
    }

    private async getMasterKey(): Promise<Buffer> {
        // Try to use safeStorage for key derivation source
        if (this.isSecureStorageAvailable()) {
            try {
                // Store and retrieve a key identifier to ensure consistency
                const keyId = 'flowmind-master-key-v1';
                const storedKey = this.safeStorage!.encryptString(keyId);

                // Derive actual encryption key from the safeStorage result
                return crypto.pbkdf2Sync(
                    storedKey,
                    'flowmind-salt-v1',
                    this.config.keyDerivationIterations,
                    this.config.keyLength,
                    'sha512'
                );
            } catch (error) {
                console.warn('Failed to use safeStorage, falling back to derived key:', error);
            }
        }

        // Fall back to machine-specific key derivation
        return this.deriveMachineKey();
    }

    private deriveMachineKey(): Buffer {
        // Combine multiple sources for entropy
        const sources = [
            process.platform,
            process.arch,
            process.env.HOME || process.env.USERPROFILE || '',
            process.env.USER || process.env.USERNAME || '',
            'flowmind-app-key-v1',
        ];

        const combined = sources.join(':');

        return crypto.pbkdf2Sync(
            combined,
            'flowmind-machine-salt-v1',
            this.config.keyDerivationIterations,
            this.config.keyLength,
            'sha512'
        );
    }
}

// ========================================
// Credential Manager (High-level API)
// ========================================

export class CredentialManager {
    private encryptionService: EncryptionService;
    private storage: Map<string, string> = new Map();
    private storageBackend: {
        get: (key: string) => Promise<string | null>;
        set: (key: string, value: string) => Promise<void>;
        delete: (key: string) => Promise<void>;
    } | null = null;

    constructor(encryptionService: EncryptionService) {
        this.encryptionService = encryptionService;
    }

    /**
     * Set a storage backend (e.g., electron-store)
     */
    setStorageBackend(backend: {
        get: (key: string) => Promise<string | null>;
        set: (key: string, value: string) => Promise<void>;
        delete: (key: string) => Promise<void>;
    }): void {
        this.storageBackend = backend;
    }

    /**
     * Store a credential securely
     */
    async setCredential(key: string, value: string): Promise<void> {
        const encrypted = this.encryptionService.encryptWithKeychain(value);

        if (this.storageBackend) {
            await this.storageBackend.set(`credential:${key}`, encrypted);
        } else {
            this.storage.set(key, encrypted);
        }
    }

    /**
     * Retrieve a credential
     */
    async getCredential(key: string): Promise<string | null> {
        let encrypted: string | null;

        if (this.storageBackend) {
            encrypted = await this.storageBackend.get(`credential:${key}`);
        } else {
            encrypted = this.storage.get(key) || null;
        }

        if (!encrypted) {
            return null;
        }

        try {
            return this.encryptionService.decryptWithKeychain(encrypted);
        } catch (error) {
            console.error(`Failed to decrypt credential ${key}:`, error);
            return null;
        }
    }

    /**
     * Delete a credential
     */
    async deleteCredential(key: string): Promise<void> {
        if (this.storageBackend) {
            await this.storageBackend.delete(`credential:${key}`);
        } else {
            this.storage.delete(key);
        }
    }

    /**
     * Check if a credential exists
     */
    async hasCredential(key: string): Promise<boolean> {
        if (this.storageBackend) {
            const value = await this.storageBackend.get(`credential:${key}`);
            return value !== null;
        }
        return this.storage.has(key);
    }
}

// ========================================
// Singleton Instances
// ========================================

let encryptionInstance: EncryptionService | null = null;
let credentialManager: CredentialManager | null = null;

export async function initializeEncryption(
    config?: Partial<EncryptionConfig>,
    safeStorage?: SecureStorageAPI
): Promise<EncryptionService> {
    if (!encryptionInstance) {
        encryptionInstance = new EncryptionService(config);
        await encryptionInstance.initialize(safeStorage);
    }
    return encryptionInstance;
}

export function getEncryptionService(): EncryptionService | null {
    return encryptionInstance;
}

export function getCredentialManager(): CredentialManager {
    if (!credentialManager) {
        if (!encryptionInstance) {
            throw new Error('Encryption service must be initialized first');
        }
        credentialManager = new CredentialManager(encryptionInstance);
    }
    return credentialManager;
}

export default EncryptionService;
