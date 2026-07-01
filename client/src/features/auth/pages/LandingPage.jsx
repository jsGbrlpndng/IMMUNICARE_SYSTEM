import React from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowRight,
    Bell,
    ClipboardCheck,
    FileText,
    Lock,
    MapPinned,
    Menu,
    ShieldCheck,
    Stethoscope,
    Users,
    X
} from 'lucide-react';
import BrandLogo from '../../../components/brand/BrandLogo';

const BRAND_GREEN = '#064E3B';

const NAV_ITEMS = [
    { label: 'Home', id: 'home' },
    { label: 'Features', id: 'features' },
    { label: 'Workflow', id: 'community' },
    { label: 'Insights', id: 'analytics' }
];

const featureCards = [
    {
        title: 'Infant Registry',
        desc: 'Maintain approved infant records with complete identity, caregiver, barangay, and vaccination context.',
        icon: Users
    },
    {
        title: 'Vaccination Schedule Monitoring',
        desc: 'Track due, overdue, completed, pending validation, and clinically ineligible doses from the NIP schedule.',
        icon: ClipboardCheck
    },
    {
        title: 'Defaulter Tracing',
        desc: 'Prioritize follow-up work for infants who need action before coverage gaps widen.',
        icon: Bell
    },
    {
        title: 'Reports and eTCL/M1',
        desc: 'Support barangay and RHU reporting with immunization coverage and accomplishment views.',
        icon: FileText
    },
    {
        title: 'Hotspot Map Decision Support',
        desc: 'Use geospatial and DBSCAN hotspot views to focus outreach in priority localities.',
        icon: MapPinned
    },
    {
        title: 'Role-Based Access',
        desc: 'Separate BHW, Midwife, Admin, and Super Admin workspaces around the responsibilities of each role.',
        icon: Lock
    }
];

const workflowSteps = [
    ['BHW Registration', 'Capture infant registration details and submit records for midwife validation.'],
    ['Midwife Validation', 'Review submitted records, approve valid registrations, and promote them to the registry.'],
    ['Clinical Monitoring', 'Record and validate doses, monitor overdue schedules, and coordinate follow-up work.'],
    ['RHU Oversight', 'Review coverage, target gaps, reports, audit activity, and geospatial risk patterns.']
];

const insightCards = [
    ['Coverage Reports', 'Barangay and municipal report surfaces for immunization performance review.'],
    ['Validation Queue', 'Controlled review path before records become part of the master infant registry.'],
    ['SMS Follow-Up', 'Caregiver reminders and outreach support where messaging workflows are enabled.'],
    ['Audit Trail', 'Operational traceability for sensitive clinical and administrative actions.']
];

const LandingPage = () => {
    const [scrolled, setScrolled] = useState(false);
    const [activeSection, setActiveSection] = useState('home');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 50);
        window.addEventListener('scroll', handleScroll);

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) setActiveSection(entry.target.id);
            });
        }, {
            root: null,
            rootMargin: '-40% 0px -40% 0px',
            threshold: 0
        });

        NAV_ITEMS.forEach((item) => {
            const el = document.getElementById(item.id);
            if (el) observer.observe(el);
        });

        return () => {
            window.removeEventListener('scroll', handleScroll);
            observer.disconnect();
        };
    }, []);

    const scrollTo = (id) => {
        const el = document.getElementById(id);
        if (el) {
            const headerHeight = 80;
            window.scrollTo({
                top: el.offsetTop - headerHeight,
                behavior: 'smooth'
            });
        }
        setMobileMenuOpen(false);
    };

    return (
        <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-emerald-500/10">
            <nav className={`fixed top-0 z-[100] w-full border-b transition-all duration-300 ${scrolled ? 'border-slate-200 bg-white/95 py-3 shadow-sm backdrop-blur-lg' : 'border-transparent bg-white/80 py-4 backdrop-blur-md'}`}>
                <div className="mx-auto flex max-w-7xl items-center justify-between px-5 lg:px-8">
                    <button type="button" onClick={() => scrollTo('home')} className="flex items-center gap-2">
                        <BrandLogo
                            variant="lockup"
                            subtitle="San Pedro RHU"
                            imageClassName="h-9 w-9"
                        />
                    </button>

                    <div className="hidden items-center gap-1 md:flex">
                        {NAV_ITEMS.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => scrollTo(item.id)}
                                className={`px-3 py-2 text-xs font-black uppercase tracking-wider transition ${activeSection === item.id
                                    ? 'border border-emerald-200 bg-emerald-50 text-[#064E3B]'
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-[#064E3B]'
                                }`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-3">
                        <Link to="/portal" className="inline-flex items-center justify-center border border-[#064E3B] bg-[#064E3B] px-4 py-2 text-xs font-black uppercase tracking-wider text-white shadow-sm transition hover:bg-emerald-900">
                            Login
                        </Link>
                        <button
                            type="button"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 md:hidden"
                            aria-label="Toggle navigation"
                        >
                            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                        </button>
                    </div>
                </div>

                {mobileMenuOpen && (
                    <div className="border-t border-slate-200 bg-white px-5 py-3 md:hidden">
                        {NAV_ITEMS.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => scrollTo(item.id)}
                                className="block w-full px-3 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-emerald-50 hover:text-[#064E3B]"
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                )}
            </nav>

            <section id="home" className="relative min-h-[92vh] overflow-hidden pt-20">
                <img
                    src="/assets/community_health_worker.png"
                    alt="Community health worker supporting infant immunization"
                    className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-slate-950/70" />
                <div className="relative z-10 mx-auto flex min-h-[calc(92vh-5rem)] max-w-7xl flex-col justify-center px-5 py-16 lg:px-8">
                    <div className="max-w-3xl">
                        <div className="mb-6 inline-flex items-center gap-2 border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-50 backdrop-blur">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Infant Immunization Monitoring System
                        </div>
                        <h1 className="text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
                            IMMUNICARE supports barangay and RHU teams from registration to coverage monitoring.
                        </h1>
                        <p className="mt-6 max-w-2xl text-base font-semibold leading-7 text-slate-200 sm:text-lg">
                            A clinical workspace for infant registration, midwife validation, NIP schedule tracking, defaulter follow-up, reports, and geospatial decision support.
                        </p>
                        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                            <Link to="/portal" className="inline-flex h-12 items-center justify-center border border-emerald-500 bg-emerald-600 px-6 text-sm font-black uppercase tracking-wider text-white shadow-sm transition hover:bg-emerald-700">
                                Access Portal <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                            <button type="button" onClick={() => scrollTo('features')} className="inline-flex h-12 items-center justify-center border border-white/30 bg-white/10 px-6 text-sm font-black uppercase tracking-wider text-white backdrop-blur transition hover:bg-white/20">
                                View System Scope
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <section id="features" className="bg-slate-50 py-16">
                <div className="mx-auto max-w-7xl px-5 lg:px-8">
                    <div className="mb-8 max-w-3xl">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">Core System Capabilities</p>
                        <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Built around the infant immunization workflow.</h2>
                        <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
                            IMMUNICARE keeps the user experience close to daily RHU operations: register, validate, schedule, record, follow up, and report.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {featureCards.map((feature) => {
                            const Icon = feature.icon;
                            return (
                                <article key={feature.title} className="border border-slate-200 bg-white p-6 shadow-sm transition hover:border-emerald-800">
                                    <div className="mb-5 flex h-10 w-10 items-center justify-center bg-emerald-50 text-[#064E3B]">
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <h3 className="text-lg font-black text-slate-950">{feature.title}</h3>
                                    <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">{feature.desc}</p>
                                </article>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section id="community" className="bg-white py-16">
                <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-5 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">RHU / Barangay Workflow</p>
                        <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Clear handoffs across roles.</h2>
                        <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
                            The interface separates BHW submission work, midwife validation, and administrative oversight while keeping each step visible for follow-through.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {workflowSteps.map(([title, desc], index) => (
                            <article key={title} className="border border-slate-200 bg-slate-50 p-5">
                                <span className="mb-4 inline-flex h-8 w-8 items-center justify-center bg-[#064E3B] text-xs font-black text-white">
                                    {index + 1}
                                </span>
                                <h3 className="text-base font-black text-slate-950">{title}</h3>
                                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{desc}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section id="analytics" className="bg-slate-950 py-16 text-white">
                <div className="mx-auto max-w-7xl px-5 lg:px-8">
                    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
                        <div>
                            <div className="mb-5 inline-flex items-center gap-2 border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">
                                <MapPinned className="h-3.5 w-3.5" />
                                Decision Support
                            </div>
                            <h2 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl">
                                Coverage insight without leaving the clinical workflow.
                            </h2>
                            <p className="mt-4 text-sm font-semibold leading-6 text-slate-300">
                                Reporting, audit activity, heatmaps, and hotspot monitoring help RHU teams understand where follow-up work needs attention.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {insightCards.map(([title, desc]) => (
                                <article key={title} className="border border-white/10 bg-white/5 p-5">
                                    <Stethoscope className="mb-4 h-5 w-5 text-emerald-300" />
                                    <h3 className="text-base font-black text-white">{title}</h3>
                                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">{desc}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="bg-white py-14">
                <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">Authorized Access</p>
                        <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Open the IMMUNICARE staff portal.</h2>
                        <p className="mt-2 text-sm font-semibold text-slate-500">Use your assigned Staff ID and password to continue.</p>
                    </div>
                    <Link to="/portal" className="inline-flex h-12 items-center justify-center border border-[#064E3B] bg-[#064E3B] px-6 text-sm font-black uppercase tracking-wider text-white shadow-sm transition hover:bg-emerald-900">
                        Staff Login <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </div>
            </section>

            <footer className="border-t border-slate-200 bg-slate-50 py-8">
                <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 text-sm font-semibold text-slate-500 md:flex-row md:items-center md:justify-between lg:px-8">
                    <div className="flex items-center gap-2">
                        <BrandLogo
                            variant="lockup"
                            subtitle="San Pedro RHU"
                            imageClassName="h-8 w-8"
                            textClassName="text-base text-slate-900"
                            subtitleClassName="hidden"
                        />
                    </div>
                    <p>Infant immunization tracking and RHU decision-support workspace.</p>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
