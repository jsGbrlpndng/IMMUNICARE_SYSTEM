import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const BHWRoute = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return <div>Loading...</div>;
    }

    if (!user) {
        return <Navigate to="/portal" replace />;
    }

    if (user.role !== 'BHW') {
        return <Navigate to="/portal" replace />; // Or unauthorized page
    }

    return children;
};

export default BHWRoute;
