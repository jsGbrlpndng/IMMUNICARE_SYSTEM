import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DigitalImmunizationCard from '../../components/caregiver/DigitalImmunizationCard';
import caregiverApi from '../../services/caregiverApi';

const CaregiverCard = ({ caregiverSession }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [card, setCard] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;

        const loadCard = async () => {
            setLoading(true);
            setError('');
            try {
                const response = await caregiverApi.getCard(id);
                if (active) setCard(response.card);
            } catch (err) {
                if (active) setError(err.message);
            } finally {
                if (active) setLoading(false);
            }
        };

        loadCard();
        return () => {
            active = false;
        };
    }, [id]);

    const handleSignOut = () => {
        caregiverApi.clearSession();
        navigate('/caregiver/login', { replace: true });
    };

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50">
                <div className="text-center">
                    <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-emerald-700 border-t-transparent" />
                    <p className="mt-4 text-sm font-black text-slate-500">Loading digital immunization card...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
                <div className="max-w-md rounded-lg border border-rose-100 bg-white p-6 text-center shadow-sm">
                    <h1 className="text-xl font-black text-slate-950">Unable to open card</h1>
                    <p className="mt-2 text-sm font-bold text-rose-700">{error}</p>
                    <button
                        type="button"
                        onClick={handleSignOut}
                        className="mt-5 rounded-lg bg-emerald-800 px-5 py-3 text-sm font-black text-white hover:bg-emerald-900"
                    >
                        Return to caregiver login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <DigitalImmunizationCard
            card={card}
            caregiverSession={caregiverSession}
            onSignOut={handleSignOut}
        />
    );
};

export default CaregiverCard;
