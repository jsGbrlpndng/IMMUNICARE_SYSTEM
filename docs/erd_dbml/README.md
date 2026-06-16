# IMMUNICARE Modular DBML ERDs for dbdiagram.io

These DBML files were generated from the inspected live PostgreSQL schema. The database was queried read-only for actual tables, primary keys, foreign keys, and column data types. No migrations or data changes were made.

PostGIS metadata objects such as `spatial_ref_sys`, `geometry_columns`, and `geography_columns` are excluded because they are not IMMUNICARE business tables.

## ERD 1: Authentication, RBAC, and Personnel Management

File: `erd_01_auth_rbac_personnel.dbml`

Tables included: `users`, `barangays`, `user_barangay_assignments`, `notifications`, `system_settings`

Confirmed physical foreign keys:
- `users.created_by_user_id -> users.id`
- `user_barangay_assignments.user_id -> users.id`
- `user_barangay_assignments.barangay_id -> barangays.id`
- `user_barangay_assignments.assigned_by -> users.id`
- `notifications.recipient_user_id -> users.id`
- `notifications.sender_user_id -> users.id`
- `system_settings.updated_by -> users.id`

Logical relationships:
- `users.assigned_barangay -> barangays.name`; FK not enforced.
- `notifications.recipient_barangay -> barangays.name`; FK not enforced.

Suggested arrangement for dbdiagram.io:
- Top center: `users`
- Bottom center: `user_barangay_assignments`
- Bottom left: `barangays`
- Right: `notifications`
- Far right: `system_settings`

Caption:
Figure 3.X. Authentication, RBAC, and Personnel Management ERD. This modular ERD shows the tables used for user account management, role-based access control, barangay assignment, notifications, and system settings in IMMUNICARE.

Warning:
`users.role` is used for RBAC. No separate physical `roles`, `permissions`, `role_permissions`, or `user_roles` table exists in the inspected schema.

## ERD 2: Infant Registration and Caregiver Profiling

File: `erd_02_infant_registration_caregiver.dbml`

Tables included: `users`, `barangays`, `user_barangay_assignments`, `caregivers`, `infant_registrations`, `infants`

Confirmed physical foreign keys:
- `users.created_by_user_id -> users.id`
- `user_barangay_assignments.user_id -> users.id`
- `user_barangay_assignments.barangay_id -> barangays.id`
- `user_barangay_assignments.assigned_by -> users.id`
- `caregivers.enrolled_by -> users.id`
- `infant_registrations.created_by -> users.id`
- `infant_registrations.reviewed_by -> users.id`
- `infant_registrations.promoted_infant_id -> infants.id`
- `infants.caregiver_id -> caregivers.id`
- `infants.created_by -> users.id`
- `infants.approved_registration_id -> infant_registrations.id`

Logical relationships:
- `users.assigned_barangay -> barangays.name`; FK not enforced.
- `infant_registrations.barangay -> barangays.name`; FK not enforced.
- `infants.barangay -> barangays.name`; FK not enforced.
- Caregiver data inside `infant_registrations.registration_data`; JSONB only, FK not enforced.

Suggested arrangement for dbdiagram.io:
- Top center: `infant_registrations`
- Center: `infants`
- Left: `caregivers`
- Right: `users`
- Bottom left: `barangays`
- Bottom center: `user_barangay_assignments`

Caption:
Figure 3.X. Infant Registration and Caregiver Profiling ERD. This modular ERD shows how draft and submitted infant registrations, caregiver profiles, approved infant records, and encoder/reviewer users are related.

## ERD 3: Registration Validation and Master Infant Registry

File: `erd_03_registration_validation_registry.dbml`

Tables included: `users`, `caregivers`, `infant_registrations`, `registration_validation_events`, `infants`, `approval_audit`, `audit_trail`

Confirmed physical foreign keys:
- `caregivers.enrolled_by -> users.id`
- `infant_registrations.created_by -> users.id`
- `infant_registrations.reviewed_by -> users.id`
- `infant_registrations.promoted_infant_id -> infants.id`
- `registration_validation_events.registration_id -> infant_registrations.id`
- `registration_validation_events.reviewer_user_id -> users.id`
- `infants.caregiver_id -> caregivers.id`
- `infants.created_by -> users.id`
- `infants.approved_registration_id -> infant_registrations.id`
- `approval_audit.registration_id -> infant_registrations.id`
- `approval_audit.infant_id -> infants.id`

Logical relationships:
- `approval_audit.approver_id -> users.id`; FK not enforced.
- `audit_trail.user_id -> users.id`; FK not enforced.
- `audit_trail.entity_id -> referenced business record`; generic audit target, FK not enforced.

Needs verification:
- `infant_transfer_events` exists in a migration file but was not present in the inspected live PostgreSQL schema.

Suggested arrangement for dbdiagram.io:
- Center: `infants`
- Top center: `infant_registrations`
- Top right: `registration_validation_events`
- Right: `approval_audit`
- Left: `caregivers`
- Bottom center: `users`
- Bottom right: `audit_trail`

Caption:
Figure 3.X. Registration Validation and Master Infant Registry ERD. This modular ERD shows the workflow from infant registration submission to validation events, approval audit records, and approved master infant records.

## ERD 4: NIP Schedule and Vaccination Recording

File: `erd_04_nip_schedule_vaccination.dbml`

Tables included: `users`, `infants`, `doh_compliance_rules`, `infant_schedules`, `vaccinations`, `schedule_deferrals`, `schedule_overrides`, `authorization_sessions`, `authorization_audit`

Confirmed physical foreign keys:
- `infants.created_by -> users.id`
- `doh_compliance_rules.created_by -> users.id`
- `infant_schedules.infant_id -> infants.id`
- `vaccinations.infant_id -> infants.id`
- `vaccinations.schedule_id -> infant_schedules.id`
- `vaccinations.recorded_by -> users.id`
- `vaccinations.validated_by_id -> users.id`
- `vaccinations.correction_of_vaccination_id -> vaccinations.id`
- `schedule_deferrals.infant_id -> infants.id`
- `schedule_deferrals.schedule_id -> infant_schedules.id`
- `schedule_overrides.infant_id -> infants.id`
- `schedule_overrides.schedule_id -> infant_schedules.id`
- `authorization_sessions.midwife_id -> users.id`
- `authorization_sessions.infant_id -> infants.id`
- `authorization_audit.midwife_id -> users.id`
- `authorization_audit.infant_id -> infants.id`

Logical relationships:
- `infant_schedules.vaccine_code -> doh_compliance_rules.vaccine_code`; FK not enforced.
- `vaccinations.vaccine_code -> doh_compliance_rules.vaccine_code`; FK not enforced.
- `schedule_overrides.midwife_id -> users.id`; FK not enforced.
- `schedule_deferrals.deferred_by -> users.id`; FK not enforced.

Suggested arrangement for dbdiagram.io:
- Center: `infants`
- Center right: `infant_schedules`
- Right: `vaccinations`
- Top right: `doh_compliance_rules`
- Bottom right: `schedule_deferrals` and `schedule_overrides`
- Left: `users`
- Bottom left: `authorization_sessions` and `authorization_audit`

Caption:
Figure 3.X. NIP Schedule and Vaccination Recording ERD. This modular ERD shows NIP rule records, generated infant schedules, administered vaccination doses, clinical deferrals, schedule overrides, and authorization audit records.

Warning:
The actual physical table is `infant_schedules`; no `vaccination_schedules` table was found in the inspected live schema.

## ERD 5: Defaulter Tracking and Follow-Up Management

File: `erd_05_defaulter_followup.dbml`

Tables included: `users`, `infants`, `infant_schedules`, `follow_up_tasks`, `follow_up_logs`, `notifications`

Confirmed physical foreign keys:
- `infants.created_by -> users.id`
- `infant_schedules.infant_id -> infants.id`
- `follow_up_tasks.infant_id -> infants.id`
- `follow_up_tasks.schedule_id -> infant_schedules.id`
- `follow_up_tasks.assigned_to_bhw_id -> users.id`
- `follow_up_tasks.assigned_by_midwife_id -> users.id`
- `follow_up_tasks.reviewed_by -> users.id`
- `follow_up_logs.infant_id -> infants.id`
- `follow_up_logs.schedule_id -> infant_schedules.id`
- `follow_up_logs.bhw_id -> users.id`
- `notifications.recipient_user_id -> users.id`
- `notifications.sender_user_id -> users.id`

Logical relationships:
- `infants.barangay -> barangays.name`; FK not enforced.
- `follow_up_tasks.barangay -> barangays.name`; FK not enforced.
- `follow_up_logs.barangay -> barangays.name`; FK not enforced.
- `users.assigned_barangay -> barangays.name`; FK not enforced.
- `notifications.recipient_barangay -> barangays.name`; FK not enforced.

Suggested arrangement for dbdiagram.io:
- Center: `follow_up_tasks`
- Left: `infants`
- Top left: `infant_schedules`
- Bottom center: `follow_up_logs`
- Right: `users`
- Far right: `notifications`

Caption:
Figure 3.X. Defaulter Tracking and Follow-Up Management ERD. This modular ERD shows how overdue or defaulting infant schedules are connected to BHW follow-up tasks, visit logs, notifications, and review actions.

Warning:
Defaulter status is derived from `infant_schedules.status` and `infants.immunization_status`.

## ERD 6: SMS Reminder and OTP Caregiver Access

File: `erd_06_sms_otp_caregiver_access.dbml`

Tables included: `users`, `caregivers`, `infants`, `sms_logs`, `otp_records`, `infant_schedules`, `vaccinations`

Confirmed physical foreign keys:
- `caregivers.enrolled_by -> users.id`
- `infants.caregiver_id -> caregivers.id`
- `infants.created_by -> users.id`
- `sms_logs.infant_id -> infants.id`
- `sms_logs.caregiver_id -> caregivers.id`
- `sms_logs.sent_by -> users.id`
- `otp_records.caregiver_id -> caregivers.id`
- `infant_schedules.infant_id -> infants.id`
- `vaccinations.infant_id -> infants.id`
- `vaccinations.schedule_id -> infant_schedules.id`
- `vaccinations.recorded_by -> users.id`

Logical relationships:
- `otp_records.mobile_number -> caregivers.mobile_number`; FK not enforced.
- `sms_logs.mobile_number -> caregivers.mobile_number`; FK not enforced.
- `infants.caregiver_phone -> caregivers.mobile_number`; FK not enforced.

Suggested arrangement for dbdiagram.io:
- Center: `caregivers`
- Right: `infants`
- Bottom right: `infant_schedules` and `vaccinations`
- Left: `sms_logs`
- Bottom left: `otp_records`
- Top: `users`

Caption:
Figure 3.X. SMS Reminder and OTP Caregiver Access ERD. This modular ERD shows caregiver contact profiles, SMS reminder logs, OTP login records, and the infant schedule/vaccination records used for caregiver immunization card access.

## ERD 7: DBSCAN and Geospatial Hotspot Monitoring

File: `erd_07_dbscan_geospatial_hotspot.dbml`

Tables included: `users`, `barangays`, `infants`, `dbscan_cluster_results`, `dbscan_cluster_members`, `cluster_assignments`, `cluster_assignment_members`, `deployment_reports`, `deployment_report_outcomes`, `spatial_dss_monthly_snapshots`

Confirmed physical foreign keys:
- `infants.created_by -> users.id`
- `dbscan_cluster_results.generated_by -> users.id`
- `dbscan_cluster_members.cluster_result_id -> dbscan_cluster_results.id`
- `dbscan_cluster_members.infant_id -> infants.id`
- `cluster_assignments.barangay_id -> barangays.id`
- `cluster_assignments.cluster_result_id -> dbscan_cluster_results.id`
- `cluster_assignments.assigned_bhw_id -> users.id`
- `cluster_assignments.assigned_by_admin_id -> users.id`
- `cluster_assignment_members.assignment_id -> cluster_assignments.id`
- `cluster_assignment_members.infant_id -> infants.id`
- `deployment_reports.assignment_id -> cluster_assignments.id`
- `deployment_reports.submitted_by -> users.id`
- `deployment_reports.validated_by -> users.id`
- `deployment_report_outcomes.report_id -> deployment_reports.id`
- `deployment_report_outcomes.infant_id -> infants.id`

Logical relationships:
- `infants.barangay -> barangays.name`; FK not enforced.
- `dbscan_cluster_results.barangay -> barangays.name`; FK not enforced.
- `cluster_assignments.barangay -> barangays.name`; FK not enforced.
- `deployment_reports.barangay -> barangays.name`; FK not enforced.
- `spatial_dss_monthly_snapshots.barangay -> barangays.name`; FK not enforced.

Suggested arrangement for dbdiagram.io:
- Center: `dbscan_cluster_results`
- Left: `infants`
- Between them: `dbscan_cluster_members`
- Right: `cluster_assignments`
- Bottom right: `cluster_assignment_members`
- Far right: `deployment_reports` and `deployment_report_outcomes`
- Top right: `users`
- Top left: `barangays`
- Bottom: `spatial_dss_monthly_snapshots`

Caption:
Figure 3.X. DBSCAN and Geospatial Hotspot Monitoring ERD. This modular ERD shows infant geospatial fields, DBSCAN cluster results, cluster membership, hotspot assignments, deployment reports, and spatial DSS snapshots.

Warning:
DBSCAN membership is enforced through `dbscan_cluster_members`. PostGIS metadata tables are excluded.

## ERD 8: Reports, Audit Trail, and Backup/Recovery

File: `erd_08_reports_audit_backup.dbml`

Tables included: `users`, `barangays`, `report_exports`, `backup_runs`, `audit_logs`, `audit_trail`, `system_audit_logs`, `system_settings`, `approval_audit`, `authorization_audit`, `infant_registrations`, `infants`, `m1_immunization_targets`, `m1_monthly_actual_populations`, `m1_municipal_targets`, `m1_doh_monitoring_data`, `spatial_dss_monthly_snapshots`

Confirmed physical foreign keys:
- `report_exports.generated_by -> users.id`
- `backup_runs.initiated_by -> users.id`
- `audit_logs.actor_user_id -> users.id`
- `audit_logs.barangay_id -> barangays.id`
- `system_audit_logs.user_id -> users.id`
- `system_settings.updated_by -> users.id`
- `infant_registrations.created_by -> users.id`
- `infant_registrations.reviewed_by -> users.id`
- `infant_registrations.promoted_infant_id -> infants.id`
- `infants.created_by -> users.id`
- `infants.approved_registration_id -> infant_registrations.id`
- `approval_audit.registration_id -> infant_registrations.id`
- `approval_audit.infant_id -> infants.id`
- `authorization_audit.midwife_id -> users.id`
- `authorization_audit.infant_id -> infants.id`
- `m1_immunization_targets.barangay_id -> barangays.id`
- `m1_immunization_targets.created_by -> users.id`
- `m1_immunization_targets.updated_by -> users.id`
- `m1_monthly_actual_populations.barangay_id -> barangays.id`
- `m1_monthly_actual_populations.created_by -> users.id`
- `m1_monthly_actual_populations.updated_by -> users.id`
- `m1_municipal_targets.created_by -> users.id`
- `m1_municipal_targets.updated_by -> users.id`

Logical relationships:
- `audit_trail.user_id -> users.id`; FK not enforced.
- `audit_trail.entity_id -> referenced business record`; FK not enforced.
- `audit_logs.target_record_id -> referenced business record`; FK not enforced.
- `system_audit_logs.target_id -> referenced business record`; FK not enforced.
- `m1_doh_monitoring_data.barangay -> barangays.name`; FK not enforced.
- `spatial_dss_monthly_snapshots.barangay -> barangays.name`; FK not enforced.
- `approval_audit.approver_id -> users.id`; FK not enforced.

Suggested arrangement for dbdiagram.io:
- Center: `users`
- Top left: `report_exports` and `backup_runs`
- Top right: `system_settings`
- Left: `audit_logs`, `audit_trail`, `system_audit_logs`
- Right: `approval_audit`, `authorization_audit`, `infant_registrations`, `infants`
- Bottom: M1 reporting tables and `spatial_dss_monthly_snapshots`
- Bottom left: `barangays`

Caption:
Figure 3.X. Reports, Audit Trail, and Backup/Recovery ERD. This modular ERD shows report exports, audit tables, approval and authorization logs, system settings, backup run history, and reporting target tables.

## Global Documentation Note

Due to the size and complexity of the IMMUNICARE database schema, the Entity Relationship Diagram is presented in modular sections. Each modular ERD focuses on a specific functional area of the system while preserving the relationships among related tables. This approach improves readability and allows each database module to be explained clearly. The complete table attributes are documented in the Data Dictionary.

