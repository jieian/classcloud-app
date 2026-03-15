# Permissions Redesign Plan

## Context

The current 10-permission system has three problems:
1. **Naming is inconsistent** — some use `access_X`, some `full/partial_access_X`. The pattern should be uniform: `full_access_X` vs `limited_access_X`, with specific action names for specialized permissions.
2. **Some permissions are too broad** — `access_user_management` bundles user CRUD and role CRUD together. `access_reports` can't support the 5 distinct views the Reports module needs.
3. **Subject Teachers have no permission** — they can't access Classes or Subjects even though they need to view their assigned sections and academic load.

This plan does a clean rename + restructure in the DB and codebase. Most changes are renames with no behavior change; new behavior only for `limited_access_subjects` and the subject-teacher Classes view.

---

## Old → New Mapping (10 → 16 permissions)

| Old Name | New Name | Change Type |
|---|---|---|
| `access_user_management` | `full_access_user_management` | Rename (users half) |
| _(bundled above)_ | `full_access_role_management` | **Split out** (roles half) |
| `access_year_management` | `full_access_school_year` | Rename |
| `access_faculty_management` | `full_access_faculty` | Rename |
| `access_subject_management` | `full_access_subjects` | Rename |
| _(missing)_ | `limited_access_subjects` | **New** — teachers view assigned subjects + request load |
| `access_classes_management` | `full_access_classes` | Rename |
| `full_access_student_management` | `full_access_students` | Rename |
| `partial_access_student_management` | `limited_access_students` | Rename |
| `full_access_examinations` | `full_access_examinations` | **Unchanged** |
| `partial_access_examinations` | `limited_access_examinations` | Rename |
| `access_reports` | `view_all_reports` | Rename (reports split into 5) |
| _(missing)_ | `view_assigned_reports` | **New** — view own/assigned reports only |
| _(missing)_ | `monitor_grade_level_reports` | **New** — GL Coordinator checklist |
| _(missing)_ | `monitor_subject_reports` | **New** — Subject Coordinator checklist |
| _(missing)_ | `approve_reports` | **New** — Principal final sign-off |

> **Note:** `access_school_management` does not exist as a DB permission. The NavBar already derives school hub access from individual module permissions. No action needed.

---

## Permission Descriptions

| Permission | Who | What They Can Do |
|---|---|---|
| `full_access_user_management` | Admin | View, create, approve/activate, edit, delete all user accounts |
| `full_access_role_management` | Admin | View, create, edit (permissions), delete all roles |
| `full_access_school_year` | Admin | View, create, edit (active year/quarter), delete school years |
| `full_access_faculty` | Admin | View faculty, add faculty, assign advisory class, manage academic loads, manage coordinators, approve/reject load requests, delete faculty |
| `full_access_subjects` | Admin | Manage curriculum (SSES + Regular). View, create, edit, delete subjects |
| `limited_access_subjects` | Class Adviser, Subject Teacher | View subjects assigned to them (academic load) and what they coordinate/monitor; request academic load |
| `full_access_classes` | Admin | View all sections, create, edit (name/adviser/subject teachers), delete sections |
| `full_access_students` | Admin | Add/batch-import/download roster/edit/delete students on ALL sections; transfers executed immediately, no approval needed |
| `limited_access_students` | Class Adviser, Subject Teacher | Advisory class: full student ops. Non-advisory assigned sections: download roster only. Transfers require approval |
| `full_access_examinations` | Admin | View all exams, create, edit (name/objectives/answer key), scan papers, review papers — across all teachers |
| `limited_access_examinations` | Class Adviser, Subject Teacher | Same capabilities as full, but scoped to exams they created |
| `view_all_reports` | Admin, Principal | View all submitted reports |
| `view_assigned_reports` | Class Adviser, Subject Teacher | View only reports they submitted or for subjects they handle |
| `monitor_grade_level_reports` | Grade Level Coordinator | Checklist view: has each subject in their grade level submitted a report? |
| `monitor_subject_reports` | Subject Coordinator | Checklist view: has each class/grade level for their subject group submitted a report? |
| `approve_reports` | Principal | Final sign-off and marking reports as done/approved |

---

## Role → Permission Matrix

| Permission | Admin | Class Adviser | Subject Teacher | GL Coordinator | Subj. Coordinator | Principal |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `full_access_user_management` | ✓ | | | | | |
| `full_access_role_management` | ✓ | | | | | |
| `full_access_school_year` | ✓ | | | | | |
| `full_access_faculty` | ✓ | | | | | |
| `full_access_subjects` | ✓ | | | | | |
| `limited_access_subjects` | | ✓ | ✓ | | | |
| `full_access_classes` | ✓ | | | | | |
| `full_access_students` | ✓ | | | | | |
| `limited_access_students` | | ✓ | ✓ | | | |
| `full_access_examinations` | ✓ | | | | | |
| `limited_access_examinations` | | ✓ | ✓ | | | |
| `view_all_reports` | ✓ | | | | | ✓ |
| `view_assigned_reports` | | ✓ | ✓ | | | |
| `monitor_grade_level_reports` | | | | ✓ | | |
| `monitor_subject_reports` | | | | | ✓ | |
| `approve_reports` | | | | | | ✓ |

> **Multi-role:** Permissions union across all a user's roles. A teacher who is also a GL Coordinator would hold `limited_access_subjects` + `limited_access_students` + `limited_access_examinations` + `view_assigned_reports` + `monitor_grade_level_reports`.
>
> **GL & Subject Coordinator:** Future roles — permissions defined now so they can be wired up when the Reports module is built.
>
> **Principal:** Gets `view_all_reports` + `approve_reports`. Does NOT get `full_access_examinations` or management permissions (those are ICT Admin's domain) unless configured otherwise.

---

## DB Migration (Supabase SQL)

> `role_permissions` uses `permission_id` FK, so renaming a permission's `name` string does not break FK relationships — only code string references need updating.

```sql
-- STEP 1: Rename existing permissions (FK rows in role_permissions stay intact)
UPDATE permissions SET name = 'full_access_user_management' WHERE name = 'access_user_management';
UPDATE permissions SET name = 'full_access_school_year'     WHERE name = 'access_year_management';
UPDATE permissions SET name = 'full_access_faculty'         WHERE name = 'access_faculty_management';
UPDATE permissions SET name = 'full_access_subjects'        WHERE name = 'access_subject_management';
UPDATE permissions SET name = 'full_access_classes'         WHERE name = 'access_classes_management';
UPDATE permissions SET name = 'full_access_students'        WHERE name = 'full_access_student_management';
UPDATE permissions SET name = 'limited_access_students'     WHERE name = 'partial_access_student_management';
UPDATE permissions SET name = 'limited_access_examinations' WHERE name = 'partial_access_examinations';
UPDATE permissions SET name = 'view_all_reports'            WHERE name = 'access_reports';

-- STEP 2: Add new permissions
INSERT INTO permissions (name, description) VALUES
  ('full_access_role_management',    'View, create, edit permissions on, and delete roles'),
  ('limited_access_subjects',        'View assigned subjects (academic load) and what they coordinate; request academic load'),
  ('view_assigned_reports',          'View only reports submitted by the user or for subjects they handle'),
  ('monitor_grade_level_reports',    'Grade Level Coordinator: checklist view of report submission status for their grade level'),
  ('monitor_subject_reports',        'Subject Coordinator: checklist view of report submission status for their subject groups across grade levels'),
  ('approve_reports',                'Principal: final sign-off and approval of submitted reports');

-- STEP 3: Grant full_access_role_management to any role that already has full_access_user_management
-- (Run this AFTER step 1 so the name 'full_access_user_management' resolves correctly)
INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p_role.id
FROM role_permissions rp
JOIN permissions p_user ON rp.permission_id = p_user.id AND p_user.name = 'full_access_user_management'
JOIN permissions p_role ON p_role.name = 'full_access_role_management'
ON CONFLICT DO NOTHING;
```

---

## Code Changes

### Rename pattern (global find-and-replace)

Run these substitutions across **all** `.ts` / `.tsx` files:

| Old string | New string |
|---|---|
| `"access_user_management"` | `"full_access_user_management"` |
| `"access_year_management"` | `"full_access_school_year"` |
| `"access_faculty_management"` | `"full_access_faculty"` |
| `"access_subject_management"` | `"full_access_subjects"` |
| `"access_classes_management"` | `"full_access_classes"` |
| `"full_access_student_management"` | `"full_access_students"` |
| `"partial_access_student_management"` | `"limited_access_students"` |
| `"partial_access_examinations"` | `"limited_access_examinations"` |
| `"access_reports"` | `"view_all_reports"` |

### Key files that need string renames

- `components/navBar/NavBar.tsx`
- `app/(app)/school/classes/page.tsx`
- `app/(app)/school/classes/[sectionId]/page.tsx`
- `app/(app)/school/classes/transfer-requests/page.tsx` + `TransferRequestsClient.tsx`
- `app/(app)/school/classes/_components/ClassesClient.tsx`
- `app/(app)/school/subjects/page.tsx` + subject sub-pages
- `app/(app)/school/faculty/page.tsx` + faculty sub-pages (if any)
- `app/(app)/reports/page.tsx` + all report sub-pages
- `app/api/classes/**` (all `route.ts` files)
- `app/api/students/**` (all `route.ts` files)
- `app/api/subjects/**` (if exists)
- All other `app/api/**` route files

### NavBar — `components/navBar/NavBar.tsx` (beyond renames)

1. Add `"limited_access_students"` and `"limited_access_subjects"` to the **School** nav item's `requiredPermissions` so Subject Teachers see the School section in the nav.
2. Add `"limited_access_students"` to the **Classes** sublink's `requiredPermissions`.
3. Add a new **Subjects** sublink entry (or extend existing) with `requiredPermissions: ["full_access_subjects", "limited_access_subjects"]`.
4. `canReviewTransfers` — no change needed; the renamed `limited_access_students` is a drop-in.

### New behavior — Subjects page (limited access)

`app/(app)/school/subjects/page.tsx` and its `ProtectedRoute`:
```tsx
// Before
<ProtectedRoute requiredPermissions={["full_access_subjects"]}>
// After
<ProtectedRoute match="any" requiredPermissions={["full_access_subjects", "limited_access_subjects"]}>
```

The page/client component needs an `isLimitedAccess` flag (same pattern as Classes). When `limited_access_subjects`:
- Only show subjects linked to the user's academic load (query `faculty_loads` or equivalent filtered by `user_id`)
- Hide create/edit/delete controls
- Show a "Request Academic Load" action

This requires extending the existing subjects API to accept a `?mode=limited` param that filters by `user_id`.

### New behavior — Classes page (subject teacher view)

`app/api/classes/init/route.ts` already has an `isPartialAccess` branch for `limited_access_students`. Ensure the query returns sections where the user teaches a subject (via `faculty_loads`) — not just sections where they are the adviser. The existing `isPartialAccess` logic may already cover this if `faculty_loads` is queried by `user_id` without filtering on adviser role.

`app/api/classes/[sectionId]/students/route.ts` — GET already permits `limited_access_students`. Mutation routes already enforce the adviser-only check for partial access. No extra changes needed.

---

## Files to Modify (Summary)

| File | What Changes |
|---|---|
| `components/navBar/NavBar.tsx` | All renames + add `limited_access_students`/`limited_access_subjects` to School & sublinks |
| `app/(app)/school/classes/page.tsx` | Renames |
| `app/(app)/school/classes/[sectionId]/page.tsx` | Renames |
| `app/(app)/school/classes/transfer-requests/page.tsx` + client | Renames |
| `app/(app)/school/classes/_components/ClassesClient.tsx` | Renames |
| `app/(app)/school/subjects/page.tsx` | Rename + add `limited_access_subjects` to ProtectedRoute |
| `app/(app)/school/subjects/_components/SubjectsClient.tsx` (or equivalent) | `isLimitedAccess` flag, hide CRUD controls, show request-load action |
| `app/(app)/reports/page.tsx` + sub-pages | Rename `access_reports` → `view_all_reports` |
| `app/(app)/school/*/page.tsx` (year, faculty, user mgmt) | All renames |
| `app/api/classes/**` | All renames |
| `app/api/subjects/**` | Renames + new `?mode=limited` filter branch |
| `app/api/students/**` | All renames |
| `app/api/**/route.ts` (all other routes) | All renames |
| Supabase DB | Run migration SQL above |

---

## Verification

1. **DB check:** `SELECT name FROM permissions ORDER BY name;` — expect 16 rows, no old names.
2. **Admin:** Can access all School, Classes, Subjects, Examinations, and Reports pages. Transfer request badge visible.
3. **Class Adviser:** Sees School > Classes (their advisory section). Sees School > Subjects (their academic load only). Can add students, request transfers. Cannot see other sections.
4. **Subject Teacher:** Sees School > Classes (their assigned sections, read-only roster). Sees School > Subjects (their academic load). No add-student or transfer-request UI. Cannot reach School Year / Faculty pages.
5. **NavBar — Subject Teacher:** School hub visible with only Classes + Subjects sublinks.
6. **Principal:** Sees Reports (all). Approve button visible. Cannot reach user/school management pages.
7. **Reports nav item:** Hidden for users with no report permission (`view_all_reports`, `view_assigned_reports`, `monitor_grade_level_reports`, `monitor_subject_reports`, `approve_reports`).
