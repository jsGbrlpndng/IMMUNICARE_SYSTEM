const express = require('express');
const adminAuth = require('../middleware/adminAuth');
const clinicalAuth = require('../middleware/clinicalAuth');
const {
    getAdminDeployments,
    assignDeployment,
    getBhwActiveDeployments,
    getClinicalDeployments,
    getMyActiveDeployments
} = require('../controllers/deploymentController');

const adminDeploymentRouter = express.Router();
adminDeploymentRouter.use(adminAuth);
adminDeploymentRouter.get('/', getAdminDeployments);
adminDeploymentRouter.put('/:assignmentId/assign', assignDeployment);

const adminSpatialDeploymentRouter = express.Router();
adminSpatialDeploymentRouter.use(adminAuth);
adminSpatialDeploymentRouter.get('/deployments', getAdminDeployments);
adminSpatialDeploymentRouter.put('/deployments/:assignmentId/assign', assignDeployment);

const bhwDeploymentRouter = express.Router();
bhwDeploymentRouter.use(clinicalAuth);
bhwDeploymentRouter.get('/active', getBhwActiveDeployments);

const clinicalDeploymentRouter = express.Router();
clinicalDeploymentRouter.use(clinicalAuth);
clinicalDeploymentRouter.get('/', getClinicalDeployments);
clinicalDeploymentRouter.get('/active', getMyActiveDeployments);

module.exports = {
    adminSpatialDeploymentRouter,
    adminDeploymentRouter,
    bhwDeploymentRouter,
    clinicalDeploymentRouter
};
