import React from 'react';
/**
 * ProgressBar Component
 * Displays vaccination progress with visual bar and percentage
 * Supports smooth animations and accessibility attributes
 */
const ProgressBar = ({ value = 0, total, className = '' }) => {
  // Ensure value is between 0 and 100
  const percentage = Math.min(100, Math.max(0, value));
  
  return (
    <div className={`w-full ${className}`}>
      {/* Progress Bar Container */}
      <div 
        className="relative w-full h-3 bg-slate-200 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label={`Vaccination progress: ${percentage}% complete`}
      >
        {/* Filled Progress */}
        <div
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      {/* Optional: Display segments if total is provided */}
      {total && total > 1 && (
        <div className="flex justify-between mt-1">
          {Array.from({ length: total }).map((_, index) => {
            const segmentPercentage = ((index + 1) / total) * 100;
            const isCompleted = percentage >= segmentPercentage;
            
            return (
              <div
                key={index}
                className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                  isCompleted ? 'bg-blue-600' : 'bg-slate-300'
                }`}
                aria-hidden="true"
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProgressBar;
