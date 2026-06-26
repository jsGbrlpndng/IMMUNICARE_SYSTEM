import React, { useEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdleSessionProvider } from '../../contexts/IdleSessionContext';

const mockAuth = {
    user: { id: 'MW-001', name: 'Midwife User', role: 'Midwife' },
    login: vi.fn(),
    logout: vi.fn(),
    auditLogout: vi.fn(),
    sessionPolicy: { idleTimeoutMinutes: 15, reauthGraceSeconds: 300 },
    updateSessionPolicy: vi.fn()
};

vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => mockAuth
}));

const renderIdleProvider = (children = <div>Protected workspace</div>) => render(
    <MemoryRouter initialEntries={['/clinical/dashboard']}>
        <IdleSessionProvider>{children}</IdleSessionProvider>
    </MemoryRouter>
);

const advanceMinutes = async (minutes) => {
    await act(async () => {
        vi.advanceTimersByTime(minutes * 60 * 1000);
    });
};

const NavigateAfter = ({ minutes }) => {
    const navigate = useNavigate();

    useEffect(() => {
        const timer = window.setTimeout(() => {
            navigate('/clinical/registry');
        }, minutes * 60 * 1000);
        return () => window.clearTimeout(timer);
    }, [minutes, navigate]);

    return <div>Protected workspace</div>;
};

describe('IdleSessionContext true inactivity timer', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({ success: true })
        });
        sessionStorage.clear();
        localStorage.setItem('auth_token', 'token');
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        sessionStorage.clear();
        localStorage.clear();
    });

    it('shows the idle modal after 15 minutes of no user activity', async () => {
        renderIdleProvider();

        await advanceMinutes(15);

        expect(screen.getByText('Session Locked')).toBeInTheDocument();
    });

    it('mousemove resets the idle timer', async () => {
        renderIdleProvider();

        await advanceMinutes(14);
        fireEvent.mouseMove(window);
        await advanceMinutes(14);

        expect(screen.queryByText('Session Locked')).not.toBeInTheDocument();

        await advanceMinutes(1);
        expect(screen.getByText('Session Locked')).toBeInTheDocument();
    });

    it('click, keydown, scroll, and touch activity reset the idle timer', async () => {
        renderIdleProvider();

        await advanceMinutes(14);
        fireEvent.click(window);
        await advanceMinutes(14);
        fireEvent.keyDown(window, { key: 'A' });
        await advanceMinutes(14);
        fireEvent.scroll(window);
        await advanceMinutes(14);
        fireEvent.touchStart(window);
        await advanceMinutes(14);

        expect(screen.queryByText('Session Locked')).not.toBeInTheDocument();

        await advanceMinutes(1);
        expect(screen.getByText('Session Locked')).toBeInTheDocument();
    });

    it('protected route navigation resets the idle timer without background API activity', async () => {
        renderIdleProvider(<NavigateAfter minutes={14} />);

        await advanceMinutes(14);
        await advanceMinutes(14);

        expect(screen.queryByText('Session Locked')).not.toBeInTheDocument();

        await advanceMinutes(1);
        expect(screen.getByText('Session Locked')).toBeInTheDocument();
    });
});
