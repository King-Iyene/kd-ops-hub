-- The 20260428000001_encrypt_account_numbers.sql migration's _private.enc_keys
-- table was missing live (schema existed, table did not) — the encrypt
-- trigger has been silently no-op'ing (RETURN NEW when key lookup is NULL)
-- since that migration ran. Every *_enc shadow column is therefore empty and
-- account numbers keep landing in plaintext columns only. This restores the
-- key table and re-runs the same idempotent backfill from that migration.

CREATE TABLE IF NOT EXISTS _private.enc_keys (
  name       text        PRIMARY KEY,
  value      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON _private.enc_keys FROM PUBLIC, anon, authenticated;

INSERT INTO _private.enc_keys (name, value)
  VALUES ('account_numbers', encode(gen_random_bytes(32), 'hex'))
  ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE
  k text;
  n int;
BEGIN
  SELECT value INTO k FROM _private.enc_keys WHERE name = 'account_numbers';
  IF k IS NULL OR k = '' THEN
    RAISE WARNING 'enc_keys row missing — backfill skipped.';
    RETURN;
  END IF;

  UPDATE public.contractors
    SET account_number_enc = encode(pgp_sym_encrypt(account_number, k), 'base64')
    WHERE account_number IS NOT NULL AND account_number != ''
      AND account_number_enc IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'contractors backfilled: % rows', n;

  UPDATE public.batch_items
    SET account_number_enc = encode(pgp_sym_encrypt(account_number, k), 'base64')
    WHERE account_number IS NOT NULL AND account_number != ''
      AND account_number_enc IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'batch_items backfilled: % rows', n;

  UPDATE public.profiles
    SET bank_account_number_enc = encode(pgp_sym_encrypt(bank_account_number, k), 'base64')
    WHERE bank_account_number IS NOT NULL AND bank_account_number != ''
      AND bank_account_number_enc IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'profiles backfilled: % rows', n;

  UPDATE public.vendors
    SET bank_account_number_enc = encode(pgp_sym_encrypt(bank_account_number, k), 'base64')
    WHERE bank_account_number IS NOT NULL AND bank_account_number != ''
      AND bank_account_number_enc IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'vendors backfilled: % rows', n;

  UPDATE public.contractor_applications
    SET account_number_enc = encode(pgp_sym_encrypt(account_number, k), 'base64')
    WHERE account_number IS NOT NULL AND account_number != ''
      AND account_number_enc IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'contractor_applications backfilled: % rows', n;
END;
$$;
