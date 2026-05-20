import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import InfantRegistrationForm from '../clinical/InfantRegistrationForm';

/**
 * BHW Registration Page
 * Uses the unified clinical registration form for role-based encoding
 */
const BHWRegistration = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const handleComplete = () => {
        // Navigate back to BHW dashboard after successful registration
        navigate('/bhw/dashboard');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-8 px-4">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <button
                        onClick={() => navigate('/bhw/dashboard')}
                        className="flex items-center space-x-2 text-slate-600 hover:text-slate-900 transition-colors mb-4"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span className="font-medium">Back to Dashboard</span>
                    </button>
                    
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                        <h1 className="text-2xl font-bold text-slate-900">Infant Registration</h1>
                        <p className="text-slate-600 mt-1">
                            Register a new infant for immunization tracking
                        </p>
                    </div>
                </div>

                {/* Unified Registration Form */}
                <InfantRegistrationForm
                    userRole="BHW"
                    onComplete={handleComplete}
                />
            </div>
        </div>
    );
};

export default BHWRegistration;
