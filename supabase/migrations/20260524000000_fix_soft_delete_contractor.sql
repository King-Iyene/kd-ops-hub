-- Fix soft_delete_contractor: the function body referenced contractors.name
-- which does not exist. The correct column is full_name.

CREATE OR REPLACE FUNCTION public.soft_delete_contractor(p_contractor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Anonymise all PII. `full_name` is the correct column (not `name`).
  UPDATE public.contractors
  SET
    full_name             = 'Former Contractor',
    first_name            = NULL,
    last_name             = NULL,
    whatsapp_phone        = NULL,
    heyreach_email        = NULL,
    heyreach_password_enc = NULL,
    linkedin_id           = NULL,
    linkedin_url          = NULL,
    notes                 = NULL,
    status                = 'deleted'
  WHERE id = p_contractor_id;

  -- Keep payment history intact — batch rows show "Former Contractor".
  UPDATE public.batch_items
  SET full_name = 'Former Contractor'
  WHERE contractor_id = p_contractor_id;
END;
$$;
