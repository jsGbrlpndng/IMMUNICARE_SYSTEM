import React from 'react';
import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Search, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../services/apiClient';
import { formatFullNameFromObject } from '../utils/formatFullName';

// Philippine NIP Vaccine List (14 vaccines)
const PHILIPPINE_NIP_VACCINES = [
  { code: 'BCG', name: 'BCG (Bacillus Calmette-GuÃ©rin)', group: 'At Birth', doseNumber: 1 },
  { code: 'HEPB', name: 'Hepatitis B Birth Dose', group: 'At Birth', doseNumber: 1 },
  { code: 'PENTA-1', name: 'Pentavalent Dose 1', group: '6 Weeks', doseNumber: 1 },
  { code: 'OPV-1', name: 'OPV Dose 1 (Oral Polio Vaccine)', group: '6 Weeks', doseNumber: 1 },
  { code: 'PCV-1', name: 'PCV Dose 1 (Pneumococcal Conjugate)', group: '6 Weeks', doseNumber: 1 },
  { code: 'PENTA-2', name: 'Pentavalent Dose 2', group: '10 Weeks', doseNumber: 2 },
  { code: 'OPV-2', name: 'OPV Dose 2 (Oral Polio Vaccine)', group: '10 Weeks', doseNumber: 2 },
  { code: 'PCV-2', name: 'PCV Dose 2 (Pneumococcal Conjugate)', group: '10 Weeks', doseNumber: 2 },
  { code: 'PENTA-3', name: 'Pentavalent Dose 3', group: '14 Weeks', doseNumber: 3 },
  { code: 'OPV-3', name: 'OPV Dose 3 (Oral Polio Vaccine)', group: '14 Weeks', doseNumber: 3 },
  { code: 'PCV-3', name: 'PCV Dose 3 (Pneumococcal Conjugate)', group: '14 Weeks', doseNumber: 3 },
  { code: 'IPV-1', name: 'IPV 1 (Inactivated Polio Vaccine)', group: '14 Weeks', doseNumber: 1 },
  { code: 'IPV-2', name: 'IPV 2 (Inactivated Polio Vaccine)', group: '9-12 Months', doseNumber: 2 },
  { code: 'MCV-1', name: 'Measles 1 (MCV1)', group: '9-12 Months', doseNumber: 1 },
  { code: 'MCV-2', name: 'Measles 2 (MCV2)', group: '9-12 Months', doseNumber: 2 }
];

// Group vaccines by schedule timing
const VACCINE_GROUPS = {
  'At Birth': PHILIPPINE_NIP_VACCINES.filter(v => v.group === 'At Birth'),
  '6 Weeks': PHILIPPINE_NIP_VACCINES.filter(v => v.group === '6 Weeks'),
  '10 Weeks': PHILIPPINE_NIP_VACCINES.filter(v => v.group === '10 Weeks'),
  '14 Weeks': PHILIPPINE_NIP_VACCINES.filter(v => v.group === '14 Weeks'),
  '9-12 Months': PHILIPPINE_NIP_VACCINES.filter(v => v.group === '9-12 Months')
};

const DailyVaccinationRecorderModal = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedInfantIds, setSelectedInfantIds] = useState([]);
  const [selectedVaccine, setSelectedVaccine] = useState('');
  const [vaccinationDate, setVaccinationDate] = useState(new Date().toISOString().split('T')[0]);
  const [batchNumber, setBatchNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Infant selection state
  const [infants, setInfants] = useState([]);
  const [loadingInfants, setLoadingInfants] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  // Debounce search query for performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch infants when modal opens
  useEffect(() => {
    if (isOpen && user) {
      fetchInfants();
    }
  }, [isOpen, user]);

  const fetchInfants = async () => {
    if (!user) return;
    
    setLoadingInfants(true);
    try {
      const response = await apiClient.get('/infants?status=APPROVED');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success && data.infants) {
        setInfants(data.infants);
      } else {
        setInfants([]);
      }
    } catch (error) {
      console.error('Error fetching infants:', error);
      setInfants([]);
    } finally {
      setLoadingInfants(false);
    }
  };

  // Filter infants based on debounced search query
  const filteredInfants = infants.filter(infant => {
    if (!debouncedSearchQuery) return true;
    const searchLower = debouncedSearchQuery.toLowerCase();
    const fullName = formatFullNameFromObject(infant).toLowerCase();
    const referenceId = (infant.reference_id || '').toLowerCase();
    const motherName = (infant.mothers_maiden_name || infant.mother_name || '').toLowerCase();
    
    return fullName.includes(searchLower) || 
           referenceId.includes(searchLower) || 
           motherName.includes(searchLower);
  });

  const handleInfantToggle = (infantId) => {
    setSelectedInfantIds(prev => {
      if (prev.includes(infantId)) {
        return prev.filter(id => id !== infantId);
      } else {
        return [...prev, infantId];
      }
    });
  };

  const calculateAge = (dob) => {
    if (!dob) return 'N/A';
    const birthDate = new Date(dob);
    const today = new Date();
    const ageInMonths = Math.floor((today - birthDate) / (1000 * 60 * 60 * 24 * 30.44));
    
    if (ageInMonths < 1) {
      const ageInDays = Math.floor((today - birthDate) / (1000 * 60 * 60 * 24));
      return `${ageInDays} day${ageInDays !== 1 ? 's' : ''}`;
    } else if (ageInMonths < 12) {
      return `${ageInMonths} month${ageInMonths !== 1 ? 's' : ''}`;
    } else {
      const years = Math.floor(ageInMonths / 12);
      const months = ageInMonths % 12;
      return `${years}y ${months}m`;
    }
  };

  const handleSubmit = async () => {
    if (!user) return;

    setSubmitting(true);
    setErrors({});

    const selectedVaccineData = PHILIPPINE_NIP_VACCINES.find(v => v.code === selectedVaccine);
    if (!selectedVaccineData) {
      setErrors({ submit: 'Invalid vaccine selected' });
      setSubmitting(false);
      return;
    }

    const successfulRecords = [];
    const failedRecords = [];

    // Process each infant
    for (const infantId of selectedInfantIds) {
      const infant = infants.find(i => i.id === infantId);
      if (!infant) {
        failedRecords.push({
          infantId,
          infantName: 'Unknown',
          error: 'Infant not found'
        });
        continue;
      }

      try {
        const vaccinationData = {
          infant_id: infantId,
          vaccine_name: selectedVaccineData.name,
          vaccine_code: selectedVaccineData.code,
          dose_number: selectedVaccineData.doseNumber,
          batch_number: batchNumber.trim().toUpperCase(),
          site_of_injection: 'Left upper arm', // Default value
          vaccinator_id: user.id,
          vaccinator_name: user.name || `${user.first_name} ${user.last_name}`,
          administered_date: new Date(vaccinationDate).toISOString(),
          notes: notes.trim() || null,
          recorded_by: user.id
        };

        const response = await apiClient.post('/vaccinations', vaccinationData);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || errorData.details || 'Failed to save vaccination');
        }

        const data = await response.json();
        successfulRecords.push({
          infantId,
          infantName: formatFullNameFromObject(infant),
          vaccinationId: data.vaccination_id
        });
      } catch (error) {
        console.error(`Error recording vaccination for infant ${infantId}:`, error);
        failedRecords.push({
          infantId,
          infantName: formatFullNameFromObject(infant),
          error: error.message
        });
      }
    }

    setSubmitting(false);

    // Handle results
    if (failedRecords.length === 0) {
      // All successful
      if (onSuccess) {
        onSuccess({
          count: successfulRecords.length,
          success: successfulRecords,
          failed: []
        });
      }
      handleCancel(); // Close modal and reset
    } else if (successfulRecords.length === 0) {
      // All failed
      setErrors({
        submit: `Failed to save all ${failedRecords.length} vaccination records. Please try again.`
      });
    } else {
      // Partial success
      if (onSuccess) {
        onSuccess({
          count: successfulRecords.length,
          success: successfulRecords,
          failed: failedRecords
        });
      }
      // Show error but don't close modal
      setErrors({
        submit: `Saved ${successfulRecords.length} records, but ${failedRecords.length} failed. Failed infants: ${failedRecords.map(f => f.infantName).join(', ')}`
      });
    }
  };

  if (!isOpen) return null;

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 4));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleCancel = () => {
    // Reset all state
    setCurrentStep(1);
    setSelectedInfantIds([]);
    setSelectedVaccine('');
    setVaccinationDate(new Date().toISOString().split('T')[0]);
    setBatchNumber('');
    setNotes('');
    setErrors({});
    setSubmitting(false);
    onClose();
  };

  const validateStep = (step) => {
    const newErrors = {};

    switch (step) {
      case 1:
        if (selectedInfantIds.length === 0) {
          newErrors.infants = 'Please select at least one infant';
        }
        break;
      case 2:
        if (!selectedVaccine) {
          newErrors.vaccine = 'Please select a vaccine';
        }
        break;
      case 3:
        if (!vaccinationDate) {
          newErrors.date = 'Date is required';
        } else if (new Date(vaccinationDate) > new Date()) {
          newErrors.date = 'Date cannot be in the future';
        }
        if (!batchNumber || batchNumber.trim().length < 3) {
          newErrors.batchNumber = 'Batch number must be at least 3 characters';
        } else if (!/^[A-Z0-9-_]+$/i.test(batchNumber.trim())) {
          newErrors.batchNumber = 'Batch number can only contain letters, numbers, hyphens, and underscores';
        }
        if (notes && notes.length > 500) {
          newErrors.notes = 'Notes cannot exceed 500 characters';
        }
        break;
      default:
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1:
        return 'Select Infants';
      case 2:
        return 'Select Vaccine';
      case 3:
        return 'Record Details';
      case 4:
        return 'Confirm & Save';
      default:
        return '';
    }
  };

  const isNextDisabled = () => {
    switch (currentStep) {
      case 1:
        return selectedInfantIds.length === 0;
      case 2:
        return !selectedVaccine;
      case 3:
        return !vaccinationDate || !batchNumber || batchNumber.trim().length < 3;
      default:
        return false;
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-[9999] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-200 bg-gradient-to-r from-pink-50 to-slate-50 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-slate-900">ðŸ“‹ Record Daily Vaccinations</h3>
              <p className="text-sm text-slate-600 mt-1">
                Step {currentStep} of 4: {getStepTitle()}
              </p>
            </div>
            <button
              onClick={handleCancel}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-6 h-6 text-slate-400" />
            </button>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center space-x-2 mt-6">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="flex items-center flex-1">
                <div
                  className={`h-2 rounded-full flex-1 transition-all ${
                    step <= currentStep ? 'bg-pink-500' : 'bg-slate-200'
                  }`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {currentStep === 1 && (
            <div className="space-y-4">
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="ðŸ” Search by infant name, ID, or mother's name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all outline-none"
                />
              </div>

              {/* Infant List */}
              {loadingInfants ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="w-8 h-8 border-3 border-slate-200 border-t-pink-500 rounded-full animate-spin"></div>
                  <p className="text-sm font-bold text-slate-400">Loading infants...</p>
                </div>
              ) : filteredInfants.length === 0 ? (
                <div className="text-center py-12">
                  <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600 font-medium">
                    {searchQuery ? 'No infants found matching your search' : 'No infants available'}
                  </p>
                </div>
              ) : (
                <div className="border rounded-xl divide-y divide-slate-100 max-h-96 overflow-y-auto">
                  {filteredInfants.map((infant) => (
                    <label
                      key={infant.id}
                      className="flex items-center gap-3 p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedInfantIds.includes(infant.id)}
                        onChange={() => handleInfantToggle(infant.id)}
                        className="w-4 h-4 text-pink-600 border-slate-300 rounded focus:ring-pink-500"
                      />
                      <div className="w-10 h-10 bg-gradient-to-br from-pink-100 to-purple-100 rounded-lg flex items-center justify-center font-bold text-pink-600 text-sm flex-shrink-0">
                        {infant.first_name?.[0]}{infant.last_name?.[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-900 truncate">
                          {formatFullNameFromObject(infant)}
                        </p>
                        <p className="text-sm text-slate-500">
                          {infant.reference_id} â€¢ {calculateAge(infant.dob)} â€¢ {infant.sex === 'M' ? 'Male' : 'Female'}
                        </p>
                            {(infant.mothers_maiden_name || infant.mother_name) && (
                          <p className="text-xs text-slate-400 mt-0.5">
                                Mother: {infant.mothers_maiden_name || infant.mother_name}
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* Selected Count */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <p className="text-sm text-slate-600 font-medium">
                  {selectedInfantIds.length} infant{selectedInfantIds.length !== 1 ? 's' : ''} selected
                </p>
                {errors.infants && (
                  <p className="text-sm text-red-600 font-medium">{errors.infants}</p>
                )}
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <p className="text-sm text-slate-600 font-medium">
                Select the vaccine that was administered to all selected infants
              </p>

              {Object.entries(VACCINE_GROUPS).map(([groupName, vaccines]) => (
                <div key={groupName} className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {groupName}
                  </h4>
                  <div className="grid grid-cols-1 gap-3">
                    {vaccines.map((vaccine) => (
                      <label
                        key={vaccine.code}
                        className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                          selectedVaccine === vaccine.code
                            ? 'border-pink-500 bg-pink-50'
                            : 'border-slate-200 hover:border-pink-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="vaccine"
                          value={vaccine.code}
                          checked={selectedVaccine === vaccine.code}
                          onChange={(e) => setSelectedVaccine(e.target.value)}
                          className="w-4 h-4 text-pink-600 border-slate-300 focus:ring-pink-500"
                        />
                        <div className="flex-1">
                          <p className="font-bold text-slate-900">{vaccine.name}</p>
                          <p className="text-sm text-slate-500">
                            Code: {vaccine.code} â€¢ Given at: {vaccine.group}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              {errors.vaccine && (
                <p className="text-sm text-red-600 font-medium">{errors.vaccine}</p>
              )}
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <p className="text-sm text-slate-600 font-medium">
                Enter vaccination details that will apply to all selected infants
              </p>

              {/* Date Administered */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Date Administered <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={vaccinationDate}
                  onChange={(e) => setVaccinationDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className={`w-full px-4 py-3 border rounded-xl focus:ring-4 transition-all outline-none ${
                    errors.date
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10'
                      : 'border-slate-200 focus:border-pink-500 focus:ring-pink-500/10'
                  }`}
                />
                {errors.date && (
                  <p className="text-sm text-red-600 font-medium mt-1">{errors.date}</p>
                )}
              </div>

              {/* Batch Number */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Batch/Lot Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., BCG-2026-001234"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  className={`w-full px-4 py-3 border rounded-xl focus:ring-4 transition-all outline-none ${
                    errors.batchNumber
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10'
                      : 'border-slate-200 focus:border-pink-500 focus:ring-pink-500/10'
                  }`}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Minimum 3 characters. Letters, numbers, hyphens, and underscores only.
                </p>
                {errors.batchNumber && (
                  <p className="text-sm text-red-600 font-medium mt-1">{errors.batchNumber}</p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  placeholder="Any additional notes about the vaccination session..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className={`w-full px-4 py-3 border rounded-xl focus:ring-4 transition-all outline-none resize-none ${
                    errors.notes
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10'
                      : 'border-slate-200 focus:border-pink-500 focus:ring-pink-500/10'
                  }`}
                />
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-slate-500">
                    Maximum 500 characters
                  </p>
                  <p className="text-xs text-slate-500">
                    {notes.length}/500
                  </p>
                </div>
                {errors.notes && (
                  <p className="text-sm text-red-600 font-medium mt-1">{errors.notes}</p>
                )}
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6">
              {/* Summary Card */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                <h3 className="font-bold text-blue-900 mb-4 flex items-center">
                  ðŸ“‹ Vaccination Summary
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-blue-700 font-medium">Vaccine:</span>
                    <span className="text-blue-900 font-bold">
                      {PHILIPPINE_NIP_VACCINES.find(v => v.code === selectedVaccine)?.name || selectedVaccine}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-700 font-medium">Date:</span>
                    <span className="text-blue-900 font-bold">
                      {new Date(vaccinationDate).toLocaleDateString('en-PH', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-700 font-medium">Batch Number:</span>
                    <span className="text-blue-900 font-bold">{batchNumber.trim().toUpperCase()}</span>
                  </div>
                  {notes && (
                    <div className="pt-2 border-t border-blue-200">
                      <span className="text-blue-700 font-medium">Notes:</span>
                      <p className="text-blue-900 mt-1">{notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Infants List */}
              <div>
                <h4 className="font-bold text-slate-900 mb-3">
                  Selected Infants ({selectedInfantIds.length})
                </h4>
                <div className="border rounded-xl divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {selectedInfantIds.map((infantId) => {
                    const infant = infants.find(i => i.id === infantId);
                    if (!infant) return null;
                    
                    return (
                      <div key={infantId} className="flex items-center gap-3 p-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-pink-100 to-purple-100 rounded-lg flex items-center justify-center font-bold text-pink-600 text-xs flex-shrink-0">
                          {infant.first_name?.[0]}{infant.last_name?.[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-900 text-sm truncate">
                            {formatFullNameFromObject(infant)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {infant.reference_id}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Warning Message */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <p className="text-sm text-yellow-800 flex items-start">
                  <span className="mr-2">âš ï¸</span>
                  <span>
                    This will create <strong>{selectedInfantIds.length} vaccination record{selectedInfantIds.length !== 1 ? 's' : ''}</strong>.
                    The infant profiles will be updated immediately and cannot be undone.
                  </span>
                </p>
              </div>

              {/* Error Message */}
              {errors.submit && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-sm text-red-800 font-medium">{errors.submit}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-slate-200 bg-slate-50 flex-shrink-0">
          <div className="flex items-center justify-between">
            <button
              onClick={handleBack}
              disabled={currentStep === 1}
              className="flex items-center space-x-2 px-6 py-3 text-slate-600 hover:text-slate-800 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
              <span>Back</span>
            </button>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleCancel}
                className="px-6 py-3 text-slate-600 hover:text-slate-800 font-semibold transition-colors"
              >
                Cancel
              </button>

              {currentStep < 4 ? (
                <button
                  onClick={handleNext}
                  disabled={isNextDisabled()}
                  className="flex items-center space-x-2 bg-pink-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>Next</span>
                  <ChevronRight className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="bg-green-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'âœ… Save All Records'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailyVaccinationRecorderModal;
