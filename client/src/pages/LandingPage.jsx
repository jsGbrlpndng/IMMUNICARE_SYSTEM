import React from 'react';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    Activity,
    ShieldCheck,
    ArrowRight,
    Bell,
    Map as MapIcon,
    FileText,
    Users,
    Lock,
    Globe2,
    BarChart3,
    PlayCircle,
    Clock,
    Menu,
    X
} from 'lucide-react';

const LandingPage = () => {
    const [scrolled, setScrolled] = useState(false);
    const [activeSection, setActiveSection] = useState('home');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 50);
        };
        window.addEventListener('scroll', handleScroll);

        // Intersection Observer for active section highlighting
        const observerOptions = {
            root: null,
            rootMargin: '-40% 0px -40% 0px',
            threshold: 0
        };

        const observerCallback = (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    setActiveSection(entry.target.id);
                }
            });
        };

        const observer = new IntersectionObserver(observerCallback, observerOptions);

        const sections = ['home', 'features', 'community', 'analytics'];
        sections.forEach((id) => {
            const el = document.getElementById(id);
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
            const extraPadding = 40;
            const viewportHeight = window.innerHeight;
            const elementHeight = el.offsetHeight;

            const bodyRect = document.body.getBoundingClientRect().top;
            const elementRect = el.getBoundingClientRect().top;
            const elementPosition = elementRect - bodyRect;

            let offsetPosition;

            if (elementHeight < viewportHeight - headerHeight - (extraPadding * 2)) {
                // If the section is small enough, center it in the remaining space
                const centerOffset = (viewportHeight - elementHeight) / 2;
                offsetPosition = elementPosition - centerOffset;
            } else {
                // Snap to top with header offset + some extra breathing room
                offsetPosition = elementPosition - (headerHeight + extraPadding);
            }

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        }
        setMobileMenuOpen(false); // Close mobile menu after navigation
    };

    return (
        <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-blue-500/10">
            {/* Header / Navigation */}
            <nav className={`fixed top-0 w-full z-[100] transition-all duration-500 ${scrolled ? 'glass-nav py-3' : 'bg-transparent py-5'}`}>
                <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between">
                    {/* Logo (Left) */}
                    <div className="flex items-center space-x-2 cursor-pointer" onClick={() => scrollTo('home')}>
                        <div className="w-8 h-8 bg-[#0061FF] rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
                            <Activity className="text-white w-5 h-5" />
                        </div>
                        <span className="text-xl font-bold tracking-tight text-slate-900">ImmuniCare</span>
                    </div>

                    {/* Nav Links (Center) */}
                    <div className="hidden md:flex items-center space-x-1">
                        {['Home', 'Features', 'Community', 'Analytics'].map((item) => (
                            <button
                                key={item}
                                onClick={() => scrollTo(item.toLowerCase())}
                                className={`nav-link px-4 py-2 rounded-lg transition-all duration-500 relative overflow-hidden ${activeSection === item.toLowerCase()
                                        ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-[#0061FF] font-semibold shadow-lg shadow-blue-500/20 scale-105'
                                        : 'text-slate-600 hover:text-[#0061FF] hover:bg-slate-50 hover:scale-102'
                                    }`}
                            >
                                <span className="relative z-10">{item}</span>
                                {activeSection === item.toLowerCase() && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-[#0061FF]/5 to-[#0061FF]/10 animate-pulse" />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Login & Mobile Menu (Right) */}
                    <div className="flex items-center space-x-4">
                        <Link to="/portal" className="btn-primary !py-2 !px-6 text-sm">
                            Login
                        </Link>

                        {/* Mobile Menu Button */}
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="md:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
                        >
                            {mobileMenuOpen ? (
                                <X className="w-5 h-5 text-slate-600" />
                            ) : (
                                <Menu className="w-5 h-5 text-slate-600" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Mobile Menu */}
                {mobileMenuOpen && (
                    <div className="md:hidden bg-white border-t border-slate-100 shadow-lg">
                        <div className="px-6 py-4 space-y-2">
                            {['Home', 'Features', 'Community', 'Analytics'].map((item) => (
                                <button
                                    key={item}
                                    onClick={() => scrollTo(item.toLowerCase())}
                                    className={`block w-full text-left px-4 py-3 rounded-lg transition-all duration-500 ${activeSection === item.toLowerCase()
                                            ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-[#0061FF] font-semibold shadow-lg shadow-blue-500/20'
                                            : 'text-slate-600 hover:text-[#0061FF] hover:bg-slate-50'
                                        }`}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </nav>

            {/* Modern Hero Section */}
            <section id="home" className="relative pt-24 pb-0 lg:pt-32 lg:pb-0 overflow-hidden">
                {/* Subtle Geometric Accents */}
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-50 rounded-full blur-3xl opacity-50 pointer-events-none" />
                <div className="absolute top-1/2 -left-20 w-72 h-72 bg-emerald-50 rounded-full blur-3xl opacity-40 pointer-events-none" />

                <div className="max-w-7xl mx-auto px-6 lg:px-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center text-left">
                        {/* Text Content */}
                        <div className="relative z-10">
                            <div className="inline-flex items-center space-x-2 badge-blue mb-8">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#0061FF]" />
                                <span className="text-[10px] uppercase font-bold tracking-widest text-[#0061FF]">Now Active in San Pedro</span>
                            </div>

                            <h1 className="text-5xl lg:text-7xl font-extrabold text-slate-900 leading-[1.1] mb-8">
                                Empowering <br />
                                <span className="text-[#0061FF]">Healthy Futures</span> in <br />
                                San Pedro
                            </h1>

                            <p className="text-lg text-slate-500 leading-relaxed mb-10 max-w-xl">
                                Streamlining vaccination tracking and support for community health workers with modern tools designed for care. Ensure no child is left behind.
                            </p>

                            <div className="flex flex-col sm:flex-row items-center gap-4 mb-12">
                                <Link to="/portal" className="btn-primary w-full sm:w-auto h-14 !px-10 shadow-lg shadow-blue-500/25">
                                    Access Portal
                                    <ArrowRight className="ml-2 w-4 h-4" />
                                </Link>
                                <button className="btn-outline w-full sm:w-auto h-14 bg-white !px-10 border-2">
                                    <PlayCircle className="mr-2 w-5 h-5 text-[#0061FF]" />
                                    Watch Demo
                                </button>
                            </div>

                            {/* Trust Indicators */}
                            <div className="flex items-center space-x-4">
                                <div className="flex -space-x-2">
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-slate-100 overflow-hidden shadow-sm">
                                            <img src={`https://i.pravatar.cc/100?img=${i + 15}`} alt="User" />
                                        </div>
                                    ))}
                                </div>
                                <p className="text-sm text-slate-500">
                                    Trusted by <span className="font-bold text-slate-900">500+</span> Health Workers
                                </p>
                            </div>
                        </div>

                        {/* Image Side */}
                        <div className="relative">
                            <div className="rounded-[2.5rem] overflow-hidden shadow-large bg-slate-50 relative">
                                <img
                                    src="/assets/community_health_worker.png"
                                    alt="Community Health Worker"
                                    className="w-full aspect-[5/4] object-cover"
                                />
                                {/* Overlay Stats Bar */}
                                <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm p-5 border-t border-slate-100 flex items-center justify-between">
                                    <div className="flex items-center space-x-4 text-left">
                                        <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                                            <ShieldCheck size={20} />
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-slate-400 leading-none mb-1">Today's Impact</p>
                                            <p className="text-sm font-bold text-slate-900">124 Vaccinations Completed</p>
                                        </div>
                                    </div>
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Advanced Tools Section */}
            <section id="features" className="py-0 bg-[#F8FAFC]">
                <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center py-12">
                    <h2 className="text-3xl lg:text-4xl font-extrabold text-[#1E293B] mb-4">Advanced Tools for Health Workers</h2>
                    <p className="text-slate-500 max-w-2xl mx-auto mb-8">Our platform integrates essential tools to ensure no child is left behind in the immunization schedule.</p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
                        {[
                            { title: 'NIP Schedule Engine', desc: 'Automated scheduling aligned with National Immunization Program standards to ensure timely doses.', icon: <FileText className="text-[#0061FF]" /> },
                            { title: 'SMS Reminders', desc: 'Reduce drop-out rates with automated patient follow-ups via SMS sent directly to parents.', icon: <Bell className="text-[#0061FF]" /> },
                            { title: 'Geospatial Mapping', desc: 'Visualize coverage gaps and target resources effectively across barangays with heatmaps.', icon: <MapIcon className="text-[#0061FF]" /> }
                        ].map((feature, i) => (
                            <div key={i} className="bg-white p-10 rounded-[2rem] border border-white hover:border-slate-100 transition-all duration-300 card-premium group hover:shadow-xl hover:-translate-y-1">
                                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-8 group-hover:bg-blue-100 transition-colors">
                                    {feature.icon}
                                </div>
                                <h4 className="text-xl font-bold text-slate-900 mb-4">{feature.title}</h4>
                                <p className="text-slate-500 text-sm leading-relaxed">{feature.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Community Section: Clean Testimonials */}
            <section id="community" className="py-0">
                <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                        <div>
                            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-[0.2em] mb-6">Local Impact</h2>
                            <h3 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-6 leading-tight">
                                Empowering health workers <br /> in every Barangay.
                            </h3>
                            <p className="text-lg text-slate-600 mb-8 leading-relaxed max-w-xl">
                                We're not just building software; we're building a foundation for healthier communities. See how Immunicare is transforming local health units.
                            </p>

                            <div className="p-6 bg-blue-50/50 rounded-3xl border border-blue-100 flex gap-4 items-start">
                                <Users className="text-blue-600 shrink-0 mt-1" size={32} />
                                <div>
                                    <p className="text-slate-700 font-medium italic mb-4 leading-relaxed">
                                        "Immunicare has reduced our paperwork by 80%. We spend more time with patients and less time searching through physical binders."
                                    </p>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden">
                                            <img src="https://images.unsplash.com/photo-1559839734-2b71f1536785?auto=format&fit=crop&q=80&w=100" alt="Nurse Elena" className="w-full h-full object-cover" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">Nurse Elena Santos</p>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Head Health Officer</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="relative">
                            <div className="aspect-[4/5] bg-slate-100 rounded-[2.5rem] overflow-hidden shadow-2xl">
                                <img
                                    src="https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&q=80&w=2070"
                                    alt="Health Center Team"
                                    className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-[2s]"
                                />
                            </div>
                            <div className="absolute -bottom-8 -left-8 bg-white p-6 rounded-3xl shadow-xl border border-slate-100">
                                <p className="text-4xl font-extrabold text-blue-600 mb-1">12+</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Puroks Digitalized</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section >

            {/* Data Intelligence: Simplified Analytics */}
            <section id="analytics" className="bg-slate-900 py-0 text-white overflow-hidden relative">
                <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10 py-12">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                        <div>
                            <div className="inline-flex items-center space-x-2 bg-white/10 text-emerald-400 px-3 py-1 rounded-full mb-6 text-xs font-bold uppercase tracking-wider">
                                <BarChart3 size={14} className="mr-1" />
                                Intelligence Layer
                            </div>
                            <h3 className="text-4xl md:text-6xl font-extrabold mb-6 leading-tight">
                                Real-time <br /> <span className="text-blue-500">Outbreak</span> <br /> Prevention.
                            </h3>
                            <p className="text-lg text-slate-400 mb-8 leading-relaxed max-w-lg">
                                Transform raw census data into actionable medical intelligence. Monitor coverage gaps across Puroks as they happen.
                            </p>

                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { label: 'Latency', val: '0.4s', icon: Clock },
                                    { label: 'Uptime', val: '99.9%', icon: ShieldCheck }
                                ].map((stat, i) => (
                                    <div key={i} className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                                        <stat.icon size={18} className="text-blue-500 mb-4" />
                                        <p className="text-2xl font-bold mb-1">{stat.val}</p>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{stat.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white/5 border border-white/10 p-6 rounded-[2rem] backdrop-blur-sm">
                            <div className="flex items-center justify-between mb-6">
                                <p className="text-sm font-bold">Monthly Coverage</p>
                                <div className="flex gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                </div>
                            </div>
                            <div className="h-48 flex items-end gap-3 mb-6">
                                {[40, 65, 45, 90, 55, 85, 75].map((h, i) => (
                                    <div key={i} className="flex-1 bg-white/10 rounded-t-lg transition-all duration-1000 group hover:bg-blue-500/50 cursor-pointer relative" style={{ height: `${h}%` }}>
                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                            {h}%
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                <span>Jan</span>
                                <span>Mar</span>
                                <span>May</span>
                                <span>Jul</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section >

            {/* Final CTA Section */}
            <section className="bg-white py-0 overflow-hidden relative">
                <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center relative z-10 py-12">
                    <h3 className="text-4xl md:text-6xl font-extrabold mb-6 text-slate-900 tracking-tight">
                        Ready to secure <br /> your <span className="text-blue-600">Purok?</span>
                    </h3>
                    <p className="text-lg text-slate-600 mb-8 max-w-2xl mx-auto leading-relaxed">
                        Join the growing network of digitalized health centers. Professional management for serious missions.
                    </p>

                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <Link to="/portal" className="btn-primary h-14 !px-12 text-base shadow-lg shadow-blue-500/25">
                            <span>Get Started Now</span>
                        </Link>
                        <button className="btn-outline h-14 !px-12 text-base border-2">
                            Contact Support
                        </button>
                    </div>
                </div>
            </section >

            {/* Minimalist Footer */}
            <footer className="bg-slate-50 border-t border-slate-100 pt-12 pb-8">
                <div className="max-w-7xl mx-auto px-6 lg:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
                        <div className="col-span-1 md:col-span-1">
                            <div className="flex items-center space-x-2.5 mb-4 group cursor-pointer" onClick={() => scrollTo('home')}>
                                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105">
                                    <Activity className="text-white w-4 h-4" />
                                </div>
                                <span className="text-lg font-bold tracking-tight text-slate-900">Immunicare</span>
                            </div>
                            <p className="text-sm text-slate-500 leading-relaxed max-w-xs">
                                The gold standard for digital immunization frameworks. Transforming Barangay health through data.
                            </p>
                        </div>

                        <div>
                            <h5 className="text-[10px] font-bold uppercase tracking-widest text-slate-900 mb-4">Platform</h5>
                            <ul className="space-y-3 text-sm text-slate-500">
                                <li><a href="#features" onClick={(e) => { e.preventDefault(); scrollTo('features'); }} className="hover:text-blue-600 transition-colors">Digital Registry</a></li>
                                <li><a href="#analytics" onClick={(e) => { e.preventDefault(); scrollTo('analytics'); }} className="hover:text-blue-600 transition-colors">SMS Alerts</a></li>
                                <li><a href="#" className="hover:text-blue-600 transition-colors">Clinical Maps</a></li>
                            </ul>
                        </div>

                        <div>
                            <h5 className="text-[10px] font-bold uppercase tracking-widest text-slate-900 mb-4">Organization</h5>
                            <ul className="space-y-3 text-sm text-slate-500">
                                <li><a href="#" className="hover:text-blue-600 transition-colors">Privacy & Shield</a></li>
                                <li><a href="#" className="hover:text-blue-600 transition-colors">Health Protocols</a></li>
                                <li><a href="#" className="hover:text-blue-600 transition-colors">Staff Support</a></li>
                            </ul>
                        </div>

                        <div>
                            <h5 className="text-[10px] font-bold uppercase tracking-widest text-slate-900 mb-4">Contact</h5>
                            <ul className="space-y-3 text-sm text-slate-500">
                                <li className="flex items-center gap-2"><Globe2 size={14} /> City of San Pedro</li>
                                <li className="flex items-center gap-2"><Lock size={14} /> HIPAA Compliant</li>
                            </ul>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-slate-200/60 flex flex-col md:flex-row justify-between items-center gap-4">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            Â© 2026 Immunicare Digital. v2.1.0 Stable
                        </p>
                        <div className="flex items-center space-x-6">
                            <a href="#" className="text-[10px] font-bold text-slate-400 hover:text-blue-600 uppercase tracking-widest transition-colors">Terms</a>
                            <a href="#" className="text-[10px] font-bold text-slate-400 hover:text-blue-600 uppercase tracking-widest transition-colors">Privacy</a>
                        </div>
                    </div>
                </div>
            </footer >
        </div >
    );
};

export default LandingPage;
