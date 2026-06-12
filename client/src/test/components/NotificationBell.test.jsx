import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import NotificationBell from '../../components/NotificationBell';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('../../services/apiClient', () => ({
    default: {
        get: (...args) => mockGet(...args),
        post: (...args) => mockPost(...args)
    }
}));

describe('NotificationBell', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('shows unread count, lists handoff notices, and marks a notice as read', async () => {
        mockGet
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    unread_count: 1,
                    notifications: [{
                        id: 'notif-1',
                        title: 'Transfer Handoff Notice',
                        message: 'Handoff Notice: Infant Maria Nicole Santos has been formally registered in Langgam as of 2026-06-08.',
                        is_read: false,
                        created_at: '2026-06-08T08:00:00.000Z'
                    }]
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    unread_count: 1,
                    notifications: [{
                        id: 'notif-1',
                        title: 'Transfer Handoff Notice',
                        message: 'Handoff Notice: Infant Maria Nicole Santos has been formally registered in Langgam as of 2026-06-08.',
                        is_read: false,
                        created_at: '2026-06-08T08:00:00.000Z'
                    }]
                })
            });

        mockPost.mockResolvedValue({
            ok: true,
            json: async () => ({
                success: true,
                notification: {
                    id: 'notif-1',
                    read_at: '2026-06-08T09:00:00.000Z'
                }
            })
        });

        const user = userEvent.setup();
        render(<NotificationBell visible />);

        await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: /open notifications/i }));

        expect(await screen.findByText('Transfer Handoff Notice')).toBeInTheDocument();
        expect(screen.getByText(/Maria Nicole Santos/)).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /read/i }));

        await waitFor(() => {
            expect(mockPost).toHaveBeenCalledWith('/notifications/notif-1/read', {});
        });
        expect(screen.getByText('Read')).toBeInTheDocument();
    });

    test('renders a polished empty state when there are no notifications', async () => {
        mockGet
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    unread_count: 0,
                    notifications: []
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    unread_count: 0,
                    notifications: []
                })
            });

        const user = userEvent.setup();
        render(<NotificationBell visible />);

        expect(screen.queryByText('0')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /open notifications/i }));

        expect(await screen.findByText('No transfer handoff notices right now.')).toBeInTheDocument();
        expect(screen.queryByText(/unread handoff notice/i)).not.toBeInTheDocument();
    });
});
