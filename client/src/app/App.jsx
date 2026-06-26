import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MidwifeDashboard from '../features/clinical/pages/MidwifeDashboard';
import ValidationPage from '../features/registration/pages/ValidationPage';
import NIPSchedulePage from '../features/vaccination/pages/NIPSchedulePage';
import Heatmap from '../features/geospatial/pages/Heatmap';
import CaregiverLogin from '../features/caregiver/pages/CaregiverLogin';
import CaregiverDashboard from '../features/caregiver/pages/CaregiverDashboard';
import CaregiverCard from '../features/caregiver/pages/CaregiverCard';
import Reports from '../features/reports/pages/Reports';
import LandingPage from '../features/auth/pages/LandingPage';
import AccessPortal from '../features/auth/pages/AccessPortal';
import ForcePasswordChange from '../features/auth/pages/ForcePasswordChange';
import AccountSecurityPage from '../features/auth/pages/AccountSecurityPage';
import { PasswordSuccessInterstitial } from '../components/forms/SecurityProfileForm';
import StaffLayout from '../components/layout/StaffLayout';
import InfantRegistrationForm from '../features/registration/pages/InfantRegistrationForm';
import SMSCampaigns from '../features/sms/pages/SMSCampaigns';
import { AuthProvider } from '../contexts/AuthContext';
import { IdleSessionProvider } from '../contexts/IdleSessionContext';
import ProtectedRoute from './routes/ProtectedRoute';
import CaregiverRoute from './routes/CaregiverRoute';
import AdminRoute from './routes/AdminRoute';
import AdminLayout from '../components/layout/AdminLayout';
import PublicHealthDashboard from '../features/admin/pages/PublicHealthDashboard';
import UserManagement from '../features/admin/pages/UserManagement';
// DOHRules removed from navigation â€“ component kept for legacy backend compatibility
import AuditLogs from '../features/audit/pages/AuditLogs';
import BarangayMonthlyReport from '../features/reports/pages/BarangayMonthlyReport';
import SuperAdminAnalytics from '../features/reports/pages/SuperAdminAnalytics';
import CICCatchUpAnalysis from '../features/reports/pages/CICCatchUpAnalysis';
import BHWLayout from '../components/layout/BHWLayout';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import SuperAdminRoute from './routes/SuperAdminRoute';
import { BarangayFilterProvider } from '../contexts/BarangayFilterContext';
import BHWDashboard from '../features/bhw/pages/BHWDashboard';
import BHWRegistration from '../features/bhw/pages/BHWRegistration';
import MySubmissions from '../features/bhw/pages/MySubmissions';
import InfantRecord from '../features/registry/pages/InfantRecord';
import InfantRegistry from '../features/registry/pages/InfantRegistry';
import FollowUpTasks from '../features/registry/pages/FollowUpTasks';
import AdminSpatialMap from '../features/geospatial/pages/AdminSpatialMap';
import AdminPopulationMap from '../features/geospatial/pages/AdminPopulationMap';
import TargetConfiguration from '../features/admin/pages/TargetConfiguration';
import SuperAdminMap from '../features/geospatial/pages/SuperAdminMap';
import DSSAuditDashboard from '../features/geospatial/components/DSSAuditDashboard';

function App() {
    return (
        <AuthProvider>
            <BarangayFilterProvider>
                <Router>
                <IdleSessionProvider>
                <Routes>
                    {/* Public Landing Page is the entry point */}
                    <Route path="/" element={<LandingPage />} />

                    {/* Unified Access Portal */}
                    <Route path="/password-update-success" element={<PasswordSuccessInterstitial />} />
                    <Route path="/portal" element={<AccessPortal />} />
                    <Route path="/login" element={<AccessPortal />} />
                    <Route path="/force-password-change" element={<ForcePasswordChange />} />

                    {/* Secure Caregiver Records */}
                    <Route path="/caregiver" element={<Navigate to="/caregiver/login" replace />} />
                    <Route path="/caregiver/login" element={<CaregiverLogin />} />
                    <Route
                        path="/caregiver/dashboard"
                        element={
                            <CaregiverRoute>
                                <CaregiverDashboard />
                            </CaregiverRoute>
                        }
                    />
                    <Route
                        path="/caregiver/infants/:id/card"
                        element={
                            <CaregiverRoute>
                                <CaregiverCard />
                            </CaregiverRoute>
                        }
                    />

                    {/* Protected Clinical Workspace */}
                    <Route
                        path="/clinical/dashboard"
                        element={
                            <ProtectedRoute allowedRoles={['Midwife', 'Admin', 'Super Admin']}>
                                <StaffLayout><MidwifeDashboard /></StaffLayout>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/clinical/validation"
                        element={
                            <ProtectedRoute allowedRoles={['Midwife', 'Admin', 'Super Admin']}>
                                <StaffLayout><ValidationPage /></StaffLayout>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/clinical/schedule"
                        element={
                            <ProtectedRoute allowedRoles={['Midwife', 'Admin', 'Super Admin']}>
                                <StaffLayout><NIPSchedulePage /></StaffLayout>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/clinical/sms"
                        element={
                            <ProtectedRoute allowedRoles={['Midwife', 'Admin', 'Super Admin']}>
                                <StaffLayout><SMSCampaigns /></StaffLayout>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/clinical/registration"
                        element={
                            <ProtectedRoute allowedRoles={['Midwife', 'Admin', 'Super Admin']}>
                                <Navigate to="/clinical/registry" replace />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/clinical/registrations/:id"
                        element={
                            <ProtectedRoute allowedRoles={['Midwife', 'Admin', 'Super Admin']}>
                                <StaffLayout><InfantRegistrationForm /></StaffLayout>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/clinical/map"
                        element={
                            <ProtectedRoute allowedRoles={['Midwife', 'Admin', 'Super Admin']}>
                                <StaffLayout><Heatmap /></StaffLayout>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/clinical/reports"
                        element={
                            <ProtectedRoute allowedRoles={['Midwife', 'Admin', 'Super Admin']}>
                                <StaffLayout><Reports /></StaffLayout>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/clinical/follow-ups"
                        element={
                            <ProtectedRoute allowedRoles={['Midwife', 'Admin', 'Super Admin']}>
                                <StaffLayout><FollowUpTasks /></StaffLayout>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/clinical/profile"
                        element={
                            <ProtectedRoute allowedRoles={['Midwife', 'Admin', 'Super Admin']}>
                                <StaffLayout>
                                    <AccountSecurityPage />
                                </StaffLayout>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/clinical/registry"
                        element={
                            <ProtectedRoute allowedRoles={['Midwife', 'Admin', 'Super Admin']}>
                                <StaffLayout>
                                    <InfantRegistry />
                                </StaffLayout>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/clinical/registry/:id"
                        element={
                            <ProtectedRoute allowedRoles={['Midwife', 'Admin', 'Super Admin']}>
                                <StaffLayout>
                                    <InfantRecord />
                                </StaffLayout>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/clinical/infants/:id"
                        element={
                            <ProtectedRoute allowedRoles={['Midwife', 'Admin', 'Super Admin']}>
                                <StaffLayout>
                                    <InfantRecord />
                                </StaffLayout>
                            </ProtectedRoute>
                        }
                    />


                    {/* BHW Routes */}
                    <Route
                        path="/bhw"
                        element={
                            <ProtectedRoute allowedRoles={['BHW']}>
                                <BHWLayout />
                            </ProtectedRoute>
                        }
                    >
                        <Route path="dashboard" element={<BHWDashboard />} />
                        <Route path="register" element={<BHWRegistration />} />
                        <Route path="submissions" element={<MySubmissions />} />
                        <Route path="follow-ups" element={<FollowUpTasks />} />
                        <Route path="infants/:id" element={<InfantRecord />} />
                        <Route path="registrations/:id" element={<InfantRegistrationForm />} />
                        <Route path="profile" element={<AccountSecurityPage />} />
                    </Route>

                    {/* Admin Routes */}
                    <Route
                        path="/admin/dashboard"
                        element={
                            <AdminRoute>
                                <AdminLayout><PublicHealthDashboard /></AdminLayout>
                            </AdminRoute>
                        }
                    />
                    <Route
                        path="/admin/users"
                        element={
                            <AdminRoute>
                                <AdminLayout>
                                    <UserManagement />
                                </AdminLayout>
                            </AdminRoute>
                        }
                    />
                    {/* /admin/rules redirects to dashboard â€“ DOH Rules removed from UI */}
                    <Route
                        path="/admin/rules"
                        element={<Navigate to="/admin/dashboard" replace />}
                    />
                    <Route
                        path="/admin/audit"
                        element={
                            <AdminRoute>
                                <AdminLayout>
                                    <AuditLogs />
                                </AdminLayout>
                            </AdminRoute>
                        }
                    />
                    <Route
                        path="/admin/account-settings"
                        element={
                            <AdminRoute>
                                <AdminLayout>
                                    <AccountSecurityPage />
                                </AdminLayout>
                            </AdminRoute>
                        }
                    />
                    <Route
                        path="/admin/reports/m1"
                        element={
                            <AdminRoute>
                                <AdminLayout>
                                    <BarangayMonthlyReport />
                                </AdminLayout>
                            </AdminRoute>
                        }
                    />
                    <Route
                        path="/admin/reports/cic-catchup"
                        element={
                            <AdminRoute>
                                <AdminLayout>
                                    <CICCatchUpAnalysis />
                                </AdminLayout>
                            </AdminRoute>
                        }
                    />
                    <Route
                        path="/admin/population-heatmap"
                        element={
                            <AdminRoute>
                                <AdminLayout>
                                    <AdminPopulationMap />
                                </AdminLayout>
                            </AdminRoute>
                        }
                    />
                    <Route
                        path="/admin/geospatial"
                        element={
                            <AdminRoute>
                                <Navigate to="/admin/population-heatmap" replace />
                            </AdminRoute>
                        }
                    />
                    <Route
                        path="/admin/spatial-analysis"
                        element={
                            <AdminRoute>
                                <AdminLayout>
                                    <AdminSpatialMap />
                                </AdminLayout>
                            </AdminRoute>
                        }
/>
                    
                    {/* Super Admin Routes */}
                    <Route
                        path="/superadmin/dashboard"
                        element={
                            <SuperAdminRoute>
                                <SuperAdminLayout><PublicHealthDashboard /></SuperAdminLayout>
                            </SuperAdminRoute>
                        }
                    />
                    <Route
                        path="/superadmin/users"
                        element={
                            <SuperAdminRoute>
                                <SuperAdminLayout><UserManagement /></SuperAdminLayout>
                            </SuperAdminRoute>
                        }
                    />
                    <Route
                        path="/superadmin/targets"
                        element={
                            <SuperAdminRoute>
                                <SuperAdminLayout><TargetConfiguration /></SuperAdminLayout>
                            </SuperAdminRoute>
                        }
                    />
                    <Route
                        path="/superadmin/audit"
                        element={
                            <SuperAdminRoute>
                                <SuperAdminLayout><AuditLogs /></SuperAdminLayout>
                            </SuperAdminRoute>
                        }
                    />
                    <Route
                        path="/superadmin/account-settings"
                        element={
                            <SuperAdminRoute>
                                <SuperAdminLayout><AccountSecurityPage /></SuperAdminLayout>
                            </SuperAdminRoute>
                        }
                    />
                    <Route
                        path="/superadmin/reports"
                        element={
                            <SuperAdminRoute>
                                <SuperAdminLayout><SuperAdminAnalytics /></SuperAdminLayout>
                            </SuperAdminRoute>
                        }
                    />
                    <Route
                        path="/superadmin/geospatial"
                        element={
                            <SuperAdminRoute>
                                <SuperAdminLayout><SuperAdminMap /></SuperAdminLayout>
                            </SuperAdminRoute>
                        }
                    />
                    <Route
                        path="/superadmin/geospatial/evaluation"
                        element={
                            <SuperAdminRoute>
                                <SuperAdminLayout><DSSAuditDashboard /></SuperAdminLayout>
                            </SuperAdminRoute>
                        }
                    />

                    {/* Fallback to Landing Page */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                </IdleSessionProvider>
            </Router>
            </BarangayFilterProvider>
        </AuthProvider >
    );
}

export default App;
