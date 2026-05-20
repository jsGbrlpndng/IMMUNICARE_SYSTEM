# ImmuniCare: System Architecture & Refactor Summary

This document details the finalized technical architecture of the ImmuniCare system following a comprehensive structural refactor and defensive hardening phase. This summary is intended for inclusion in the Capstone Methodology (Chapter 3).

## 1. Core Technology Stack (PERN)
ImmuniCare is built on the **PERN** stack, optimized for clinical data integrity and spatial analysis:
- **Frontend**: React (Vite) with Tailwind CSS for high-performance, responsive UI.
- **Backend**: Node.js (Express) serving as a RESTful API gateway.
- **Database**: PostgreSQL 15 with **PostGIS** extension for geospatial intelligence.
- **Environment**: Standardized Node environment with shared validation and security layers.

## 2. Advanced Geospatial Integration
The system leverages **PostGIS** to provide sophisticated decision support for midwives:
- **Spatial Triage**: Real-time conversion of infant addresses into geodetic coordinates (SRID 4326).
- **DBSCAN Clustering**: A density-based spatial clustering algorithm for applications with noise (DBSCAN) is implemented on the backend to automatically detect "Hotspots" of overdue vaccinations.
- **Midwife Map Interface**: A touch-optimized Leaflet map that visualizes these hotspots, allowing midwives to plan targeted field follow-ups based on population density and clinical risk.

## 3. Service-Oriented Backend (Hardened)
The backend has been refactored from monolithic route handlers into a robust **Service-Oriented Architecture (SOA)**:
- **InfantService.js**: Centralizes all business logic, clinical rules, and database interactions.
- **Transaction Management**: All critical operations (e.g., registration and clinical approvals) are wrapped in explicit SQL transactions, ensuring zero data corruption in the event of a network or system failure.
- **Thin Controllers**: API routes now serve strictly as transport layers, delegating all logic to the Service layer for improved testability and maintenance.

## 4. Modular & Fault-Tolerant Frontend
The frontend has been re-engineered for clinical stability and field reliability:
- **Component Decomposition**: The massive `Heatmap` and `InfantRegistrationForm` have been broken down into small, focused sub-components, reducing main-thread blocking and improving render performance.
- **Defensive Programming**:
    - **React Error Boundaries**: Route-level boundaries catch rendering exceptions in complex modules (like the Map) to prevent full-application crashes.
    - **Coordinate Guarding**: Strict validation of lat/lng data prevents the Leaflet engine from attempting to render corrupt spatial data.
    - **Empty State Normalization**: Standardized "No Records" UI ensures a professional experience even during zero-data scenarios or filtered views.
- **Touch-Target Optimization**: UI elements have been specifically designed with increased spacing and larger hit areas for Barangay Health Workers (BHWs) using mobile tablets in the field.

## 5. Security & Governance
- **RBAC (Role-Based Access Control)**: Strict gating of features based on User Roles (Admin, Midwife, BHW).
- **Integrity Sentinel**: A custom backend service that monitors database schema integrity during boot, ensuring that no unauthorized changes have compromised the clinical data structure.

---

**Current System Status**: Refactored, Hardened, and Verified.
**Architecture Classification**: Service-Oriented Spatial Decision Support System (SDSS).
