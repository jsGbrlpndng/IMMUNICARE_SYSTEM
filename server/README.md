# IMMUNICARE Backend Services

## NIP Schedule Framework

The NIP schedule logic has been refactored into a service-oriented architecture to ensure DOH compliance and data integrity.

### Single Source of Truth
The `nip_schedule` table is now the **single source of truth** for all infant vaccination progress. 
- Do not calculate due dates or statuses manually in controllers.
- Use `NIPScheduleService.getSchedule(infantId)` to retrieve the current state.
- Statuses (Overdue, Due Now, etc.) are automatically recalculated Just-In-Time (JIT) when fetching.

### Service Layer Responsibilities
- **NIPScheduleService**: Manages the persistent schedule. Responsible for generation, status updates, and series/interval adjustments.
- **VaccinationService**: Handles the medical and governance validation for recording a dose. It enforces intervals and age requirements before committing to the database.

### Core Rules
1. **No Manual Calculations**: All NIP logic and interval logic **must** go through `NIPScheduleService` and `VaccinationService`.
2. **Persistent Records**: Schedules are generated at registration. For legacy infants, both the `history` and `nip-schedule` endpoints will automatically trigger a backfill if no persistent records exist.
3. **Integrity**: A unique constraint exists on `(infant_id, vaccine_code, dose_number)` to prevent duplicate entries in the persistent schedule.

### Role-Based Access
- **Clinical Access**: Only `Midwife`, `Nurse`, and `BHW` roles can record vaccinations.
- **Admin**: Admins are explicitly blocked from recording doses through the `clinicalAuth` middleware to preserve medical accountability.
