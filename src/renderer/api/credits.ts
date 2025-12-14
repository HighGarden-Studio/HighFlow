/**
 * Credits API Service
 */

import axios from 'axios';

import { BACKEND_URL } from '../../config';

export interface LedgerEntry {
    id: string;
    amount: number;
    balanceAfter: number;
    type: TransactionType;
    status: 'pending' | 'committed' | 'cancelled';
    metadata?: {
        workflowName?: string;
        executionId?: string;
        note?: string;
        [key: string]: any;
    };
    createdAt: string;
    committedAt?: string;
}

export type TransactionType =
    | 'signup_bonus'
    | 'admin_topup'
    | 'workflow_execution'
    | 'marketplace_purchase'
    | 'execution_refund'
    | 'execution_adjustment';

export interface LedgerResponse {
    entries: LedgerEntry[];
    total: number;
    hasMore: boolean;
}

export interface LedgerParams {
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
}

/**
 * Credits API
 */
export const creditsAPI = {
    /**
     * Get ledger entries
     */
    async getLedger(params?: LedgerParams): Promise<LedgerResponse> {
        try {
            // Get session token from main process
            const tokenResult = await window.electron.auth.getSessionToken();

            if (!tokenResult.success || !tokenResult.data) {
                throw new Error('Not authenticated - no session token available');
            }

            const token = tokenResult.data;

            // Make API request with token
            const response = await axios.get<LedgerResponse>(`${BACKEND_URL}/v1/users/me/ledger`, {
                params,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                timeout: 30000,
            });

            return response.data;
        } catch (error: any) {
            console.error('Failed to fetch ledger:', error);

            // Handle 401 - session expired
            if (error.response?.status === 401) {
                console.warn('⚠️  Session expired, logging out...');
                await window.electron.auth.logout();
                window.location.reload();
            }

            throw error;
        }
    },
};
