import React from 'react';
import SecurityProfileForm from '../components/SecurityProfileForm';

const AccountSecurityPage = () => {
    return (
        <div className="p-5 lg:p-8">
            <SecurityProfileForm
                title="Account Settings"
                subtitle="Change your password by confirming your current credential first."
            />
        </div>
    );
};

export default AccountSecurityPage;
