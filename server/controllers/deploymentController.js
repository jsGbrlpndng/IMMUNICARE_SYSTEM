const db = require('../db');
const ClusterDeploymentService = require('../services/ClusterDeploymentService');
const { ROLES } = require('../constants/domain');
const { performAuditLog } = require('../utils/auditLogger');

const deploymentService = new ClusterDeploymentService(db);

const requireBarangayScope = (user) => {
    const barangay = user?.assigned_barangay;
    if (!barangay) {
        const err = new Error('Barangay scope is required for deployment workflows.');
        err.status = 400;
        throw err;
    }
    return barangay;
};

const getAdminDeployments = async (req, res) => {
    try {
        if (![ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        const barangay = requireBarangayScope(req.user);
        const deployments = await deploymentService.syncDeploymentsForBarangay(barangay);
        const staffOptions = await deploymentService.listActiveStaffOptions(barangay);
        const bhwOptions = staffOptions.filter((person) => person.role === ROLES.BHW);
        const midwifeOptions = staffOptions.filter((person) => [ROLES.MIDWIFE, ROLES.NURSE].includes(person.role));

        res.json({
            success: true,
            barangay,
            fixed_parameters: {
                radius_meters: ClusterDeploymentService.FIXED_RADIUS_METERS,
                minimum_infants: ClusterDeploymentService.FIXED_MIN_INFANTS
            },
            deployments,
            clusters: deployments,
            active_staff: staffOptions,
            active_bhws: bhwOptions,
            active_midwives: midwifeOptions,
            bhw_options: bhwOptions,
            midwife_options: midwifeOptions
        });
    } catch (error) {
        console.error('[DEPLOYMENTS_ADMIN_LIST]', error);
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
};

const assignDeployment = async (req, res) => {
    try {
        if (![ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        const assignedStaffId = req.body?.assigned_staff_id || req.body?.assigned_user_id || req.body?.assigned_bhw_id || req.body?.assignedBhwId;
        if (!assignedStaffId) {
            return res.status(400).json({ success: false, error: 'assigned_staff_id is required.' });
        }

        const result = await deploymentService.assignDeployment({
            assignmentId: req.params.assignmentId,
            assignedStaffId,
            adminUser: req.user
        });

        await performAuditLog(
            req.user.id,
            'CLUSTER_DEPLOYMENT_ASSIGNED',
            'cluster_assignments',
            req.params.assignmentId,
            {
                barangay: req.user.assigned_barangay,
                assigned_staff_id: assignedStaffId,
                assigned_staff_name: result.staff.full_name,
                assigned_staff_role: result.staff.role,
                previous_assigned_bhw_id: result.previous_assignment.assigned_bhw_id,
                cluster_label: result.assignment.cluster_label
            },
            req
        );

        res.json({
            success: true,
            assignment: {
                ...result.assignment,
                assigned_staff_id: result.staff.id,
                assigned_user_name: result.staff.full_name,
                assigned_user_role: result.staff.role,
                assigned_bhw_name: result.staff.full_name
            },
            assigned_staff: {
                ...result.staff,
                assigned_user_name: result.staff.full_name,
                assigned_user_role: result.staff.role
            },
            assigned_bhw: result.staff
        });
    } catch (error) {
        console.error('[DEPLOYMENTS_ASSIGN]', error);
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
};

const getBhwActiveDeployments = async (req, res) => {
    try {
        if (req.user.role !== ROLES.BHW) {
            return res.status(403).json({ success: false, error: 'Only BHW users can view active deployments.' });
        }

        requireBarangayScope(req.user);
        const deployments = await deploymentService.getActiveDeploymentsForBhw(req.user);

        res.json({
            success: true,
            barangay: req.user.assigned_barangay,
            deployments
        });
    } catch (error) {
        console.error('[DEPLOYMENTS_BHW_ACTIVE]', error);
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
};

const getClinicalDeployments = async (req, res) => {
    try {
        if (![ROLES.MIDWIFE, ROLES.NURSE, ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Only supervisory clinical users can view deployment overlays.' });
        }

        const barangay = requireBarangayScope(req.user);
        const deployments = await deploymentService.syncDeploymentsForBarangay(barangay);

        res.json({
            success: true,
            barangay,
            deployments,
            clusters: deployments
        });
    } catch (error) {
        console.error('[DEPLOYMENTS_CLINICAL_LIST]', error);
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
};

const getMyActiveDeployments = async (req, res) => {
    try {
        if (![ROLES.BHW, ROLES.MIDWIFE, ROLES.NURSE].includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Only clinical field users can view active deployments.' });
        }

        requireBarangayScope(req.user);
        const deployments = await deploymentService.getActiveDeploymentsForAssignedUser(req.user);

        res.json({
            success: true,
            barangay: req.user.assigned_barangay,
            role: req.user.role,
            deployments
        });
    } catch (error) {
        console.error('[DEPLOYMENTS_MY_ACTIVE]', error);
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
};

module.exports = {
    getAdminDeployments,
    assignDeployment,
    getBhwActiveDeployments,
    getClinicalDeployments,
    getMyActiveDeployments
};
