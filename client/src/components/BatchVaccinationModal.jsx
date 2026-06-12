import React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { X, Syringe, CheckCircle, AlertCircle, Users, Search } from 'lucide-react';
import apiClient from '../services/apiClient';
import Avatar from './Avatar';

/**
 * BatchVaccinationModal Component
 * Allows health workers to vaccinate multiple infants at once with the same vaccine
 * 
 * Features:
 * - Multi-infant selection with search by name, barangay, age range
 * - All 14 NIP vaccines dropdown
 * - Date picker (defaults to today)
 * - Batch/lot number input
 * - Optional remarks (applies to all)
 * - Confirmation dialog
 * - Completion summary with error handling for partial failures
 */

// 14 NIP Vaccines as per Philippine DOH National Immunization Program
const NIP_VACCINES = [
  { code: 'BCG', name: 'BCG (Bacillus Calmette-GuÃ©rin)' },
  { code: 'HEPB', name: 'Hepatitis B Birth Dose' },
  { code: 'PENTA-1', name: 'Pentavalent 1' },
  { code: 'PENTA-2', name: 'Pentavalent 2' },
  { code: 'PENTA-3', name: 'Pentavalent 3' },
  { code: 'OPV-1', name: 'OPV 1 (Oral Polio Vaccine)' },
  { code: 'OPV-2', name: 'OPV 2 (Oral Polio Vaccine)' },
  { code: 'OPV-3', name: 'OPV 3 (Oral Polio Vaccine)' },
  { code: 'PCV-1', name: 'PCV 1 (Pneumococcal Conjugate Vaccine)' },
  { code: 'PCV-2', name: 'PCV 2 (Pneumococcal Conjugate Vaccine)' },
  { code: 'PCV-3', name: 'PCV 3 (Pneumococcal Conjugate Vaccine)' },
  { code: 'IPV-1', name: 'IPV 1 (Inactivated Polio Vaccine)' },
  { code: 'IPV-2', name: 'IPV 2 (Inactivated Polio Vaccine)' },
  { code: 'MCV-1', name: 'Measles 1 (MCV1)' },
  { code: 'MCV-2', name: 'Measles 2 (MCV2)' }
];

const BatchVaccinationModal = ({ isOpen, onClose, availableInfants = [], onSuccess }) => {
  // Form state
  const [vaccineType, setVaccineType] = useState('');
  const [vaccinationDate, setVaccinationDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [batchNumber, setBatchNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isExternal, setIsExternal] = useState(false);
  
  // Selection state
  const [searchTerm, setSearchTerm] = useState('');
  const [barangayFilter, setBarangayFilter] = useState('All');
  const [ageRangeFilter, setAgeRangeFilter] = useState('All');
  const [selectedInfantIds, setSelectedInfantIds] = useState([]);
  
  // UI state
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [results, setResults] = useState({ success: [], failed: [] });
  const [errors, setErrors] = useState({});

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setVaccineType('');
      setVaccinationDate(new Date().toISOString().slice(0, 10));
      setBatchNumber('');
      setRemarks('');
      setIsExternal(false);
      setSearchTerm('');
      setBarangayFilter('All');
      setAgeRangeFilter('All');
      setSelectedInfantIds([]);
      setShowConfirmation(false);
      setShowSummary(false);
      setResults({ success: [], failed: [] });
      setErrors({});
    }
  }, [isOpen]);

  // Get unique barangays
  const barangayOptions = useMemo(() => {
    const unique = [...new Set(availableInfants.map(i => i.barangay).filter(Boolean))];
    return unique.sort();
  }, [availableInfants]);

  // Filter infants
  const filteredInfants = useMemo(() => {
    let result = availableInfants;

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      result = result.filter(infant =>
        infant.name?.toLowerCase().includes(searchLower) ||
        infant.reference_id?.toLowerCase().includes(searchLower)
      );
    }

    // Barangay filter
    if (barangayFilter !== 'All') {
      result = result.filter(i => i.barangay === barangayFilter);
    }

    // Age range filter
    if (ageRangeFilter !== 'All') {
      const [min, max] = ageRangeFilter.split('-').map(Number);
      result = result.filter(i => i.age_months >= min && i.age_months < max);
    }

    return result;
  }, [availableInfants, searchTerm, barangayFilter, ageRangeFilter]);

  // Get selected infants
  const selectedInfants = useMemo(() => {
    return filteredInfants.filter(i => selectedInfantIds.includes(i.id));
  }, [filteredInfants, selectedInfantIds]);

  // Validation
  const validateForm = () => {
    const newErrors = {};

    if (!vaccineType) {
      newErrors.vaccineType = 'Please select a vaccine';
    }

    if (!vaccinationDate) {
      newErrors.vaccinationDate = 'Please select a date';
    } else {
      const selectedDate = new Date(vaccinationDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (selectedDate > today) {
        newErrors.vaccinationDate = 'Cannot record future vaccination dates';
      }
    }

    if (!batchNumber.trim()) {
      newErrors.batchNumber = 'Batch/lot number is required';
    }

    if (selectedInfantIds.length === 0) {
      newErrors.selection = 'Please select at least one infant';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle selection
  const handleToggleInfant = (infantId) => {
    setSelectedInfantIds(prev =>
      prev.includes(infantId)
        ? prev.filter(id => id !== infantId)
        : [...prev, infantId]
    );
  };

  const handleSelectAll = () => {
    if (selectedInfantIds.length === filteredInfants.length) {
      setSelectedInfantIds([]);
    } else {
      setSelectedInfantIds(filteredInfants.map(i => i.id));
    }
  };

  // Handle apply to all
  const handleApplyToAll = () => {
    if (!validateForm()) {
      return;
    }
    setShowConfirmation(true);
  };

  // Handle confirmation
  const handleConfirm = async () => {
    setShowConfirmation(false);
    setSubmitting(true);

    const successResults = [];
    const failedResults = [];

    // Get vaccine name from code
    const selectedVaccine = NIP_VACCINES.find(v => v.code === vaccineType);
    const vaccineName = selectedVaccine?.name || vaccineType;

    // Get current user info (from session/context)
    // TODO: Replace with actual user context
    const currentUser = {
      id: 'user-001',
      name: 'Health Worker'
    };

    // Process each infant
    for (const infant of selectedInfants) {
      try {
        const response = await apiClient.post('/vaccinations', {
          infant_id: infant.id,
          vaccine_name: vaccineName,
          vaccine_code: selectedVaccineData.code,
          dose_number: selectedVaccineData.doseNumber,
          batch_number: batchNumber,
          site_of_injection: 'Left upper arm', // Default for batch
          vaccinator_id: currentUser.id,
          vaccinator_name: currentUser.name,
          administered_date: new Date(vaccinationDate).toISOString(),
          notes: remarks || `Batch vaccination: ${vaccineName}`,
          is_external: isExternal
        });

        if (response.ok) {
          successResults.push({
            infantId: infant.id,
            infantName: infant.name,
            referenceId: infant.reference_id
          });
        } else {
          const errorData = await response.json();
          failedResults.push({
            infantId: infant.id,
            infantName: infant.name,
            referenceId: infant.reference_id,
            error: errorData.details || errorData.error || 'Unknown error'
          });
        }
      } catch (error) {
        failedResults.push({
          infantId: infant.id,
          infantName: infant.name,
          referenceId: infant.reference_id,
          error: error.message || 'Network error'
        });
      }
    }

    setResults({ success: successResults, failed: failedResults });
    setSubmitting(false);
    setShowSummary(true);
  };

  // Handle close summary
  const handleCloseSummary = () => {
    setShowSummary(false);
    if (onSuccess) {
      onSuccess(results);
    }
    onClose();
  };

  // Handle view updated records
  const handleViewUpdatedRecords = () => {
    // Navigate to infant list
    // TODO: Implement navigation
    handleCloseSummary();
  };

  if (!isOpen) return null;

  // Confirmation Dialog
  if (showConfirmation) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-10 h-10 text-amber-600" />
          </div>
          <h3 className="text-2xl font-bold text-slate-900 mb-2 text-center">Confirm Batch Vaccination</h3>
          <p className="text-slate-600 mb-6 text-center">
            You are about to record <strong>{selectedInfants.length} vaccinations</strong> for:
          </p>
          <div className="bg-slate-50 rounded-xl p-4 mb-6 space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-600">Vaccine:</span>
              <span className="font-semibold text-slate-900">
                {NIP_VACCINES.find(v => v.code === vaccineType)?.name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Date:</span>
              <span className="font-semibold text-slate-900">
                {new Date(vaccinationDate).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Batch Number:</span>
              <span className="font-semibold text-slate-900">{batchNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Infants:</span>
              <span className="font-semibold text-slate-900">{selectedInfants.length}</span>
            </div>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setShowConfirmation(false)}
              className="flex-1 px-6 py-3 text-slate-600 hover:text-slate-800 font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              Confirm & Apply
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Summary Dialog
  if (showSummary) {
    const totalProcessed = results.success.length + results.failed.length;
    const hasFailures = results.failed.length > 0;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-2xl w-full shadow-xl max-h-[90vh] overflow-y-auto">
          <div className={`w-16 h-16 ${hasFailures ? 'bg-amber-100' : 'bg-emerald-100'} rounded-full flex items-center justify-center mx-auto mb-4`}>
            {hasFailures ? (
              <AlertCircle className="w-10 h-10 text-amber-600" />
            ) : (
              <CheckCircle className="w-10 h-10 text-emerald-600" />
            )}
          </div>
          <h3 className="text-2xl font-bold text-slate-900 mb-2 text-center">
            {hasFailures ? 'Batch Vaccination Completed with Errors' : 'Batch Vaccination Complete!'}
          </h3>
          <p className="text-slate-600 mb-6 text-center">
            <strong>{results.success.length} of {totalProcessed} infants</strong> were successfully vaccinated with{' '}
            <strong>{NIP_VACCINES.find(v => v.code === vaccineType)?.name}</strong>
          </p>

          {/* Success List */}
          {results.success.length > 0 && (
            <div className="mb-6">
              <h4 className="font-semibold text-emerald-900 mb-3 flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Successfully Vaccinated ({results.success.length})
              </h4>
              <div className="bg-emerald-50 rounded-xl p-4 max-h-48 overflow-y-auto space-y-2">
                {results.success.map((result) => (
                  <div key={result.infantId} className="text-sm text-emerald-900">
                    âœ“ {result.infantName} ({result.referenceId})
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Failed List */}
          {results.failed.length > 0 && (
            <div className="mb-6">
              <h4 className="font-semibold text-red-900 mb-3 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Failed ({results.failed.length})
              </h4>
              <div className="bg-red-50 rounded-xl p-4 max-h-48 overflow-y-auto space-y-2">
                {results.failed.map((result) => (
                  <div key={result.infantId} className="text-sm">
                    <div className="font-semibold text-red-900">
                      âœ— {result.infantName} ({result.referenceId})
                    </div>
                    <div className="text-red-700 ml-4">{result.error}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex space-x-3">
            <button
              onClick={handleCloseSummary}
              className="flex-1 px-6 py-3 text-slate-600 hover:text-slate-800 font-semibold transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleViewUpdatedRecords}
              className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              View Updated Records â†’
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Submitting State
  if (submitting) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <h3 className="text-2xl font-bold text-slate-900 mb-2">Processing Vaccinations...</h3>
          <p className="text-slate-600">
            Recording vaccinations for {selectedInfants.length} infants. Please wait...
          </p>
        </div>
      </div>
    );
  }

  // Main Modal
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-50 to-slate-50 p-6 border-b border-slate-200 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Syringe className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Batch Vaccination Entry</h2>
                <p className="text-sm text-slate-600">
                  Vaccinate multiple infants at once with the same vaccine
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-6 h-6 text-slate-400" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Vaccination Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Vaccination Details</h3>

              {/* Vaccine Type */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Vaccine Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={vaccineType}
                  onChange={(e) => setVaccineType(e.target.value)}
                  className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all appearance-none bg-white ${
                    errors.vaccineType ? 'border-red-300 bg-red-50' : 'border-slate-200'
                  }`}
                >
                  <option value="">Select vaccine...</option>
                  {NIP_VACCINES.map((vaccine) => (
                    <option key={vaccine.code} value={vaccine.code}>
                      {vaccine.name}
                    </option>
                  ))}
                </select>
                {errors.vaccineType && (
                  <p className="text-sm text-red-600 mt-1">{errors.vaccineType}</p>
                )}
              </div>

              {/* Vaccination Date */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Vaccination Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={vaccinationDate}
                  onChange={(e) => setVaccinationDate(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all ${
                    errors.vaccinationDate ? 'border-red-300 bg-red-50' : 'border-slate-200'
                  }`}
                />
                {errors.vaccinationDate && (
                  <p className="text-sm text-red-600 mt-1">{errors.vaccinationDate}</p>
                )}
              </div>

              {/* Batch/Lot Number */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Batch/Lot Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  placeholder="e.g., BCG-2024-001"
                  className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all ${
                    errors.batchNumber ? 'border-red-300 bg-red-50' : 'border-slate-200'
                  }`}
                />
                {errors.batchNumber && (
                  <p className="text-sm text-red-600 mt-1">{errors.batchNumber}</p>
                )}
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Remarks (Optional)
                </label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows="3"
                  placeholder="Optional notes that will apply to all selected infants..."
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none"
                />
              </div>

              <div className="rounded-sm border border-amber-200 bg-amber-50/60 p-4">
                <label className="flex items-start gap-3 text-sm font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={isExternal}
                    onChange={(e) => setIsExternal(e.target.checked)}
                    className="mt-0.5 h-5 w-5 rounded-sm border-slate-300 text-amber-700 focus:ring-amber-700"
                  />
                  <span>
                    <span className="block text-[10px] font-black uppercase tracking-widest text-amber-800">Administered Elsewhere</span>
                    <span className="mt-1 block text-xs font-bold leading-relaxed text-amber-900">
                      Use this for historical doses given at another clinic. It updates the child's schedule but is excluded from M1 accomplishment reporting.
                    </span>
                  </span>
                </label>
              </div>

              {/* Selected Count */}
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-blue-900">
                      {selectedInfantIds.length} infant{selectedInfantIds.length !== 1 ? 's' : ''} selected
                    </span>
                  </div>
                  {selectedInfantIds.length > 0 && (
                    <button
                      onClick={() => setSelectedInfantIds([])}
                      className="text-sm text-blue-600 hover:text-blue-800 font-semibold"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                {errors.selection && (
                  <p className="text-sm text-red-600 mt-2">{errors.selection}</p>
                )}
              </div>
            </div>

            {/* Right Column: Infant Selection */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Select Infants</h3>

              {/* Search and Filters */}
              <div className="space-y-3">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name or ID..."
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  />
                </div>

                {/* Filters */}
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={barangayFilter}
                    onChange={(e) => setBarangayFilter(e.target.value)}
                    className="px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none text-sm"
                  >
                    <option value="All">All Barangays</option>
                    {barangayOptions.map((barangay) => (
                      <option key={barangay} value={barangay}>
                        {barangay}
                      </option>
                    ))}
                  </select>

                  <select
                    value={ageRangeFilter}
                    onChange={(e) => setAgeRangeFilter(e.target.value)}
                    className="px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none text-sm"
                  >
                    <option value="All">All Ages</option>
                    <option value="0-6">0-6 months</option>
                    <option value="6-12">6-12 months</option>
                    <option value="12-24">12-24 months</option>
                  </select>
                </div>

                {/* Select All */}
                <button
                  onClick={handleSelectAll}
                  className="w-full px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  {selectedInfantIds.length === filteredInfants.length ? 'Deselect All' : 'Select All'} ({filteredInfants.length})
                </button>
              </div>

              {/* Infant List */}
              <div className="border border-slate-200 rounded-xl max-h-96 overflow-y-auto">
                {filteredInfants.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    No infants found matching your filters
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {filteredInfants.map((infant) => (
                      <label
                        key={infant.id}
                        className="flex items-center gap-3 p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedInfantIds.includes(infant.id)}
                          onChange={() => handleToggleInfant(infant.id)}
                          className="w-5 h-5 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                        />
                        <Avatar name={infant.name} size="small" />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-900 truncate">
                            {infant.name}
                          </div>
                          <div className="text-sm text-slate-500">
                            {infant.reference_id} â€¢ {infant.sex} â€¢ {infant.age_months}mo
                          </div>
                          {infant.barangay && (
                            <div className="text-xs text-slate-400">
                              ðŸ“ {infant.barangay}
                            </div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
          <div className="flex justify-between items-center">
            <div className="text-sm text-slate-600">
              {selectedInfantIds.length > 0 && (
                <span>
                  Ready to vaccinate <strong>{selectedInfantIds.length}</strong> infant{selectedInfantIds.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-6 py-3 text-slate-600 hover:text-slate-800 font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyToAll}
                disabled={selectedInfantIds.length === 0}
                className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Syringe className="w-5 h-5" />
                Apply to All ({selectedInfantIds.length})
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BatchVaccinationModal;
