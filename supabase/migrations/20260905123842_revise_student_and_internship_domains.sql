-- =====================================================
-- SBIMS Student / Internship Domain Revision
-- =====================================================
--
-- Baseline decisions implemented by this migration:
-- 1. internships.status is the single source of truth.
-- 2. student_profiles.internship_status is removed.
-- 3. Completed internships are historical records.
-- 4. A student may have at most one pending/active
--    internship at a time.
--
-- This migration intentionally does not introduce new
-- internship lifecycle states.
-- =====================================================

-- -----------------------------------------------------
-- 1. Remove the duplicated student internship status.
-- -----------------------------------------------------

drop index if exists student_profiles_status_idx;

alter table public.student_profiles
    drop constraint if exists student_profiles_internship_status_check;

alter table public.student_profiles
    drop column if exists internship_status;

-- -----------------------------------------------------
-- 2. Remove the old one-internship-ever constraint.
-- -----------------------------------------------------

alter table public.internships
    drop constraint if exists internships_student_unique;

-- -----------------------------------------------------
-- 3. Permit historical completed internships while
--    enforcing at most one operational internship.
-- -----------------------------------------------------

create unique index if not exists
internships_one_operational_per_student_idx
on public.internships(student_id)
where status in ('pending', 'active');

-- -----------------------------------------------------
-- 4. Supporting index for current internship lookups.
-- -----------------------------------------------------

create index if not exists
internships_student_status_idx
on public.internships(student_id, status);

-- -----------------------------------------------------
-- 5. Document the domain invariant.
-- -----------------------------------------------------

comment on table public.internships is
'Internship records are historical. internships.status is the single source of truth for internship lifecycle. A student may have multiple completed records but at most one pending or active record.';
