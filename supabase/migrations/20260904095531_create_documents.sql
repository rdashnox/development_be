-- =====================================================
-- SBIMS Document Management (FR-09)
-- =====================================================
--
-- Stores metadata for internship-related documents.
-- Actual files are stored in the private
-- "internship-documents" Supabase Storage bucket.
--
-- Version control is intentionally NOT implemented.
-- Re-uploading a rejected document updates the same
-- document record instead of creating a document history.
-- =====================================================


-- =====================================================
-- Documents Table
-- =====================================================

create table public.documents (

    id uuid primary key
        default gen_random_uuid(),

    internship_id uuid not null
        references public.internships(id)
        on delete cascade,

    document_type text not null,

    file_name text not null,

    storage_path text not null
        unique,

    mime_type text not null,

    file_size bigint not null,

    status text not null
        default 'pending',

    uploaded_by uuid not null
        references public.profiles(id)
        on delete restrict,

    uploaded_at timestamptz not null
        default now(),

    reviewed_by uuid
        references public.profiles(id)
        on delete set null,

    reviewed_at timestamptz,

    rejection_reason text,

    created_at timestamptz not null
        default now(),

    updated_at timestamptz not null
        default now(),


    -- -------------------------------------------------
    -- Document Type
    -- -------------------------------------------------

    constraint documents_document_type_check
        check (
            document_type in (
                'endorsement',
                'agreement',
                'resume',
                'consent',
                'internship_report',
                'other'
            )
        ),


    -- -------------------------------------------------
    -- Document Status
    -- -------------------------------------------------

    constraint documents_status_check
        check (
            status in (
                'pending',
                'approved',
                'rejected'
            )
        ),


    -- -------------------------------------------------
    -- File Size
    -- Maximum: 10 MiB
    -- -------------------------------------------------

    constraint documents_file_size_check
        check (
            file_size > 0
            and file_size <= 10485760
        ),


    -- -------------------------------------------------
    -- File Name
    -- -------------------------------------------------

    constraint documents_file_name_length_check
        check (
            length(file_name) between 1 and 255
        ),


    -- -------------------------------------------------
    -- One Document Type per Internship
    -- -------------------------------------------------

    constraint documents_internship_document_type_unique
        unique (
            internship_id,
            document_type
        ),


    -- -------------------------------------------------
    -- Review State Consistency
    -- -------------------------------------------------

    constraint documents_review_state_check
        check (
            (
                status = 'pending'
                and reviewed_by is null
                and reviewed_at is null
                and rejection_reason is null
            )
            or
            (
                status = 'approved'
                and reviewed_by is not null
                and reviewed_at is not null
                and rejection_reason is null
            )
            or
            (
                status = 'rejected'
                and reviewed_by is not null
                and reviewed_at is not null
                and rejection_reason is not null
                and length(trim(rejection_reason)) > 0
            )
        )
);


-- =====================================================
-- Indexes
-- =====================================================

create index documents_internship_id_idx
on public.documents(internship_id);

create index documents_uploaded_by_idx
on public.documents(uploaded_by);

create index documents_status_idx
on public.documents(status);


-- =====================================================
-- Row Level Security
-- =====================================================
--
-- The backend uses supabaseAdmin/service_role for
-- document operations and performs resource-level
-- authorization in DocumentService.
--
-- RLS remains enabled so direct client access does not
-- bypass the backend authorization layer.
-- =====================================================

alter table public.documents
enable row level security;


-- =====================================================
-- Updated Timestamp
-- =====================================================

drop trigger if exists documents_updated_at_trigger
on public.documents;

create trigger documents_updated_at_trigger

before update

on public.documents

for each row

execute function public.update_updated_at_column();


-- =====================================================
-- Service Role Access
-- =====================================================

grant all privileges
on table public.documents
to service_role;


-- =====================================================
-- Private Storage Bucket
-- =====================================================
--
-- Files are never exposed through a public bucket URL.
-- The backend generates short-lived signed URLs after
-- performing authorization.
-- =====================================================

insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'internship-documents',
    'internship-documents',
    false,
    10485760,
    array[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png'
    ]
)
on conflict (id) do update
set
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = excluded.allowed_mime_types;


-- =====================================================
-- Storage Access
-- =====================================================
--
-- No authenticated-user storage policies are created.
-- This intentionally prevents direct browser access.
--
-- The backend uses the Supabase service role to upload,
-- replace, delete, and generate signed URLs.
-- =====================================================