import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import apiClient from '../services/apiClient';

const formatDate = (value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString('en-PH', {
        month: 'short',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit'
    });
};

const NotificationBell = ({ visible = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [error, setError] = useState('');
    const rootRef = useRef(null);

    const unreadNotifications = useMemo(
        () => notifications.filter((item) => !item.is_read),
        [notifications]
    );

    const loadNotifications = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await apiClient.get('/notifications?limit=10');
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success === false) {
                throw new Error(payload?.error || 'Unable to load notifications.');
            }
            setNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
            setUnreadCount(Number(payload.unread_count || 0));
        } catch (requestError) {
            console.error('[NOTIFICATION_BELL]', requestError);
            setError(requestError.message || 'Unable to load notifications.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!visible) return undefined;
        loadNotifications();
        const intervalId = window.setInterval(loadNotifications, 30000);
        return () => window.clearInterval(intervalId);
    }, [visible]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const handleOutsideClick = (event) => {
            if (rootRef.current && !rootRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [isOpen]);

    const handleToggle = async () => {
        const next = !isOpen;
        setIsOpen(next);
        if (next) {
            await loadNotifications();
        }
    };

    const markAsRead = async (notificationId) => {
        try {
            const response = await apiClient.post(`/notifications/${notificationId}/read`, {});
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success === false) {
                throw new Error(payload?.error || 'Unable to mark notification as read.');
            }
            setNotifications((current) => current.map((item) => (
                item.id === notificationId
                    ? { ...item, is_read: true, read_at: payload?.notification?.read_at || new Date().toISOString() }
                    : item
            )));
            setUnreadCount((current) => Math.max(current - 1, 0));
        } catch (requestError) {
            console.error('[NOTIFICATION_MARK_READ]', requestError);
            setError(requestError.message || 'Unable to mark notification as read.');
        }
    };

    if (!visible) return null;

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={handleToggle}
                className="relative flex h-10 w-10 items-center justify-center border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-600 hover:text-emerald-700"
                aria-label="Open notifications"
            >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 ? (
                    <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[10px] font-black text-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                ) : null}
            </button>

            {isOpen ? (
                <div className="absolute right-0 top-12 z-50 w-[360px] border border-slate-200 bg-white shadow-2xl">
                    <div className="border-b border-slate-200 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Notifications</p>
                                <h3 className="text-sm font-black text-slate-900">Transfer Handoff Notices</h3>
                            </div>
                            {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
                        </div>
                    </div>

                    <div className="max-h-[420px] overflow-auto">
                        {error ? (
                            <div className="border-b border-slate-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
                                {error}
                            </div>
                        ) : null}

                        {!loading && notifications.length === 0 ? (
                            <div className="px-4 py-8 text-center text-xs font-bold text-slate-500">
                                No transfer handoff notices right now.
                            </div>
                        ) : notifications.map((notification) => (
                            <article
                                key={notification.id}
                                className={`border-b border-slate-100 px-4 py-3 ${notification.is_read ? 'bg-white' : 'bg-emerald-50/60'}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-black text-slate-900">{notification.title}</p>
                                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{notification.message}</p>
                                        <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                                            {formatDate(notification.created_at)}
                                        </p>
                                    </div>
                                    {!notification.is_read ? (
                                        <button
                                            type="button"
                                            onClick={() => markAsRead(notification.id)}
                                            className="flex items-center gap-1 border border-emerald-700 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700 hover:bg-emerald-700 hover:text-white"
                                        >
                                            <CheckCheck className="h-3.5 w-3.5" />
                                            Read
                                        </button>
                                    ) : (
                                        <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Read</span>
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>

                    {unreadNotifications.length > 0 ? (
                        <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-bold text-slate-500">
                            {unreadNotifications.length} unread handoff notice{unreadNotifications.length === 1 ? '' : 's'}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
};

export default NotificationBell;
