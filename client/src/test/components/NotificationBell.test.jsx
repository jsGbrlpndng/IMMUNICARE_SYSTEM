import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import NotificationBell from '../../components/feedback/NotificationBell';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('../../services/apiClient', () => ({
    default: {
        get: (...args) => mockGet(...args),
        post: (...args) => mockPost(...args)
    }
}));

vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({
        user: {
            id: 'MIDWIFE-001',
            role: 'Midwife',
            full_name: 'Test Midwife',
            name: 'Test Midwife'
        }
    })
}));



describe('NotificationBell Detailed Modal Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const renderNotificationBell = () => render(
        <NotificationBell visible />
    );

    test('renders notifications, quick read button marks as read without opening modal', async () => {
        mockGet.mockResolvedValue({
            ok: true,
            json: async () => ({
                success: true,
                unread_count: 1,
                notifications: [{
                    id: 'notif-1',
                    title: 'New Field Deployment Area Assigned',
                    message: 'You have been assigned to Priority Area 1 in Langgam.',
                    is_read: false,
                    notification_type: 'DEPLOYMENT_ASSIGNED',
                    payload: { assignment_id: 'assign-123', barangay: 'Langgam' },
                    created_at: '2026-06-08T08:00:00.000Z'
                }]
            })
        });

        mockPost.mockResolvedValue({
            ok: true,
            json: async () => ({
                success: true,
                notification: { id: 'notif-1', read_at: '2026-06-08T09:00:00.000Z' }
            })
        });

        const user = userEvent.setup();
        renderNotificationBell();

        await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: /open notifications/i }));

        // Check if item renders in dropdown
        expect(await screen.findByText('New Field Deployment Area Assigned')).toBeInTheDocument();

        // Click the quick Read button
        const quickReadBtn = screen.getByRole('button', { name: /read/i });
        await user.click(quickReadBtn);

        // Verify markAsRead API called
        await waitFor(() => {
            expect(mockPost).toHaveBeenCalledWith('/notifications/notif-1/read', {});
        });

        // Dropdown remains open and modal should NOT be present (Modal header "Notification Details" is not in document)
        expect(screen.queryByText('Notification Details')).not.toBeInTheDocument();
    });

    test('clicking a notification card opens detail modal, displays metadata, close button works', async () => {
        mockGet.mockResolvedValue({
            ok: true,
            json: async () => ({
                success: true,
                unread_count: 2,
                notifications: [{
                    id: 'notif-2',
                    title: 'Infant Registration Returned',
                    message: 'Please check birth date and address details.',
                    is_read: false,
                    notification_type: 'REGISTRATION_RETURNED',
                    payload: { registration_id: 'reg-456', infant_name: 'Baby John', correction_notes: 'Missing landmark.' },
                    created_at: '2026-06-08T08:00:00.000Z'
                }]
            })
        });

        const user = userEvent.setup();
        renderNotificationBell();

        await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: /open notifications/i }));

        // Click the article container instead of Read button
        const article = await screen.findByText('Infant Registration Returned');
        await user.click(article);

        // Verify Modal opens and displays full notification details
        expect(await screen.findByText('Notification Details')).toBeInTheDocument();
        expect(screen.getByText('Infant Registration Returned')).toBeInTheDocument();
        expect(screen.getByText('Please check birth date and address details.')).toBeInTheDocument();
        expect(screen.getByText('REGISTRATION RETURNED')).toBeInTheDocument();
        expect(screen.getByText('Baby John')).toBeInTheDocument();
        expect(screen.getByText('Missing landmark.')).toBeInTheDocument();

        // Close the modal
        const closeBtn = screen.getByRole('button', { name: /close/i });
        await user.click(closeBtn);

        // Modal is closed
        await waitFor(() => {
            expect(screen.queryByText('Notification Details')).not.toBeInTheDocument();
        });
    });

    test('Mark as Read inside modal updates read status, decreases unread count', async () => {
        mockGet.mockResolvedValue({
            ok: true,
            json: async () => ({
                success: true,
                unread_count: 1,
                notifications: [{
                    id: 'notif-3',
                    title: 'Deployment Report Rejected',
                    message: 'Your report was returned.',
                    is_read: false,
                    notification_type: 'DEPLOYMENT_REPORT_REJECTED',
                    payload: { assignment_id: 'assign-789', rejection_reason: 'Incomplete stats.' },
                    created_at: '2026-06-08T08:00:00.000Z'
                }]
            })
        });

        mockPost.mockResolvedValue({
            ok: true,
            json: async () => ({
                success: true,
                notification: { id: 'notif-3', read_at: '2026-06-08T09:00:00.000Z' }
            })
        });

        const user = userEvent.setup();
        renderNotificationBell();

        await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: /open notifications/i }));

        const article = await screen.findByText('Deployment Report Rejected');
        await user.click(article);

        // Verify Modal has "Mark as Read" action
        const modalReadBtn = await screen.findByRole('button', { name: /mark as read/i });
        await user.click(modalReadBtn);

        // Verify API was called
        await waitFor(() => {
            expect(mockPost).toHaveBeenCalledWith('/notifications/notif-3/read', {});
        });

        // The "Mark as Read" button should disappear (since status changes to read)
        expect(screen.queryByRole('button', { name: /mark as read/i })).not.toBeInTheDocument();
        // Shows badge status Read
        expect(screen.getByText('Read')).toBeInTheDocument();
    });


    test('modal backdrop click closes modal, but clicking inside modal does not', async () => {
        mockGet.mockResolvedValue({
            ok: true,
            json: async () => ({
                success: true,
                unread_count: 1,
                notifications: [{
                    id: 'notif-6',
                    title: 'Backdrop Test Title',
                    message: 'Backdrop test message.',
                    is_read: false,
                    notification_type: 'GENERIC_ANNOUNCEMENT',
                    payload: {},
                    created_at: '2026-06-08T08:00:00.000Z'
                }]
            })
        });

        const user = userEvent.setup();
        renderNotificationBell();

        await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: /open notifications/i }));

        const article = await screen.findByText('Backdrop Test Title');
        await user.click(article);

        // Verify Modal is open
        expect(await screen.findByText('Notification Details')).toBeInTheDocument();

        // Click inside the modal (e.g. on the message body)
        const messageBody = screen.getByText('Backdrop test message.');
        await user.click(messageBody);

        // Modal should still be open
        expect(screen.getByText('Notification Details')).toBeInTheDocument();

        // Click on the backdrop overlay (outer fixed container)
        const backdrop = document.querySelector('.fixed.inset-0');
        expect(backdrop).toBeInTheDocument();

        await user.click(backdrop);

        // Modal should close
        await waitFor(() => {
            expect(screen.queryByText('Notification Details')).not.toBeInTheDocument();
        });
    });
});
