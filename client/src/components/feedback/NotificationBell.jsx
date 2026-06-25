import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCheck, Loader2, X } from 'lucide-react';
import apiClient from '../../services/apiClient';
import { useAuth } from '../../contexts/AuthContext';


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
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [error, setError] = useState('');
    const [selectedNotification, setSelectedNotification] = useState(null);
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

    const handleNotificationClick = (notification) => {
        setSelectedNotification(notification);
        setIsOpen(false);
    };

    const handleModalClose = () => {
        setSelectedNotification(null);
    };

    const handleModalMarkAsRead = async () => {
        if (selectedNotification && !selectedNotification.is_read) {
            await markAsRead(selectedNotification.id);
            setSelectedNotification((curr) => curr ? { ...curr, is_read: true } : null);
        }
    };


    if (!visible) return null;

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={handleToggle}
                className="relative flex h-10 w-10 items-center justify-center border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-600 hover:text-emerald-700 font-sans"
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
                                <h3 className="text-sm font-black text-slate-900 font-sans">
                                    System Notifications
                                </h3>
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
                                No notifications right now.
                            </div>
                        ) : notifications.map((notification) => (
                            <article
                                key={notification.id}
                                onClick={() => handleNotificationClick(notification)}
                                className={`cursor-pointer border-b border-slate-100 px-4 py-3 transition hover:bg-slate-50/80 ${notification.is_read ? 'bg-white' : 'bg-emerald-50/60'}`}
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
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                markAsRead(notification.id);
                                            }}
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
                            {unreadNotifications.length} unread notification{unreadNotifications.length === 1 ? '' : 's'}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {selectedNotification && createPortal(
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
                    onClick={handleModalClose}
                >
                    <div
                        className="w-full max-w-lg border border-slate-200 bg-white shadow-2xl rounded-none font-sans overflow-hidden flex flex-col max-h-[85vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="bg-[#064E3B] px-6 py-4 text-white shrink-0">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
                                    Notification Details
                                </p>
                                <span className={`inline-block border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                                    selectedNotification.is_read
                                        ? 'border-emerald-300 text-emerald-300 bg-emerald-950/30'
                                        : 'border-amber-300 text-amber-300 bg-amber-950/30'
                                }`}>
                                    {selectedNotification.is_read ? 'Read' : 'Unread'}
                                </span>
                            </div>
                            <h3 className="mt-2 text-lg font-black leading-tight">
                                {selectedNotification.title}
                            </h3>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-4 overflow-y-auto flex-1">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Message</p>
                                <p className="mt-1 text-sm font-semibold text-slate-700 leading-relaxed">
                                    {selectedNotification.message}
                                </p>
                            </div>

                            {/* Metadata */}
                            <div className="border-t border-slate-100 pt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                                <div>
                                    <span className="block font-black text-slate-400 uppercase tracking-wider text-[9px]">Received At</span>
                                    <span className="font-semibold text-slate-700">{formatDate(selectedNotification.created_at)}</span>
                                </div>

                                {selectedNotification.notification_type && (
                                    <div>
                                        <span className="block font-black text-slate-400 uppercase tracking-wider text-[9px]">Category</span>
                                        <span className="font-semibold text-slate-700">{selectedNotification.notification_type.replace(/_/g, ' ')}</span>
                                    </div>
                                )}

                                {(() => {
                                    const payload = typeof selectedNotification.payload === 'string'
                                        ? JSON.parse(selectedNotification.payload)
                                        : (selectedNotification.payload || {});

                                    return (
                                        <>
                                            {payload.barangay && (
                                                <div>
                                                    <span className="block font-black text-slate-400 uppercase tracking-wider text-[9px]">Barangay</span>
                                                    <span className="font-semibold text-slate-700 uppercase">{payload.barangay}</span>
                                                </div>
                                            )}
                                            {payload.cluster_label && (
                                                <div>
                                                    <span className="block font-black text-slate-400 uppercase tracking-wider text-[9px]">Cluster / Priority Area</span>
                                                    <span className="font-semibold text-slate-700">{payload.cluster_label}</span>
                                                </div>
                                            )}
                                            {payload.infant_name && (
                                                <div>
                                                    <span className="block font-black text-slate-400 uppercase tracking-wider text-[9px]">Related Infant</span>
                                                    <span className="font-semibold text-slate-700">{payload.infant_name}</span>
                                                </div>
                                            )}
                                            {payload.validation_notes && (
                                                <div className="col-span-2">
                                                    <span className="block font-black text-slate-400 uppercase tracking-wider text-[9px]">Validation Notes</span>
                                                    <span className="font-semibold text-slate-700 block bg-slate-50 border border-slate-100 p-2 mt-1 leading-relaxed">{payload.validation_notes}</span>
                                                </div>
                                            )}
                                            {payload.rejection_reason && (
                                                <div className="col-span-2">
                                                    <span className="block font-black text-slate-400 uppercase tracking-wider text-[9px]">Rejection Reason</span>
                                                    <span className="font-semibold text-slate-700 block bg-slate-50 border border-slate-100 p-2 mt-1 leading-relaxed">{payload.rejection_reason}</span>
                                                </div>
                                            )}
                                            {payload.correction_notes && (
                                                <div className="col-span-2">
                                                    <span className="block font-black text-slate-400 uppercase tracking-wider text-[9px]">Correction Notes</span>
                                                    <span className="font-semibold text-slate-700 block bg-slate-50 border border-slate-100 p-2 mt-1 leading-relaxed">{payload.correction_notes}</span>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4 shrink-0">
                            <button
                                type="button"
                                onClick={handleModalClose}
                                className="border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-700 transition hover:bg-slate-50 rounded-none"
                            >
                                Close
                            </button>

                            {!selectedNotification.is_read && (
                                <button
                                    type="button"
                                    onClick={handleModalMarkAsRead}
                                    className="bg-[#064E3B] px-4 py-2 text-xs font-black uppercase tracking-wider text-white transition hover:bg-[#043e2f] rounded-none"
                                >
                                    Mark as Read
                                </button>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default NotificationBell;
