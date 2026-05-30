import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Phone, Syringe, MessageSquare } from 'lucide-react';
import Avatar from './Avatar';

/**
 * InfantCard Component
 * Rich information card for displaying infant details in KPI modals
 * Supports category-specific displays (CPAB, Zero-Dose, Under-Immunized)
 */
const InfantCard = ({ 
  infant, 
  category,
  isSelected = false,
  onSelect,
  onSendSMS,
  onRecordVaccination
}) => {
  const navigate = useNavigate();

  const handleViewRecord = () => {
    navigate(`/clinical/infants/${infant.id}`);
  };

  // Get status badge color
  const getStatusColor = (status) => {
    const statusMap = {
      'COMPLETE': 'bg-emerald-100 text-emerald-700 border-emerald-200',
      'APPROVED': 'bg-emerald-100 text-emerald-700 border-emerald-200',
      'PENDING': 'bg-amber-100 text-amber-700 border-amber-200',
      'PROVISIONAL': 'bg-blue-100 text-blue-700 border-blue-200',
      'INCOMPLETE': 'bg-slate-100 text-slate-700 border-slate-200'
    };
    return statusMap[status] || 'bg-slate-100 text-slate-700 border-slate-200';
  };

  // Get urgency border for under-immunized
  const getUrgencyBorder = () => {
    if (category !== 'under_immunized' || !infant.days_overdue) return '';
    
    if (infant.days_overdue > 30) return 'border-l-4 border-l-red-500';
    if (infant.days_overdue >= 7) return 'border-l-4 border-l-amber-500';
    return 'border-l-4 border-l-slate-300';
  };

  // Format next due text
  const getNextDueText = () => {
    if (!infant.next_due_vaccine) return null;
    
    if (infant.days_overdue && infant.days_overdue > 0) {
      return (
        <span className="text-red-600 font-semibold text-sm">
          âš ï¸ {infant.next_due_vaccine} - {infant.days_overdue} days overdue
        </span>
      );
    }
    
    if (infant.next_due_date) {
      return (
        <span className="text-slate-600 text-sm">
          Next: {infant.next_due_vaccine} - {new Date(infant.next_due_date).toLocaleDateString()}
        </span>
      );
    }
    
    return null;
  };

  return (
    <div 
      className={`group bg-gradient-to-br from-white to-slate-50/30 border border-slate-200 rounded-xl p-5 hover:bg-white hover:shadow-lg hover:shadow-slate-200/50 hover:-translate-y-1 transition-all duration-300 ${getUrgencyBorder()} ${
        isSelected ? 'ring-2 ring-blue-500 shadow-lg' : ''
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Checkbox with enhanced styling */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(infant.id)}
          className="mt-1 w-5 h-5 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
          aria-label={`Select ${infant.name}`}
        />

        {/* Avatar with hover effect */}
        <div className="transition-transform duration-300 group-hover:scale-110">
          <Avatar name={infant.name} size="medium" />
        </div>

        {/* Info Section */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h4 className="text-lg font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors duration-300">
                {infant.name}
              </h4>
              <p className="text-sm text-slate-500 group-hover:text-slate-600 transition-colors duration-300">
                {infant.reference_id} â€¢ {infant.sex} â€¢ {infant.age_months}mo
              </p>
            </div>
            
            {/* Status Badge with enhanced styling */}
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold border shadow-sm transition-all duration-300 group-hover:scale-105 ${getStatusColor(infant.status)}`}>
              {infant.status}
            </span>
          </div>

          {/* Location and Contact with icons */}
          <div className="space-y-1.5 mb-3">
            <p className="text-sm text-slate-600 flex items-center gap-2 group-hover:text-slate-700 transition-colors">
              <MapPin className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
              <span className="font-medium">{infant.exact_address || infant.barangay || 'Location not recorded'}</span>
            </p>
            {infant.caregiver_phone && (
              <p className="text-sm text-slate-600 flex items-center gap-2 group-hover:text-slate-700 transition-colors">
                <Phone className="w-4 h-4 text-slate-400 group-hover:text-green-500 transition-colors" />
                <span className="font-medium">{infant.caregiver_phone}</span>
              </p>
            )}
          </div>

          {/* Next Due / Category-Specific Info with enhanced styling */}
          <div className="mb-4">
            {category === 'cpab' && (
              <div className="bg-teal-50 border border-teal-100 rounded-lg p-3 transition-all duration-300 group-hover:bg-teal-100/50">
                <p className="text-sm text-teal-800 font-medium">
                  <span className="font-bold">TT2:</span> {infant.tt2_date ? new Date(infant.tt2_date).toLocaleDateString() : 'N/A'} â€¢ 
                  <span className="font-bold ml-2">TT3:</span> {infant.tt3_date ? new Date(infant.tt3_date).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            )}
            
            {category === 'zero_dose' && infant.zero_dose_days && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 transition-all duration-300 group-hover:bg-red-100/50 animate-pulse">
                <p className="text-sm text-red-700 font-bold flex items-center gap-2">
                  <span className="text-lg">âš ï¸</span>
                  Zero-dose for {infant.zero_dose_days} days
                </p>
              </div>
            )}
            
            {category === 'under_immunized' && infant.missing_vaccines && infant.missing_vaccines.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 transition-all duration-300 group-hover:bg-amber-100/50">
                <p className="text-sm text-amber-800">
                  <span className="font-bold">Missing:</span> {infant.missing_vaccines.join(', ')}
                </p>
              </div>
            )}
            
            {!['cpab', 'zero_dose', 'under_immunized'].includes(category) && getNextDueText()}
          </div>

          {/* Action Buttons with enhanced hover effects */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleViewRecord}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm font-semibold hover:from-blue-700 hover:to-blue-800 hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-1"
            >
              View Record
              <span className="transition-transform duration-300 group-hover:translate-x-1">â†’</span>
            </button>
            <button
              onClick={() => onSendSMS && onSendSMS(infant)}
              className="px-4 py-2 border-2 border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2"
            >
              <MessageSquare className="w-4 h-4 transition-transform duration-300 hover:scale-110" />
              Send SMS
            </button>
            <button
              onClick={() => onRecordVaccination && onRecordVaccination(infant)}
              className="px-4 py-2 border-2 border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2"
            >
              <Syringe className="w-4 h-4 transition-transform duration-300 hover:rotate-12" />
              Record
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfantCard;
