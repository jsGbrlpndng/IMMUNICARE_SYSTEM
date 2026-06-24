import React from 'react';
import { Navigate } from 'react-router-dom';

const CaregiverDashboard = ({ caregiverSession }) => {
    const infantId = caregiverSession?.infant?.id || caregiverSession?.caregiver?.infant_id;
    return <Navigate to={infantId ? `/caregiver/infants/${infantId}/card` : '/caregiver/login'} replace />;
};

export default CaregiverDashboard;
