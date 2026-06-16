# IMMUNICARE Modular Mermaid ERDs

These Mermaid ERDs are based on the inspected live PostgreSQL schema and supporting schema/migration files. PostGIS metadata tables/views such as `spatial_ref_sys`, `geometry_columns`, and `geography_columns` are excluded from the business ERDs.

Use the full ERD only as a high-level overview in Chapter 3. Use these modular ERDs as the readable documentation figures.

## Mermaid Files

| File | Figure title | Included tables | Suggested Chapter 3 placement |
|---|---|---|---|
| `erd_01_auth_rbac_personnel.mmd` | Figure 3.X. Authentication, RBAC, and Personnel Management ERD | `users`, `barangays`, `user_barangay_assignments`, `notifications`, `system_settings` | User management, authentication, and authorization subsection |
| `erd_02_infant_registration_caregiver.mmd` | Figure 3.X. Infant Registration and Caregiver Profiling ERD | `infant_registrations`, `caregivers`, `infants`, `users`, `barangays`, `user_barangay_assignments` | Infant intake and caregiver profiling subsection |
| `erd_03_registration_validation_registry.mmd` | Figure 3.X. Registration Validation and Master Infant Registry ERD | `infant_registrations`, `registration_validation_events`, `infants`, `approval_audit`, `audit_trail`, `users` | Registration validation workflow subsection |
| `erd_04_nip_schedule_vaccination.mmd` | Figure 3.X. NIP Schedule and Vaccination Recording ERD | `doh_compliance_rules`, `infant_schedules`, `vaccinations`, `schedule_deferrals`, `schedule_overrides`, `authorization_sessions`, `authorization_audit`, `infants`, `users` | Immunization scheduling and vaccination recording subsection |
| `erd_05_defaulter_followup.mmd` | Figure 3.X. Defaulter Tracking and Follow-Up Management ERD | `infants`, `infant_schedules`, `follow_up_tasks`, `follow_up_logs`, `users`, `notifications` | Defaulter tracking and follow-up workflow subsection |
| `erd_06_sms_otp_caregiver_access.mmd` | Figure 3.X. SMS Reminder and OTP Caregiver Access ERD | `caregivers`, `infants`, `sms_logs`, `otp_records`, `users`, `infant_schedules`, `vaccinations` | Caregiver portal, SMS reminder, and digital immunization card subsection |
| `erd_07_dbscan_geospatial_hotspot.mmd` | Figure 3.X. DBSCAN and Geospatial Hotspot Monitoring ERD | `infants`, `barangays`, `dbscan_cluster_results`, `dbscan_cluster_members`, `cluster_assignments`, `cluster_assignment_members`, `deployment_reports`, `deployment_report_outcomes`, `spatial_dss_monthly_snapshots`, `users` | Spatial DSS, DBSCAN clustering, and hotspot deployment subsection |
| `erd_08_reports_audit_backup.mmd` | Figure 3.X. Reports, Audit Trail, and Backup/Recovery ERD | `report_exports`, `backup_runs`, `audit_logs`, `audit_trail`, `system_audit_logs`, `system_settings`, `m1_immunization_targets`, `m1_monthly_actual_populations`, `m1_municipal_targets`, `m1_doh_monitoring_data`, `spatial_dss_monthly_snapshots`, `barangays`, `users` | Reports, audit trail, governance, and recovery subsection |

## Figure Captions

Figure 3.X. Authentication, RBAC, and Personnel Management ERD. This diagram shows IMMUNICARE user accounts, role values, barangay master data, multi-barangay user assignments, notifications, and system settings.

Figure 3.X. Infant Registration and Caregiver Profiling ERD. This diagram shows how infant intake records, caregiver profiles, approved infant records, and encoder/reviewer users are related during registration.

Figure 3.X. Registration Validation and Master Infant Registry ERD. This diagram shows the workflow from submitted registration to validation events, approval audit records, and approved master infant records.

Figure 3.X. NIP Schedule and Vaccination Recording ERD. This diagram shows NIP rule records, generated infant schedules, administered vaccination doses, schedule deferrals, clinical overrides, and authorization audit records.

Figure 3.X. Defaulter Tracking and Follow-Up Management ERD. This diagram shows how overdue/defaulting schedules are connected to BHW follow-up tasks, visit logs, notifications, and midwife review.

Figure 3.X. SMS Reminder and OTP Caregiver Access ERD. This diagram shows caregiver contact records, SMS reminder logs, OTP login records, and the infant schedule/vaccination records used for digital card access.

Figure 3.X. DBSCAN and Geospatial Hotspot Monitoring ERD. This diagram shows infant coordinates, DBSCAN cluster results, cluster members, BHW hotspot assignments, deployment reports, and spatial DSS snapshots.

Figure 3.X. Reports, Audit Trail, and Backup/Recovery ERD. This diagram shows report export tracking, M1 target/monitoring data, audit logs, system settings, and backup run history.

## Relationship Notes

### 1. Authentication, RBAC, and Personnel Management

Enforced by foreign key:
- `users.created_by_user_id -> users.id`
- `user_barangay_assignments.user_id -> users.id`
- `user_barangay_assignments.barangay_id -> barangays.id`
- `user_barangay_assignments.assigned_by -> users.id`
- `notifications.recipient_user_id -> users.id`
- `notifications.sender_user_id -> users.id`
- `system_settings.updated_by -> users.id`

Logical only; FK not enforced:
- `users.assigned_barangay -> barangays.name`
- `notifications.recipient_barangay -> barangays.name`

Documentation warning:
- `users.role` is used for RBAC. No separate `roles`, `permissions`, `role_permissions`, or `user_roles` table exists in the inspected PostgreSQL schema.

### 2. Infant Registration and Caregiver Profiling

Enforced by foreign key:
- `user_barangay_assignments.user_id -> users.id`
- `user_barangay_assignments.barangay_id -> barangays.id`
- `user_barangay_assignments.assigned_by -> users.id`
- `caregivers.enrolled_by -> users.id`
- `infants.caregiver_id -> caregivers.id`
- `infants.created_by -> users.id`
- `infant_registrations.created_by -> users.id`
- `infant_registrations.reviewed_by -> users.id`
- `infant_registrations.promoted_infant_id -> infants.id`

Logical only; FK not enforced:
- `infant_registrations.barangay -> barangays.name`
- `infants.barangay -> barangays.name`
- Caregiver details inside `infant_registrations.registration_data` are JSONB values and are not enforced as caregiver foreign keys.

Documentation warning:
- Draft and pending validation data is held in `infant_registrations.registration_data`; the approved master registry is `infants`.

### 3. Registration Validation and Master Infant Registry

Enforced by foreign key:
- `infant_registrations.created_by -> users.id`
- `infant_registrations.reviewed_by -> users.id`
- `infant_registrations.promoted_infant_id -> infants.id`
- `registration_validation_events.registration_id -> infant_registrations.id`
- `registration_validation_events.reviewer_user_id -> users.id`
- `infants.approved_registration_id -> infant_registrations.id`
- `approval_audit.registration_id -> infant_registrations.id`
- `approval_audit.infant_id -> infants.id`

Logical only; FK not enforced:
- `approval_audit.approver_id -> users.id`
- `audit_trail.user_id -> users.id`
- `audit_trail.entity_id -> referenced business record`

Needs verification:
- `infant_transfer_events` exists in `server/migrations/20260607_create_infant_transfer_events.sql`, but it was not present in the inspected live PostgreSQL table list. It is intentionally not included as an active ERD table.

Documentation warning:
- `infant_registrations.promoted_infant_id` and `infants.approved_registration_id` form a bidirectional/circular registration-to-infant reference. This documents promotion from registration workflow to master infant registry.

### 4. NIP Schedule and Vaccination Recording

Enforced by foreign key:
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

Logical only; FK not enforced:
- `infant_schedules.vaccine_code -> doh_compliance_rules.vaccine_code`
- `vaccinations.vaccine_code -> doh_compliance_rules.vaccine_code`
- `schedule_overrides.midwife_id -> users.id`
- `schedule_deferrals.deferred_by -> users.id`

Documentation warning:
- Vaccine code matching is handled logically/application-side, not through a declared FK to `doh_compliance_rules`.

### 5. Defaulter Tracking and Follow-Up Management

Enforced by foreign key:
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

Logical only; FK not enforced:
- `infants.barangay -> barangays.name`
- `follow_up_tasks.barangay -> barangays.name`
- `follow_up_logs.barangay -> barangays.name`
- `notifications.recipient_barangay -> barangays.name`

Documentation warning:
- Defaulter status is derived from `infant_schedules.status` and `infants.immunization_status`.

### 6. SMS Reminder and OTP Caregiver Access

Enforced by foreign key:
- `caregivers.enrolled_by -> users.id`
- `infants.caregiver_id -> caregivers.id`
- `sms_logs.caregiver_id -> caregivers.id`
- `sms_logs.infant_id -> infants.id`
- `sms_logs.sent_by -> users.id`
- `otp_records.caregiver_id -> caregivers.id`
- `infant_schedules.infant_id -> infants.id`
- `vaccinations.infant_id -> infants.id`
- `vaccinations.schedule_id -> infant_schedules.id`

Logical only; FK not enforced:
- `otp_records.mobile_number -> caregivers.mobile_number`
- `sms_logs.mobile_number -> caregivers.mobile_number`
- `infants.caregiver_phone -> caregivers.mobile_number`

Documentation warning:
- OTP records are tied to caregivers by `caregiver_id`; phone-number matching is a logical lookup.

### 7. DBSCAN and Geospatial Hotspot Monitoring

Enforced by foreign key:
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

Logical only; FK not enforced:
- `infants.barangay -> barangays.name`
- `dbscan_cluster_results.barangay -> barangays.name`
- `cluster_assignments.barangay -> barangays.name`
- `deployment_reports.barangay -> barangays.name`
- `spatial_dss_monthly_snapshots.barangay -> barangays.name`

Documentation warning:
- DBSCAN membership is enforced through `dbscan_cluster_members`.
- PostGIS metadata tables are excluded from this ERD.
- `cluster_assignments` contains both `barangay_id` and text `barangay`; consistency depends on application logic.

### 8. Reports, Audit Trail, and Backup/Recovery

Enforced by foreign key:
- `report_exports.generated_by -> users.id`
- `backup_runs.initiated_by -> users.id`
- `audit_logs.actor_user_id -> users.id`
- `audit_logs.barangay_id -> barangays.id`
- `system_audit_logs.user_id -> users.id`
- `system_settings.updated_by -> users.id`
- `m1_immunization_targets.barangay_id -> barangays.id`
- `m1_immunization_targets.created_by -> users.id`
- `m1_immunization_targets.updated_by -> users.id`
- `m1_monthly_actual_populations.barangay_id -> barangays.id`
- `m1_monthly_actual_populations.created_by -> users.id`
- `m1_monthly_actual_populations.updated_by -> users.id`
- `m1_municipal_targets.created_by -> users.id`
- `m1_municipal_targets.updated_by -> users.id`

Logical only; FK not enforced:
- `audit_trail.user_id -> users.id`
- `audit_trail.entity_id -> referenced business record`
- `audit_logs.target_record_id -> referenced business record`
- `system_audit_logs.target_id -> referenced business record`
- `m1_doh_monitoring_data.barangay -> barangays.name`
- `spatial_dss_monthly_snapshots.barangay -> barangays.name`

Documentation warning:
- Multiple audit tables exist because they serve different scopes: clinical workflow (`audit_trail`), structured governance (`audit_logs`), admin/system events (`system_audit_logs`), approval decisions (`approval_audit`), and authorization decisions (`authorization_audit`).

