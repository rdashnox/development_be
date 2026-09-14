-- =====================================================
-- SBIMS Evaluation Management Revision
-- =====================================================
--
-- Adds:
-- 1. Faculty Adviser evaluations
-- 2. Administrator read access
-- 3. Faculty Adviser read/manage access
-- 4. Read-only Internship Coordinator access
--
-- The existing evaluation lifecycle remains:
-- draft -> submitted
--
-- Final internship eligibility is enforced by the API
-- service through InternshipEligibilityService.
-- =====================================================


-- =====================================================
-- Evaluation Type
-- =====================================================

alter table public.evaluations
drop constraint if exists evaluations_type_check;

alter table public.evaluations
add constraint evaluations_type_check
check (
    evaluation_type in (
        'hte_supervisor',
        'faculty_adviser'
    )
);


-- =====================================================
-- HTE Supervisor Insert Policy
-- =====================================================

drop policy if exists "hte supervisors can create assigned evaluations"
on public.evaluations;

create policy "hte supervisors can create assigned evaluations"
on public.evaluations
for insert
to authenticated
with check (
    evaluator_id = auth.uid()
    and evaluation_type = 'hte_supervisor'
    and exists (
        select 1
        from public.internships i
        join public.hte_profiles h
            on h.id = i.hte_id
        join public.profiles p
            on p.id = auth.uid()
        where i.id = evaluations.internship_id
        and h.supervisor_id = auth.uid()
        and p.role = 'hte_supervisor'
        and p.is_active = true
    )
);


-- =====================================================
-- HTE Supervisor Update Policy
-- =====================================================

drop policy if exists "hte supervisors can update own draft evaluations"
on public.evaluations;

create policy "hte supervisors can update own draft evaluations"
on public.evaluations
for update
to authenticated
using (
    evaluator_id = auth.uid()
    and evaluation_type = 'hte_supervisor'
    and status = 'draft'
    and exists (
        select 1
        from public.internships i
        join public.hte_profiles h
            on h.id = i.hte_id
        join public.profiles p
            on p.id = auth.uid()
        where i.id = evaluations.internship_id
        and h.supervisor_id = auth.uid()
        and p.role = 'hte_supervisor'
        and p.is_active = true
    )
)
with check (
    evaluator_id = auth.uid()
    and evaluation_type = 'hte_supervisor'
    and exists (
        select 1
        from public.internships i
        join public.hte_profiles h
            on h.id = i.hte_id
        join public.profiles p
            on p.id = auth.uid()
        where i.id = evaluations.internship_id
        and h.supervisor_id = auth.uid()
        and p.role = 'hte_supervisor'
        and p.is_active = true
    )
);


-- =====================================================
-- Faculty Adviser Select Policy
-- =====================================================

create policy "faculty advisers can view assigned evaluations"
on public.evaluations
for select
to authenticated
using (
    exists (
        select 1
        from public.internships i
        join public.profiles p
            on p.id = auth.uid()
        where i.id = evaluations.internship_id
        and i.faculty_adviser_id = auth.uid()
        and p.role = 'faculty_adviser'
        and p.is_active = true
    )
);


-- =====================================================
-- Faculty Adviser Insert Policy
-- =====================================================

create policy "faculty advisers can create assigned evaluations"
on public.evaluations
for insert
to authenticated
with check (
    evaluator_id = auth.uid()
    and evaluation_type = 'faculty_adviser'
    and exists (
        select 1
        from public.internships i
        join public.profiles p
            on p.id = auth.uid()
        where i.id = evaluations.internship_id
        and i.faculty_adviser_id = auth.uid()
        and p.role = 'faculty_adviser'
        and p.is_active = true
    )
);


-- =====================================================
-- Faculty Adviser Update Policy
-- =====================================================

create policy "faculty advisers can update own draft evaluations"
on public.evaluations
for update
to authenticated
using (
    evaluator_id = auth.uid()
    and evaluation_type = 'faculty_adviser'
    and status = 'draft'
    and exists (
        select 1
        from public.internships i
        join public.profiles p
            on p.id = auth.uid()
        where i.id = evaluations.internship_id
        and i.faculty_adviser_id = auth.uid()
        and p.role = 'faculty_adviser'
        and p.is_active = true
    )
)
with check (
    evaluator_id = auth.uid()
    and evaluation_type = 'faculty_adviser'
    and exists (
        select 1
        from public.internships i
        join public.profiles p
            on p.id = auth.uid()
        where i.id = evaluations.internship_id
        and i.faculty_adviser_id = auth.uid()
        and p.role = 'faculty_adviser'
        and p.is_active = true
    )
);


-- =====================================================
-- Internship Coordinator Read-Only Policy
-- =====================================================

drop policy if exists "coordinators can manage evaluations"
on public.evaluations;

create policy "coordinators can view evaluations"
on public.evaluations
for select
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
        and p.role = 'internship_coordinator'
        and p.is_active = true
    )
);


-- =====================================================
-- Administrator Read-Only Policy
-- =====================================================

create policy "administrators can view evaluations"
on public.evaluations
for select
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
        and p.role = 'administrator'
        and p.is_active = true
    )
);