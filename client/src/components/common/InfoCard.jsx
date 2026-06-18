import React from 'react';
/**
 * InfoCard Component
 * Reusable card component for displaying information sections
 * Features consistent styling with title, border, shadow, and padding
 */
const InfoCard = ({ title, children, className = '' }) => {
  return (
    <div 
      className={`bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow ${className}`}
    >
      {/* Card Title */}
      {title && (
        <div className="px-6 pt-5 pb-3 border-b border-slate-100">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {title}
          </h3>
        </div>
      )}
      
      {/* Card Content */}
      <div className="p-6">
        {children}
      </div>
    </div>
  );
};

export default InfoCard;
