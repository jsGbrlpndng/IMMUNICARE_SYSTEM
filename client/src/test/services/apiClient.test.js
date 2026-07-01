import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../../services/apiClient';

const jsonResponse = (status, body) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
});

describe('apiClient session-aware 401 handling', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        vi.restoreAllMocks();
        window.history.pushState({}, '', '/clinical/dashboard');
    });

    it('preserves auth when an in-flight background 401 returns while idle lock is active', async () => {
        localStorage.setItem('auth_token', 'token');
        localStorage.setItem('user', JSON.stringify({ id: 'MW-001', role: 'Midwife' }));
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
            sessionStorage.setItem('immunicare_idle_locked', 'true');
            return jsonResponse(401, { error: 'Unauthorized: Invalid or expired token' });
        });

        await expect(apiClient.get('/dashboard/kpis')).rejects.toMatchObject({ status: 401 });

        expect(localStorage.getItem('auth_token')).toBe('token');
        expect(localStorage.getItem('user')).toContain('MW-001');
    });

    it('clears auth for a normal invalid 401 outside idle lock or reauth', async () => {
        localStorage.setItem('auth_token', 'token');
        localStorage.setItem('user', JSON.stringify({ id: 'MW-001', role: 'Midwife' }));
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse(401, { error: 'Invalid session', code: 'INVALID_TOKEN' })
        );

        await expect(apiClient.get('/dashboard/kpis')).rejects.toMatchObject({
            status: 401,
            code: 'INVALID_TOKEN'
        });

        expect(localStorage.getItem('auth_token')).toBeNull();
        expect(localStorage.getItem('user')).toBeNull();
    });

    it('clears auth for hard reauthentication expiry even while locked', async () => {
        localStorage.setItem('auth_token', 'token');
        localStorage.setItem('user', JSON.stringify({ id: 'MW-001', role: 'Midwife' }));
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
            sessionStorage.setItem('immunicare_idle_locked', 'true');
            return jsonResponse(401, { error: 'Session expired', code: 'REAUTH_EXPIRED' });
        });

        await expect(apiClient.get('/dashboard/kpis')).rejects.toMatchObject({
            status: 401,
            code: 'REAUTH_EXPIRED'
        });

        expect(localStorage.getItem('auth_token')).toBeNull();
        expect(localStorage.getItem('user')).toBeNull();
    });

    it('does not silently append the Super Admin global barangay filter to unrelated endpoints', async () => {
        localStorage.setItem('auth_token', 'token');
        localStorage.setItem('user', JSON.stringify({ id: 'SA-001', role: 'Super Admin' }));
        sessionStorage.setItem('selected_barangay', 'LANGGAM');
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse(200, { success: true })
        );

        await apiClient.get('/dashboard/dbscan-audit');

        expect(fetchSpy).toHaveBeenCalledWith('/api/dashboard/dbscan-audit', expect.any(Object));
    });
});
