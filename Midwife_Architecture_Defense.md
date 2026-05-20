# ImmuniCare System Defense Blueprint: Midwife Interface & DBSCAN

This document serves as the technical architecture defense for the **Midwife Decision Support System (DSS)** and the **Spatial Risk Analytics Engine**. It is designed for university-level clinical and technical defense.

---

## Section 1: The Midwife Interface Feature Map

The Midwife Interface is a high-performance Clinical Decision Support System (CDSS) designed to optimize municipal immunization coverage through data-driven triage.

| Feature | Frontend Component | Backend API / Service |
| :--- | :--- | :--- |
| **Daily Requisition & Field Kit** | [MidwifeDashboard.jsx](file:///c:/Users/Gabriel/Downloads/Immunicare/client/src/pages/clinical/MidwifeDashboard.jsx) | `/schedule/field-kit` in `server/routes/schedule.js` |
| **Infant Registration (RBAC Override)** | [InfantRegistrationForm.jsx](file:///c:/Users/Gabriel/Downloads/Immunicare/client/src/pages/clinical/InfantRegistrationForm.jsx) | `InfantService.registerInfant` in [InfantService.js](file:///c:/Users/Gabriel/Downloads/Immunicare/server/services/InfantService.js) |
| **NIP Schedule & Safety Locks** | [NIPSchedulePage.jsx](file:///c:/Users/Gabriel/Downloads/Immunicare/client/src/pages/clinical/NIPSchedulePage.jsx) | [EnhancedNIPScheduleEngine.js](file:///c:/Users/Gabriel/Downloads/Immunicare/server/services/EnhancedNIPScheduleEngine.js) |
| **Follow-up Bottlenecks & Defaulters** | [MidwifeDashboard.jsx](file:///c:/Users/Gabriel/Downloads/Immunicare/client/src/pages/clinical/MidwifeDashboard.jsx) | [AnalyticsService.js](file:///c:/Users/Gabriel/Downloads/Immunicare/server/services/AnalyticsService.js) |

---

## Section 2: Algorithmic Deep Dive — DBSCAN

ImmuniCare utilizes **DBSCAN** (Density-Based Spatial Clustering of Applications with Noise) to identify geographic clusters of under-immunized infants. Unlike K-Means, DBSCAN does not require a predefined number of clusters and is highly effective at identifying outliers (Noise).

### The Mathematics

The algorithm operates on two primary parameters:

1.  **Epsilon ($\epsilon$):** Set to **300 meters**. This is the maximum radius search distance for determining neighborhood density. Distances are calculated using the **Haversine Formula**, which accounts for the Earth's curvature:
    $$d = 2R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos\phi_1 \cos\phi_2 \sin^2\left(\frac{\Delta\lambda}{2}\right)}\right)$$
    *Where $\phi$ is latitude, $\lambda$ is longitude, and $R$ is the Earth's radius (6,371 km).*

2.  **MinPts:** Set to **3 infants**. This defines the minimum density required to classify a region as a "Cluster."

#### Point Classification Logic:
-   **Core Point:** An infant whose $\epsilon$-neighborhood contains at least **MinPts** infants.
-   **Border Point:** An infant who is within $\epsilon$ of a Core Point but has fewer than **MinPts** neighbors themselves.
-   **Noise Point:** An isolated infant who is neither a Core Point nor reachable from one. In a clinical context, these represent sporadic defaulters rather than localized outbreaks.

### Implementation Detail

The algorithm is executed in [DBSCANService.js](file:///c:/Users/Gabriel/Downloads/Immunicare/server/services/DBSCANService.js).

```javascript
// server/services/DBSCANService.js (Line 71-86)
for (let i = 0; i < dataset.length; i++) {
    const p = dataset[i];
    if (p.visited) continue;

    p.visited = true;
    const neighbors = getNeighbors(i);

    if (neighbors.length >= this.minPts - 1) { 
        currentCluster++;
        p.clusterId = currentCluster;
        p.isCore = true;
        this._expandCluster(dataset, neighbors, currentCluster, getNeighbors);
    } else {
        p.clusterId = 'NOISE';
    }
}
```

**Frontend Consumption:**
The [MidwifeDashboard.jsx](file:///c:/Users/Gabriel/Downloads/Immunicare/client/src/pages/clinical/MidwifeDashboard.jsx) consumes this data via the `/analytics/map-data` endpoint. The dashboard renders these clusters as **Risk Hotspots** on the Leaflet map, allowing midwives to prioritize home visits to high-density defaulter areas.

---

## Section 3: Clinical Safety & RBAC Integrity

### RBAC Midwife Override Logic
To ensure clinical efficiency, the system implements a "Midwife Override" for infant registration. While BHW (Barangay Health Worker) submissions are held in a `PENDING` validation queue, registrations performed by clinical staff are automatically approved.

**File:** [InfantService.js](file:///c:/Users/Gabriel/Downloads/Immunicare/server/services/InfantService.js)
**Lines:** 239–245

```javascript
const normalizedRole = userRole ? userRole.toUpperCase() : '';
const isClinicalUser = ['MIDWIFE', 'NURSE', 'ADMIN'].includes(normalizedRole);
let finalStatus = infantData.registration_status || (isClinicalUser ? 'APPROVED' : 'PENDING');
```

### Clinical Date Math (Timeline Safety Locks)
ImmuniCare enforces strict DOH (Department of Health) interval protocols to prevent premature vaccinations, which can compromise vaccine efficacy.

1.  **UI Level Lock:** The "Record Dose" button is disabled if the current date is before the `earliest_allowed_date`.
    **File:** [NIPSchedulePage.jsx](file:///c:/Users/Gabriel/Downloads/Immunicare/client/src/pages/clinical/NIPSchedulePage.jsx) (Lines 258–273)
    ```javascript
    const allowedDate = item?.earliest_allowed_date;
    const isPremature = allowedDate && new Date() < new Date(allowedDate);
    // ... button disabled={isPremature}
    ```

2.  **Modal Validation (Hard Stop):** The system enforces a **Clinical Hard Stop** for administrations attempted more than 4 days before the due date.
    **File:** [RecordVaccinationModal.jsx](file:///c:/Users/Gabriel/Downloads/Immunicare/client/src/components/RecordVaccinationModal.jsx) (Lines 67–69)
    ```javascript
    const daysDiff = getDaysDiff(recordForm.administered_date, selectedVaccine?.dueDate);
    const isHardStop = daysDiff <= -5; // BLOCK action if early by 5+ days
    ```

---
**END OF DEFENSE BLUEPRINT**
