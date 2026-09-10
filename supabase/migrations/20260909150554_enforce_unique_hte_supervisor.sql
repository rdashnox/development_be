-- Enforce the SBIMS business rule:
-- one HTE supervisor account may be assigned to only one HTE.
--
-- NULL supervisor_id values are allowed, so an HTE may temporarily
-- have no supervisor assigned.

ALTER TABLE public.hte_profiles
ADD CONSTRAINT hte_profiles_supervisor_id_unique
UNIQUE (supervisor_id);
