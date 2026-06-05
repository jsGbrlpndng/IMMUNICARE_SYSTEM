import React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    ChevronLeft,
    ChevronRight,
    LogOut,
    Settings,
    ChevronDown,
    Activity,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const T = {
    bg: '#F9FBFC',
    bgHover: '#F1F5F9',
    border: '#E5EAEF',
    textHeading: '#0F172A',
    textLabel: '#475569',
    textMeta: '#94A3B8',
    green: '#059669',
    greenDeep: '#064E3B'
};

/* ─── Logo mark ──────────────────────────────────────────────────── */
const LogoMark = () => (
    <div style={{
        width: 32, height: 32,
        borderRadius: 8,
        background: `linear-gradient(135deg, ${T.green} 0%, ${T.greenDeep} 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        boxShadow: `0 3px 10px rgba(5, 150, 105, 0.25)`,
        border: '1px solid rgba(255,255,255,0.1)',
    }}>
        <Activity size={16} strokeWidth={2.5} color="#fff" />
    </div>
);

/* ─── NavItem ────────────────────────────────────────────────────── */
const NavItem = ({ item, active, isCollapsed, onClick }) => {
    const [hovered, setHovered] = useState(false);
    const Icon = item.icon;
    return (
        <Link
            to={item.path}
            title={isCollapsed ? item.name : ''}
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={`
                relative flex items-center gap-3 transition-all duration-150 cursor-pointer no-underline mr-2 rounded-r-lg
                ${isCollapsed ? 'py-[10px] px-0 justify-center' : 'py-[9px] pl-4 pr-3 justify-start'}
                ${active 
                    ? 'bg-emerald-50 border-l-4 border-emerald-800 border-y border-r border-slate-200 shadow-sm' 
                    : 'border-l-4 border-transparent bg-transparent hover:bg-slate-100'}
            `}
        >

            {/* Icon */}
            <Icon
                size={17}
                strokeWidth={active ? 2.5 : 1.8}
                style={{
                    flexShrink: 0,
                    color:      active ? T.green : hovered ? T.greenDeep : '#94A3B8',
                    transition: 'color 0.15s',
                }}
            />

            {/* Label */}
            {!isCollapsed && (
                <span style={{
                    fontSize:   13.5,
                    fontWeight: active ? 600 : 500,
                    color:      active ? T.greenDeep : hovered ? T.greenDeep : T.textHeading,
                    letterSpacing: '-0.01em',
                    transition: 'color 0.15s, font-weight 0.15s',
                }}>
                    {item.name}
                </span>
            )}
        </Link>
    );
};

/* ─── Dropdown row ───────────────────────────────────────────────── */
const DropRow = ({ icon, label, onClick, danger }) => {
    const [h, setH] = useState(false);
    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setH(true)}
            onMouseLeave={() => setH(false)}
            style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', fontSize: 13, fontWeight: 500,
                color:  danger ? (h ? '#B91C1C' : '#EF4444') : (h ? T.green : T.textHeading),
                background: h ? (danger ? 'rgba(239, 68, 68, 0.08)' : T.bgHover) : 'transparent',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                transition: 'all 0.12s',
                borderRadius: danger ? 6 : 0,
                margin: danger ? '4px 8px 8px' : 0,
                width: danger ? 'calc(100% - 16px)' : '100%',
            }}
        >
            <span style={{ color: danger ? 'inherit' : (h ? T.green : '#94A3B8') }}>
                {icon}
            </span>
            {label}
        </button>
    );
};

/* ─── Main Sidebar ───────────────────────────────────────────────── */
const SidebarNav = ({
    isCollapsed,
    setIsCollapsed,
    isMobileOpen,
    setIsMobileOpen,
    navItems = [],
    accountSettingsPath = '/clinical/profile',
    brandSubtitle = null,
    logoutRedirectPath = '/'
}) => {
    const location  = useLocation();
    const navigate  = useNavigate();
    const { user, logout, auditLogout } = useAuth();
    const [accountOpen,   setAccountOpen]   = useState(false);
    const [collapseHover, setCollapseHover] = useState(false);
    const accountRef = useRef(null);

    const isActive = path => location.pathname === path;

    useEffect(() => {
        const h = e => {
            if (accountRef.current && !accountRef.current.contains(e.target)) {
                setAccountOpen(false);
            }
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    const handleLogout = () => {
        auditLogout?.();
        logout();
        navigate(logoutRedirectPath);
    };

    const displayName = user?.full_name || user?.name || 'Clinical Staff';
    const initials    = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const roleLabel   = user?.role || 'Midwife';

    return (
        <>
            {/* Mobile backdrop */}
            {isMobileOpen && (
                <div
                    style={{ position:'fixed', inset:0, zIndex:40, background:'rgba(30,44,60,0.35)', backdropFilter:'blur(2px)' }}
                    className="lg:hidden"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            {/* ── Sidebar shell ─────────────────────────────────────── */}
            <aside
                style={{
                    background:  T.bg,
                    borderRight: `1px solid ${T.border}`,
                    fontFamily:  "'Inter', 'DM Sans', system-ui, sans-serif",
                    position:    'fixed',
                    top: 0, left: 0, bottom: 0,
                    zIndex: 50,
                    display:        'flex',
                    flexDirection:  'column',
                    width:          isCollapsed ? 80 : 256,
                    transition:     'width 0.26s cubic-bezier(0.4,0,0.2,1)',
                    overflow:       'hidden',
                    boxShadow:      '2px 0 16px rgba(44,62,80,0.06)',
                }}
                className={!isMobileOpen ? '-translate-x-full lg:translate-x-0' : ''}
            >
                {/* ── Logo header ─────────────────────────────────────── */}
                <div style={{
                    display:        'flex',
                    alignItems:     'center',
                    height:         64,
                    padding:        isCollapsed ? '0 12px' : '0 20px',
                    borderBottom:   `1px solid ${T.border}`,
                    gap:            12,
                    flexShrink:     0,
                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                    background:     '#FFFFFF',
                }}>
                    <LogoMark />
                    {!isCollapsed && (
                        <div style={{ display:'flex', flexDirection:'column', lineHeight:1.2 }}>
                            <span style={{ color: T.greenDeep, fontSize:15, fontWeight:800, letterSpacing:'-0.6px' }}>
                                ImmuniCare
                            </span>
                            <span style={{ color: T.green, fontSize:9, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', opacity: 0.9 }}>
                                {brandSubtitle || (user?.assigned_barangay ? `BARANGAY ${user.assigned_barangay}` : 'San Pedro RHU')}
                            </span>
                        </div>
                    )}
                </div>

                {/* ── Navigation body ──────────────────────────────────── */}
                <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'14px 8px 8px', scrollbarWidth:'none' }}>
                    {navItems.map((group, gi) => (
                        <div key={group.group} style={{ marginBottom: gi < navItems.length - 1 ? 2 : 0 }}>
                            {/* Thin divider between groups */}
                            {gi > 0 && (
                                <div style={{
                                    height: 1,
                                    background: T.border,
                                    margin: '10px 4px 10px',
                                }} />
                            )}

                            {/* Group label */}
                            {!isCollapsed && (
                                <p style={{
                                    margin:          0,
                                    padding:         '12px 6px 8px 20px',
                                    fontSize:        10,
                                    fontWeight:      700,
                                    letterSpacing:   '0.1em',
                                    textTransform:   'uppercase',
                                    color:           T.textLabel,
                                    lineHeight:      1,
                                    opacity:         0.8,
                                }}>
                                    {group.group}
                                </p>
                            )}

                            {/* Items */}
                            <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                                {group.items.map(item => (
                                    <NavItem
                                        key={item.name}
                                        item={item}
                                        active={isActive(item.path)}
                                        isCollapsed={isCollapsed}
                                        onClick={() => setIsMobileOpen(false)}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── User profile footer ──────────────────────────────── */}
                <div
                    ref={accountRef}
                    style={{
                        borderTop:  `1px solid ${T.border}`,
                        padding:    '10px 8px 8px',
                        flexShrink: 0,
                        position:   'relative',
                        background: T.bg,
                    }}
                >


                    {/* Profile trigger */}
                    <button
                        onClick={() => setAccountOpen(!accountOpen)}
                        style={{
                            width:          '100%',
                            display:        'flex',
                            alignItems:     'center',
                            gap:            12,
                            padding:        isCollapsed ? '10px 0' : '12px 14px',
                            borderRadius:   10,
                            background:     T.greenDeep,
                            boxShadow:      '0 4px 12px rgba(6, 78, 59, 0.15)',
                            cursor:         'pointer',
                            justifyContent: isCollapsed ? 'center' : 'flex-start',
                            transition:     'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            position:       'relative',
                            zIndex:         1,
                            border:         '1px solid rgba(255,255,255,0.08)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(6, 78, 59, 0.2)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(6, 78, 59, 0.15)'; }}
                    >
                        {/* Avatar */}
                        <div style={{
                            width:          34,
                            height:         34,
                            borderRadius:   8,
                            background:     'rgba(255, 255, 255, 0.12)',
                            border:         '1px solid rgba(255, 255, 255, 0.2)',
                            display:        'flex',
                            alignItems:     'center',
                            justifyContent: 'center',
                            flexShrink:     0,
                            color:          '#FFFFFF',
                            fontSize:       12,
                            fontWeight:     800,
                            letterSpacing:  '0.02em',
                        }}>
                            {initials}
                        </div>

                        {!isCollapsed && (
                            <>
                                <div style={{ flex:1, minWidth:0, textAlign:'left' }}>
                                    <p style={{ margin:0, fontSize:13.5, fontWeight:700, color:'#FFFFFF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', letterSpacing:'-0.1px' }}>
                                        {displayName}
                                    </p>
                                    <p style={{ margin:0, marginTop:1, fontSize:9, color:'#D1FAE5', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:700, opacity: 0.9 }}>
                                        {roleLabel}
                                    </p>
                                </div>
                                <ChevronDown size={14} strokeWidth={3} style={{
                                    color:      '#FFFFFF',
                                    flexShrink: 0,
                                    transform:  accountOpen ? 'rotate(180deg)' : 'rotate(0)',
                                    transition: 'transform 0.25s',
                                    opacity: 0.8,
                                }} />
                            </>
                        )}
                    </button>

                    {/* Dropdown — upward */}
                    {accountOpen && (
                        <div style={{
                            position:     'absolute',
                            bottom:       'calc(100% + 6px)',
                            left:         isCollapsed ? 60 : 8,
                            right:        isCollapsed ? 'auto' : 8,
                            width:        isCollapsed ? 210 : 'auto',
                            background:   '#fff',
                            border:       `1px solid ${T.border}`,
                            borderRadius: 8,
                            boxShadow:    '0 8px 32px rgba(44,62,80,0.14)',
                            overflow:     'hidden',
                            zIndex:       100,
                        }}>
                            {/* Header */}
                            {isCollapsed && (
                                <div style={{ padding:'11px 14px 9px', borderBottom:`1px solid ${T.border}` }}>
                                    <p style={{ margin:0, fontSize:12.5, fontWeight:600, color:T.textHeading }}>{displayName}</p>
                                    <p style={{ margin:0, marginTop:2, fontSize:9.5, color:T.textMeta, textTransform:'uppercase', letterSpacing:'0.07em' }}>{roleLabel}</p>
                                </div>
                            )}
                            <DropRow icon={<Settings size={12} strokeWidth={1.7} />} label="Account Settings" onClick={() => { navigate(accountSettingsPath); setAccountOpen(false); }} />
                            <div style={{ height:1, background:T.border }} />
                            <DropRow
                                icon={<LogOut size={12} strokeWidth={1.7} />}
                                label="Sign Out"
                                danger
                                onClick={() => { handleLogout(); setAccountOpen(false); }}
                            />
                        </div>
                    )}
                </div>

                {/* ── Collapse toggle ──────────────────────────────────── */}
                <div
                    style={{ borderTop:`1px solid ${T.border}`, padding:'7px 8px 8px', flexShrink:0 }}
                    className="hidden lg:block"
                >
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        onMouseEnter={() => setCollapseHover(true)}
                        onMouseLeave={() => setCollapseHover(false)}
                        style={{
                            width:          '100%',
                            display:        'flex',
                            alignItems:     'center',
                            justifyContent: 'center',
                            gap:            8,
                            padding:        '8px',
                            borderRadius:   6,
                            border:         collapseHover ? `1px solid ${T.border}` : '1px solid transparent',
                            background:     collapseHover ? '#FFFFFF' : 'transparent',
                            color:          collapseHover ? T.green : T.textMeta,
                            cursor:         'pointer',
                            fontSize:       12,
                            fontWeight:     600,
                            letterSpacing:  '0.01em',
                            transition:     'all 0.15s',
                            boxShadow:      collapseHover ? '0 2px 6px rgba(0,0,0,0.03)' : 'none',
                        }}
                    >
                        {isCollapsed
                            ? <ChevronRight size={14} strokeWidth={2.5} />
                            : <><ChevronLeft size={14} strokeWidth={2.5} /><span>Collapse Sidebar</span></>
                        }
                    </button>
                </div>
            </aside>
        </>
    );
};

export default SidebarNav;

