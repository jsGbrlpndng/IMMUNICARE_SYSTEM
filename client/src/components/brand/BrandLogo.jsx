import React from 'react';

const LOGO_SRC = '/assets/immunicare-logo.png';

const variantClasses = {
    compact: {
        wrapper: 'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-slate-200',
        image: 'h-9 w-9 object-contain'
    },
    lockup: {
        wrapper: 'inline-flex min-w-0 items-center gap-3',
        imageWrap: 'flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-slate-200',
        image: 'h-11 w-11 object-contain'
    },
    darkSurface: {
        wrapper: 'inline-flex min-w-0 items-center gap-3',
        imageWrap: 'flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-white/30',
        image: 'h-11 w-11 object-contain'
    },
    print: {
        wrapper: 'inline-flex shrink-0 items-center justify-center overflow-hidden bg-white',
        image: 'h-12 w-12 object-contain'
    }
};

const toneClasses = {
    light: {
        name: 'text-[#064E3B]',
        subtitle: 'text-emerald-700'
    },
    dark: {
        name: 'text-white',
        subtitle: 'text-emerald-100'
    }
};

const BrandLogo = ({
    variant = 'lockup',
    subtitle,
    showText = true,
    className = '',
    imageClassName = '',
    textClassName = '',
    subtitleClassName = '',
    tone = 'light'
}) => {
    const styles = variantClasses[variant] || variantClasses.lockup;
    const tones = toneClasses[tone] || toneClasses.light;
    const isLockup = variant === 'lockup' || variant === 'darkSurface';
    const shouldShowText = showText && isLockup;

    if (!shouldShowText) {
        return (
            <span className={`${styles.wrapper} ${className}`.trim()} aria-label="IMMUNICARE">
                <img
                    src={LOGO_SRC}
                    alt="IMMUNICARE logo"
                    className={`${styles.image} ${imageClassName}`.trim()}
                    draggable="false"
                />
            </span>
        );
    }

    return (
        <span className={`${styles.wrapper} ${className}`.trim()}>
            <span className={styles.imageWrap}>
                <img
                    src={LOGO_SRC}
                    alt="IMMUNICARE logo"
                    className={`${styles.image} ${imageClassName}`.trim()}
                    draggable="false"
                />
            </span>
            <span className="min-w-0 text-left leading-none">
                <span className={`block truncate text-lg font-black tracking-tight ${tones.name} ${textClassName}`.trim()}>
                    IMMUNICARE
                </span>
                {subtitle ? (
                    <span className={`mt-1 block truncate text-[9px] font-black uppercase tracking-[0.18em] ${tones.subtitle} ${subtitleClassName}`.trim()}>
                        {subtitle}
                    </span>
                ) : null}
            </span>
        </span>
    );
};

export default BrandLogo;
export { LOGO_SRC };
