/**
 * IPC handlers for authentication
 */

import { ipcMain } from 'electron';
import { startGoogleLogin, logout, getCurrentUser, loadSessionToken } from '../auth/google-oauth';

export function registerAuthHandlers() {
    // Google login
    ipcMain.handle('auth:login', async () => {
        try {
            const result = await startGoogleLogin();
            return { success: true, data: result };
        } catch (error: any) {
            console.error('Auth login error:', error);
            return { success: false, error: error.message };
        }
    });

    // Logout
    ipcMain.handle('auth:logout', async () => {
        try {
            await logout();
            return { success: true };
        } catch (error: any) {
            console.error('Auth logout error:', error);
            return { success: false, error: error.message };
        }
    });

    // Get current user
    ipcMain.handle('auth:getCurrentUser', async () => {
        try {
            const user = await getCurrentUser();
            return { success: true, data: user };
        } catch (error: any) {
            console.error('Get current user error:', error);
            return { success: false, error: error.message };
        }
    });

    // Get session token
    ipcMain.handle('auth:getSessionToken', async () => {
        try {
            const token = loadSessionToken();
            return { success: true, data: token };
        } catch (error: any) {
            console.error('Get session token error:', error);
            return { success: false, error: error.message };
        }
    });

    // Auth IPC handlers registered
}
