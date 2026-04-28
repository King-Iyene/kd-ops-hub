-- Encrypt bank account numbers using pgcrypto.
--
-- NDPR compliance: account numbers are personal financial data and must not
-- be stored in plaintext. This migration adds encrypted shadow columns and
-- a trigger that keeps them in sync automatically.
--
-- ─── ONE-TIME SETUP (run in Supabase SQL editor BEFORE applying this migration) ───
--
--   1. Generate a strong random key (run locally):
--        python3 -c "import secrets; print(secrets.token_hex(32))"
--      Keep this key in your password manager — it is required to decrypt data.
--
--   2. Set the key as a database config variable:
--        ALTER DATABASE postgres SET app.encryption_key TO 'your-64-hex-char-key-here';
--        SELECT pg_reload_conf();
--
--   3. Apply this migration (it will auto-backfill existing rows if the key is set).
--
-- ─── ARCHITECTURE ─────────────────────────────────────────────────────────────────
--
--   * Plaintext columns (account_number / bank_account_number) are KEPT so that
--     existing application code continues to work. They are shown as masked in
--     the UI (****NNNN).
--   * Encrypted shadow columns (*_enc) store AES/PGP-encrypted values.
--   * A BEFORE INSERT/UPDATE trigger auto-encrypts each write.
--   * An RPC (get_decrypted_account_number) lets admin/finance users decrypt
--     a specific record via a role-checked SECURITY DEFINER function.
--
-- ─── AFFECTED TABLES ──────────────────────────────────────────────────────────────
--   contractors              → account_number_enc
--   batch_items              → account_number_enc
--   profiles                 → bank_account_number_enc
--   vendors                  → bank_account_number_enc
--   contractor_applications  → account_number_enc
-- ─────────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Add encrypted shadow columns ──────────────────────────────────────────

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

-- ── 2. Encrypt / decrypt helper functions ─────────────────────────────────────
--
-- Both functions are SECURITY DEFINER so they can read app.encryption_key
-- without exposing it to callers. REVOKE prevents direct invocation from
-- the anon / authenticated roles.

CREATE OR REPLACE FUNCTION public.encrypt_account_number(plaintext text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text := current_setting('app.encryption_key', true);
BEGIN
  IF k IS NULL OR k = '' THEN RETURN NULL; END IF;
  IF plaintext IS NULL OR plaintext = '' THEN RETURN NULL; END IF;
  RETURN encode(pgp_sym_encrypt(plaintext, k), 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_account_number(ciphertext text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text := current_setting('app.encryption_key', true);
BEGIN
  IF k IS NULL OR k = '' THEN RETURN NULL; END IF;
  IF ciphertext IS NULL OR ciphertext = '' THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(decode(ciphertext, 'base64'), k);
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- Prevent direct calls from anon / authenticated — only SECURITY DEFINER
-- callers (triggers, RPCs below) invoke these.
REVOKE ALL ON FUNCTION public.encrypt_account_number(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrypt_account_number(text)  FROM PUBLIC, anon, authenticated;

-- ── 3. Auto-encrypt trigger ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_encrypt_account_numbers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text := current_setting('app.encryption_key', true);
BEGIN
  IF k IS NULL OR k = '' THEN
    RETURN NEW;  -- key not configured yet; skip silently
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

-- Attach to each affected table (idempotent via OR REPLACE on the function;
-- triggers themselves use DROP IF EXISTS to allow re-running the migration).
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

-- ── 4. Privileged RPC — decrypt a single account number ──────────────────────
--
-- Usage from the frontend:
--   const { data } = await supabase.rpc('get_decrypted_account_number', {
--     p_entity_type: 'contractor', p_entity_id: contractor.id
--   });
--
-- Only super_admin / admin / finance roles can call this.

CREATE OR REPLACE FUNCTION public.get_decrypted_account_number(
  p_entity_type text,
  p_entity_id   uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  enc_val     text;
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

  RETURN public.decrypt_account_number(enc_val);
END;
$$;

-- ── 5. Backfill existing rows ─────────────────────────────────────────────────
--
-- Runs only if app.encryption_key is already configured.
-- If the key is not set yet, run this block manually in the SQL editor after
-- setting the key:
--
--   UPDATE public.contractors
--     SET account_number_enc = public.encrypt_account_number(account_number)
--     WHERE account_number IS NOT NULL AND account_number != ''
--       AND account_number_enc IS NULL;
--   (repeat for batch_items, profiles, vendors, contractor_applications)

DO $$
DECLARE
  k text := current_setting('app.encryption_key', true);
  n int;
BEGIN
  IF k IS NULL OR k = '' THEN
    RAISE WARNING
      'app.encryption_key not set — existing rows were NOT backfilled. '
      'Set the key first (see migration header), then run the backfill '
      'UPDATE statements from the SQL editor.';
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
