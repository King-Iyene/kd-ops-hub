-- Encrypt bank account numbers using pgcrypto + private schema key.
--
-- NDPR compliance: account numbers are personal financial data and must not
-- be stored in plaintext.
--
-- ─── NO MANUAL SETUP REQUIRED ────────────────────────────────────────────────
--
-- A 256-bit encryption key is generated automatically on first run and stored
-- in a locked-down _private schema that only SECURITY DEFINER functions can
-- reach. No ALTER DATABASE, no secrets in env vars.
--
-- ─── ARCHITECTURE ─────────────────────────────────────────────────────────────
--
--   * _private.enc_keys  — holds the auto-generated AES key; inaccessible to
--                          anon / authenticated roles directly.
--   * SECURITY DEFINER functions run as postgres (owner) and can read the key.
--   * Plaintext columns are KEPT so existing app code keeps working; the UI
--     masks them (****NNNN).
--   * Encrypted shadow columns (*_enc) store pgcrypto PGP-encrypted values.
--   * BEFORE INSERT/UPDATE triggers auto-encrypt every write.
--   * get_decrypted_account_number RPC lets admin/finance decrypt on demand.
--
-- ─── AFFECTED TABLES ──────────────────────────────────────────────────────────
--   contractors              → account_number_enc
--   batch_items              → account_number_enc
--   profiles                 → bank_account_number_enc
--   vendors                  → bank_account_number_enc
--   contractor_applications  → account_number_enc
-- ──────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Private schema — inaccessible to app roles ────────────────────────────

CREATE SCHEMA IF NOT EXISTS _private;
REVOKE ALL  ON SCHEMA _private FROM PUBLIC;
REVOKE USAGE ON SCHEMA _private FROM anon;
REVOKE USAGE ON SCHEMA _private FROM authenticated;

CREATE TABLE IF NOT EXISTS _private.enc_keys (
  name       text        PRIMARY KEY,
  value      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON _private.enc_keys FROM PUBLIC, anon, authenticated;

-- Auto-generate a 256-bit key on first run (idempotent).
INSERT INTO _private.enc_keys (name, value)
  VALUES ('account_numbers', encode(gen_random_bytes(32), 'hex'))
  ON CONFLICT (name) DO NOTHING;

-- ── 2. Add encrypted shadow columns ──────────────────────────────────────────

ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS account_number_enc text;

ALTER TABLE public.batch_items
  ADD COLUMN IF NOT EXISTS account_number_enc text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bank_account_number_enc text;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS bank_account_number_enc text;

ALTER TABLE public.contractor_applications
  ADD COLUMN IF NOT EXISTS account_number_enc text;

-- ── 3. Encrypt / decrypt helper functions ─────────────────────────────────────
--
-- SECURITY DEFINER + SET search_path = _private, public means the function
-- runs as postgres (the schema owner) and can read _private.enc_keys.

CREATE OR REPLACE FUNCTION public.encrypt_account_number(plaintext text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = _private, public
AS $$
DECLARE
  k text;
BEGIN
  SELECT value INTO k FROM _private.enc_keys WHERE name = 'account_numbers';
  IF k IS NULL OR k = '' THEN RETURN NULL; END IF;
  IF plaintext IS NULL OR plaintext = '' THEN RETURN NULL; END IF;
  RETURN encode(pgp_sym_encrypt(plaintext, k), 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_account_number(ciphertext text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = _private, public
AS $$
DECLARE
  k text;
BEGIN
  SELECT value INTO k FROM _private.enc_keys WHERE name = 'account_numbers';
  IF k IS NULL OR k = '' THEN RETURN NULL; END IF;
  IF ciphertext IS NULL OR ciphertext = '' THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(decode(ciphertext, 'base64'), k);
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- Prevent direct calls from app roles — only SECURITY DEFINER callers use these.
REVOKE ALL ON FUNCTION public.encrypt_account_number(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrypt_account_number(text)  FROM PUBLIC, anon, authenticated;

-- ── 4. Auto-encrypt trigger ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_encrypt_account_numbers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = _private, public
AS $$
DECLARE
  k text;
BEGIN
  SELECT value INTO k FROM _private.enc_keys WHERE name = 'account_numbers';
  IF k IS NULL OR k = '' THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME IN ('contractors', 'batch_items', 'contractor_applications') THEN
    IF NEW.account_number IS NOT NULL AND NEW.account_number != '' THEN
      NEW.account_number_enc :=
        encode(pgp_sym_encrypt(NEW.account_number, k), 'base64');
    END IF;
  ELSIF TG_TABLE_NAME IN ('profiles', 'vendors') THEN
    IF NEW.bank_account_number IS NOT NULL AND NEW.bank_account_number != '' THEN
      NEW.bank_account_number_enc :=
        encode(pgp_sym_encrypt(NEW.bank_account_number, k), 'base64');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_encrypt_acct_contractors ON public.contractors;
CREATE TRIGGER trg_encrypt_acct_contractors
  BEFORE INSERT OR UPDATE ON public.contractors
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_encrypt_account_numbers();

DROP TRIGGER IF EXISTS trg_encrypt_acct_batch_items ON public.batch_items;
CREATE TRIGGER trg_encrypt_acct_batch_items
  BEFORE INSERT OR UPDATE ON public.batch_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_encrypt_account_numbers();

DROP TRIGGER IF EXISTS trg_encrypt_acct_profiles ON public.profiles;
CREATE TRIGGER trg_encrypt_acct_profiles
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_encrypt_account_numbers();

DROP TRIGGER IF EXISTS trg_encrypt_acct_vendors ON public.vendors;
CREATE TRIGGER trg_encrypt_acct_vendors
  BEFORE INSERT OR UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_encrypt_account_numbers();

DROP TRIGGER IF EXISTS trg_encrypt_acct_applications ON public.contractor_applications;
CREATE TRIGGER trg_encrypt_acct_applications
  BEFORE INSERT OR UPDATE ON public.contractor_applications
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_encrypt_account_numbers();

-- ── 5. Privileged RPC — decrypt a single account number ──────────────────────
--
-- Usage from the frontend:
--   const { data } = await supabase.rpc('get_decrypted_account_number', {
--     p_entity_type: 'contractor', p_entity_id: contractor.id
--   });
--
-- Only super_admin / admin / finance roles may call this.

CREATE OR REPLACE FUNCTION public.get_decrypted_account_number(
  p_entity_type text,
  p_entity_id   uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = _private, public
AS $$
DECLARE
  caller_role text;
  enc_val     text;
  k           text;
BEGIN
  SELECT role INTO caller_role
    FROM public.profiles
    WHERE id = auth.uid();

  IF caller_role NOT IN ('super_admin', 'admin', 'finance') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  CASE p_entity_type
    WHEN 'contractor' THEN
      SELECT account_number_enc INTO enc_val
        FROM public.contractors WHERE id = p_entity_id;
    WHEN 'batch_item' THEN
      SELECT account_number_enc INTO enc_val
        FROM public.batch_items WHERE id = p_entity_id;
    WHEN 'profile' THEN
      SELECT bank_account_number_enc INTO enc_val
        FROM public.profiles WHERE id = p_entity_id;
    WHEN 'vendor' THEN
      SELECT bank_account_number_enc INTO enc_val
        FROM public.vendors WHERE id = p_entity_id;
    WHEN 'application' THEN
      SELECT account_number_enc INTO enc_val
        FROM public.contractor_applications WHERE id = p_entity_id;
    ELSE
      RAISE EXCEPTION 'Unknown entity_type: %', p_entity_type;
  END CASE;

  SELECT value INTO k FROM _private.enc_keys WHERE name = 'account_numbers';
  IF k IS NULL OR k = '' OR enc_val IS NULL OR enc_val = '' THEN
    RETURN NULL;
  END IF;
  RETURN pgp_sym_decrypt(decode(enc_val, 'base64'), k);
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- ── 6. Backfill existing rows ─────────────────────────────────────────────────
--
-- Reads the auto-generated key directly from _private.enc_keys.
-- Safe to re-run — only touches rows where *_enc IS NULL.

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

  RAISE NOTICE 'Backfill complete.';
END;
$$;
