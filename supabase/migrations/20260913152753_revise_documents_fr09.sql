-- =====================================================
-- SBIMS FR-09 Document Prototype Revision
-- =====================================================
--
-- Prototype-required document types:
--   1. signed_internship_agreement = Signed Internship Agreement
--   2. fit_to_work                  = Fit-to-Work Certificate
--   3. consent                      = Consent Form
--
-- This migration does NOT create a document-requirements
-- subsystem. The three types are simply supported document
-- types for the prototype.
--
-- Review remains a lightweight manual workflow:
--   pending -> approved
--   pending -> rejected -> re-upload -> pending
--
-- Only the Internship Coordinator is an application-level
-- document reviewer. That role restriction is enforced in
-- DocumentService and the API routes.
-- =====================================================

-- -----------------------------------------------------
-- 1. Extend supported document types.
-- -----------------------------------------------------

alter table public.documents
    drop constraint if exists documents_document_type_check;

alter table public.documents
    add constraint documents_document_type_check
    check (
        document_type in (
            'signed_internship_agreement',
            'fit_to_work',
            'consent',
            'endorsement',
            'agreement',
            'resume',
            'internship_report',
            'other'
        )
    );

comment on column public.documents.document_type is
    'Internship document type. Prototype-required types are signed_internship_agreement, fit_to_work, and consent.';

-- -----------------------------------------------------
-- 2. No schema-level reviewer-role constraint is added.
-- -----------------------------------------------------
--
-- The documents table stores reviewed_by as a profile ID.
-- The backend is responsible for verifying that the reviewer
-- is an active internship coordinator.
--
-- This keeps the schema simple and avoids duplicating the
-- application role model in the document table.
-- =====================================================
