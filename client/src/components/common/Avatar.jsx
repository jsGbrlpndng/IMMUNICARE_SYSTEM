import React from 'react';

/**
 * Avatar Component
 * Displays user initials with a colored background based on name hash
 * Supports three size variants: small (40px), medium (60px), large (80px)
 */
const Avatar = ({ name, size = 'medium', className = '' }) => {
  // Extract initials from name (first letter of first and last name)
  const getInitials = (fullName) => {
    if (!fullName || !fullName.trim()) return '?';
    
    const names = fullName.trim().split(' ').filter(n => n.length > 0);
    if (names.length === 0) return '?';
    if (names.length === 1) {
      return names[0].charAt(0).toUpperCase();
    }
    
    const firstInitial = names[0].charAt(0).toUpperCase();
    const lastInitial = names[names.length - 1].charAt(0).toUpperCase();
    return `${firstInitial}${lastInitial}`;
  };

  // Generate consistent color based on name hash
  const getColorFromName = (fullName) => {
    if (!fullName) return 'bg-slate-500';
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < fullName.length; i++) {
      hash = fullName.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Color palette with good contrast for white text
    const colors = [
      'bg-blue-600',
      'bg-emerald-600',
      'bg-purple-600',
      'bg-pink-600',
      'bg-orange-600',
      'bg-teal-600',
      'bg-indigo-600',
      'bg-rose-600',
      'bg-cyan-600',
      'bg-amber-600',
    ];
    
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  // Size variants
  const sizeClasses = {
    small: 'w-10 h-10 text-sm',
    medium: 'w-15 h-15 text-base',
    large: 'w-20 h-20 text-2xl',
  };

  const initials = getInitials(name);
  const bgColor = getColorFromName(name);
  const sizeClass = sizeClasses[size] || sizeClasses.medium;

  return (
    <div
      className={`${bgColor} ${sizeClass} rounded-full flex items-center justify-center text-white font-semibold ${className}`}
      aria-label={name || 'User avatar'}
      role="img"
    >
      {initials}
    </div>
  );
};

export default Avatar;
