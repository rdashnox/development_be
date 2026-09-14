-- =====================================================
-- SBIMS Audit Logging (FR-11)
-- Audit trail and accountability mechanism.
-- =====================================================

create table public.audit_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.profiles(id) on delete set null,
    action text not null check (length(trim(action)) > 0),
    resource_type text not null check (length(trim(resource_type)) > 0),
    resource_id text,
    details jsonb not null default '{}'::jsonb,
    ip_address text,
    created_at timestamptz not null default now()
);

create index audit_logs_user_id_idx on public.audit_logs(user_id);
create index audit_logs_action_idx on public.audit_logs(action);
create index audit_logs_resource_idx on public.audit_logs(resource_type, resource_id);
create index audit_logs_created_at_idx on public.audit_logs(created_at desc);

alter table public.audit_logs enable row level security;

-- No authenticated-client INSERT/UPDATE/DELETE policies are exposed.
-- Backend writes and reads audit records using the service-role client.
grant all privileges on table public.audit_logs to service_role;

comment on table public.audit_logs is
'SBIMS FR-11 audit trail for important successful state-changing actions.';

comment on column public.audit_logs.user_id is
'Authenticated actor. Nullable so audit history survives account deletion.';

comment on column public.audit_logs.action is
'Controlled application action name.';

comment on column public.audit_logs.resource_type is
'Logical resource affected by the action.';

comment on column public.audit_logs.resource_id is
'Identifier of the affected resource when applicable.';

comment on column public.audit_logs.details is
'Small non-sensitive JSON context relevant to the audit event.';

comment on column public.audit_logs.ip_address is
'Client IP address when available.';

comment on column public.audit_logs.created_at is
'Database-generated audit event timestamp.';
