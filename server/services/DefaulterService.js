const db = require('../db');
const { MIN_CLUSTER_INFANTS, OPEN_URGENT_TASK_STATUSES } = require('../constants/domain');

class DefaulterService {
    /**
     * Standardized method to fetch and sort defaulters for a given barangay.
     * Restricts results to 'Active' infants with overdue schedules (status = 'DEFAULTER').
     * Sorts descending by days_overdue.
     * 
     * @param {string} barangayName 
     * @param {string|null} bhwId Optional BHW ID to restrict cluster assignments
     * @param {number} limit Maximum number of records to return
     * @returns {Promise<Array>}
     */
    static async getDefaulterList(barangayName, bhwId = null, limit = 250) {
        const query = `
            WITH schedule_urgency AS (
              SELECT 
                  i.id,
                  i.id AS infant_id,
                  i.reference_id,
                  i.first_name,
                  i.middle_name,
                  i.last_name,
                  i.dob,
                  i.barangay,
                  i.purok,
                  i.purok AS sitio,
                  i.current_address,
                  i.exact_address,
                  i.exact_address AS street_address,
                  i.landmark,
                  i.caregiver_phone,
                  i.caregiver_relationship,
                  i.registration_status,
                  'DEFAULTER'::varchar AS status,
                  'DEFAULTER'::varchar AS follow_up_status,
                  MIN(s.recommended_date)::date AS earliest_recommended_date,
                  COUNT(DISTINCT s.id)::int AS due_vaccine_count,
                  STRING_AGG(DISTINCT COALESCE(s.vaccine_name, s.vaccine_code), ', ') AS due_vaccines,
                  (ARRAY_AGG(s.id ORDER BY CASE s.status WHEN 'DEFAULTER' THEN 0 ELSE 1 END, s.recommended_date ASC))[1] AS missing_schedule_id,
                  (ARRAY_AGG(s.vaccine_code ORDER BY CASE s.status WHEN 'DEFAULTER' THEN 0 ELSE 1 END, s.recommended_date ASC))[1] AS missing_vaccine_code,
                  (ARRAY_AGG(COALESCE(s.vaccine_name, s.vaccine_code) ORDER BY CASE s.status WHEN 'DEFAULTER' THEN 0 ELSE 1 END, s.recommended_date ASC))[1] AS missing_vaccine_name,
                  (ARRAY_AGG(s.dose_number ORDER BY CASE s.status WHEN 'DEFAULTER' THEN 0 ELSE 1 END, s.recommended_date ASC))[1] AS missing_dose_number
              FROM infants i
              JOIN infant_schedules s ON s.infant_id = i.id
              LEFT JOIN vaccinations v 
                ON v.schedule_id = s.id 
                OR (
                   v.infant_id = s.infant_id 
                   AND v.vaccine_code = s.vaccine_code 
                   AND v.dose_number = s.dose_number 
                   AND v.validation_status = 'VALIDATED'
                )
              WHERE i.status = 'Active'
                AND s.status = 'DEFAULTER'
                AND v.id IS NULL
              GROUP BY 
                  i.id, i.reference_id, i.first_name, i.middle_name, i.last_name, i.dob, 
                  i.barangay, i.purok, i.current_address, i.exact_address, i.landmark,
                  i.caregiver_phone, i.caregiver_relationship, i.registration_status
            ),
            latest_logs AS (
                SELECT DISTINCT ON (infant_id)
                    infant_id,
                    visit_date AS last_visit_date,
                    outcome AS last_visit_outcome,
                    notes AS latest_log_notes
                FROM follow_up_logs
                ORDER BY infant_id, created_at DESC
            ),
            infants AS (
                SELECT
                    su.*,
                    bhw.id AS assigned_bhw_id,
                    bhw.full_name AS assigned_bhw_name,
                    bhw.assigned_barangay AS assigned_bhw_barangay,
                    ll.last_visit_date,
                    ll.last_visit_outcome,
                    ll.latest_log_notes,
                    cluster_assignment.id AS cluster_assignment_id,
                    cluster_assignment.cluster_label,
                    cluster_assignment.status AS cluster_status,
                    cluster_assignment.assigned_bhw_id AS assigned_cluster_bhw_id,
                    cluster_assignment.assigned_cluster_bhw_role AS assigned_cluster_bhw_role,
                    cluster_assignment.assigned_cluster_bhw_name AS assigned_cluster_bhw_name,
                    delegated_task.assigned_by_midwife_id AS assigned_by_midwife_id,
                    delegated_task.assigned_task_bhw_name AS delegated_task_bhw_name,
                    delegated_task.task_status AS task_status
                FROM schedule_urgency su
                LEFT JOIN LATERAL (
                    SELECT id, full_name, assigned_barangay
                    FROM users
                    WHERE role = 'BHW'
                      AND is_active = TRUE
                      AND UPPER(TRIM(assigned_barangay)) = UPPER(TRIM(su.barangay))
                    ORDER BY full_name ASC, id ASC
                    LIMIT 1
                ) bhw ON TRUE
                LEFT JOIN latest_logs ll ON ll.infant_id = su.infant_id
                LEFT JOIN LATERAL (
                    SELECT
                        ca.id,
                        ca.cluster_label,
                        ca.status,
                        ca.assigned_bhw_id,
                        u.role AS assigned_cluster_bhw_role,
                        u.full_name AS assigned_cluster_bhw_name
                    FROM cluster_assignment_members cam
                    JOIN cluster_assignments ca ON ca.id = cam.assignment_id
                    LEFT JOIN users u ON u.id = ca.assigned_bhw_id
                    WHERE cam.infant_id = su.infant_id
                      AND ca.status IN ('Pending', 'In Progress')
                      AND UPPER(TRIM(ca.barangay)) = UPPER(TRIM(su.barangay))
                      AND (
                          SELECT COUNT(*)::int
                          FROM cluster_assignment_members cam_count
                          WHERE cam_count.assignment_id = ca.id
                      ) >= ?
                    ORDER BY ca.updated_at DESC
                    LIMIT 1
                ) cluster_assignment ON TRUE
                LEFT JOIN LATERAL (
                    SELECT
                        ft.id AS delegated_task_id,
                        ft.assigned_to_bhw_id AS delegated_task_bhw_id,
                        task_bhw.full_name AS assigned_task_bhw_name,
                        ft.assigned_by_midwife_id,
                        ft.status AS task_status
                    FROM follow_up_tasks ft
                    LEFT JOIN users task_bhw ON task_bhw.id = ft.assigned_to_bhw_id
                    WHERE ft.infant_id = su.infant_id
                      AND ft.status = ANY(?)
                      AND ft.assigned_by_midwife_id IS NOT NULL
                      ${bhwId ? 'AND ft.assigned_to_bhw_id = ?' : ''}
                    ORDER BY ft.updated_at DESC
                    LIMIT 1
                ) delegated_task ON TRUE
            )
            SELECT *, (CURRENT_DATE - earliest_recommended_date)::int as days_overdue
            FROM infants 
            WHERE status = 'DEFAULTER' 
            AND UPPER(TRIM(barangay)) = UPPER(TRIM(?))
            ORDER BY days_overdue DESC
            LIMIT ?
        `;
        const params = [MIN_CLUSTER_INFANTS, OPEN_URGENT_TASK_STATUSES];
        if (bhwId) params.push(bhwId);
        params.push(barangayName);
        params.push(Number(limit) || 250);

        const [rows] = await db.execute(query, params);
        return rows;
    }
}

module.exports = DefaulterService;
