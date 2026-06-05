import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainDashboard from './pages/clinical/MainDashboard';
import MidwifeDashboard from './pages/clinical/MidwifeDashboard';
import ValidationPage from './pages/clinical/ValidationPage';
import NIPSchedulePage from './pages/clinical/NIPSchedulePage';
import AnalyticsMap from './pages/clinical/AnalyticsMap';
import Heatmap from './pages/clinical/Heatmap';
import CaregiverPortal from './pages/CaregiverPortal';
import Reports from './pages/clinical/Reports';
import LandingPage from './pages/LandingPage';
import AccessPortal from './pages/AccessPortal';
import ForcePasswordChange from './pages/ForcePasswordChange';
import AccountSecurityPage from './pages/AccountSecurityPage';
import StaffLayout from './components/StaffLayout';
import InfantRegistrationForm from './pages/clinical/InfantRegistrationForm';
import SMSCampaigns from './pages/clinical/SMSCampaigns';
import { AuthProvider } from './contexts/AuthContext';
import { IdleSessionProvider } from './contexts/IdleSessionContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import AdminLayout from './components/AdminLayout';
import PublicHealthDashboard from './pages/admin/PublicHealthDashboard';
import UserManagement from './pages/admin/UserManagement';
// DOHRules removed from navigation â€“ component kept for legacy backend compatibility
import AuditLogs from './pages/admin/AuditLogs';
import BarangayMonthlyReport from './pages/admin/BarangayMonthlyReport';
import SuperAdminAnalytics from './pages/admin/SuperAdminAnalytics';
import CICCatchUpAnalysis from './pages/admin/CICCatchUpAnalysis';
import BHWLayout from './layouts/BHWLayout';
import SuperAdminLayout from './components/SuperAdminLayout';
import SuperAdminRoute from './components/SuperAdminRoute';
import { BarangayFilterProvider } from './contexts/BarangayFilterContext';
import BHWDashboard from './pages/bhw/BHWDashboard';
import BHWRegistration from './pages/bhw/BHWRegistration';
import MySubmissions from './pages/bhw/MySubmissions';
import InfantProfile from './pages/bhw/InfantProfile';
import InfantRecord from './pages/clinical/InfantRecord';
import InfantRegistry from './pages/clinical/InfantRegistry';
import FollowUpTasks from './pages/clinical/FollowUpTasks';
import AdminSpatialMap from './pages/admin/AdminSpatialMap';
import AdminPopulationMap from './pages/admin/AdminPopulationMap';
import TargetConfiguration from './pages/admin/TargetConfiguration';

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
                    <Route path="/portal" element={<AccessPortal />} />
                    <Route path="/login" element={<AccessPortal />} />
                    <Route path="/force-password-change" element={<ForcePasswordChange />} />

                    {/* Secure Caregiver Records */}
                    <Route path="/caregiver" element={<CaregiverPortal />} />

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
