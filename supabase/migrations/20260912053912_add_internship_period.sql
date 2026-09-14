-- =====================================================
-- SBIMS Internship Management (FR-05)
-- Internship Period
-- =====================================================

alter table public.internships
add column start_date date;

alter table public.internships
add column end_date date;

alter table public.internships
add constraint internships_date_range_check
check (
    start_date is null
    or end_date is null
    or start_date < end_date
);

create index internships_start_date_idx
on public.internships(start_date);

create index internships_end_date_idx
on public.internships(end_date);

comment on column public.internships.start_date is
'First date of the internship period. Required for newly created internship records.';

comment on column public.internships.end_date is
'Last date of the internship period. Required for newly created internship records.';