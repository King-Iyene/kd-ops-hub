-- Encrypt NIN (National ID Number) using the same pgcrypto pattern as
-- bank account numbers (20260428000001_encrypt_account_numbers.sql).
--
-- NDPR compliance: NIN is sensitive PII and must not be stored in plaintext.
--
-- Architecture mirrors the account-number pattern:
--   * nin_enc column stores PGP-encrypted ciphertext (base64-encoded text).
--   * BEFORE INSERT/UPDATE trigger auto-encrypts every write and masks the
--     plaintext nin column (last 4 stored in nin_last4, plaintext replaced
--     with '****').
--   * encrypt_nin / get_decrypted_nin RPCs for explicit encrypt/decrypt.
--   * Only super_admin and admin roles may decrypt.

BEGIN;

-- ── 1. Add encrypted shadow column ──────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nin_enc text;

-- ── 2. Reuse the existing encryption key from _private.enc_keys ─────────────
-- The 'account_numbers' key was created in the original migration.  We reuse
-- it under a second alias so NIN encryption has its own key and can be rotated
-- independently.

INSERT INTO _private.enc_keys (name, value)
  VALUES ('nin', encode(gen_random_bytes(32), 'hex'))
  ON CONFLICT (name) DO NOTHING;

-- ── 3. Low-level encrypt / decrypt helpers ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.encrypt_nin(plaintext text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = _private, public
AS $$
DECLARE
  k text;
BEGIN
  SELECT value INTO k FROM _private.enc_keys WHERE name = 'nin';
  IF k IS NULL OR k = '' THEN RETURN NULL; END IF;
  IF plaintext IS NULL OR plaintext = '' THEN RETURN NULL; END IF;
  RETURN encode(pgp_sym_encrypt(plaintext, k), 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_nin(ciphertext text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = _private, public
AS $$
DECLARE
  k text;
BEGIN
  SELECT value INTO k FROM _private.enc_keys WHERE name = 'nin';
  IF k IS NULL OR k = '' THEN RETURN NULL; END IF;
  IF ciphertext IS NULL OR ciphertext = '' THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(decode(ciphertext, 'base64'), k);
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- Prevent direct calls from app roles.
REVOKE ALL ON FUNCTION public.encrypt_nin(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrypt_nin(text) FROM PUBLIC, anon, authenticated;

-- ── 4. Auto-encrypt trigger ─────────────────────────────────────────────────
-- Fires BEFORE INSERT/UPDATE on profiles.  Encrypts the plaintext nin into
-- nin_enc, stores last 4 digits in nin_last4, and masks the plaintext column.

CREATE OR REPLACE FUNCTION public.trg_fn_encrypt_nin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = _private, public
AS $$
DECLARE
  k text;
  raw_nin text;
BEGIN
  raw_nin := NEW.nin;

  -- Nothing to encrypt if nin is already masked or empty.
  IF raw_nin IS NULL OR raw_nin = '' OR raw_nin = '****' THEN
    RETURN NEW;
  END IF;

  SELECT value INTO k FROM _private.enc_keys WHERE name = 'nin';
  IF k IS NULL OR k = '' THEN
    RETURN NEW;
  END IF;

  -- Encrypt into shadow column.
  NEW.nin_enc := encode(pgp_sym_encrypt(raw_nin, k), 'base64');

  -- Store last 4 for masked display.
  NEW.nin_last4 := RIGHT(raw_nin, 4);

  -- Mask the plaintext column so it never sits in the clear.
  NEW.nin := '****';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_encrypt_nin_profiles ON public.profiles;
CREATE TRIGGER trg_encrypt_nin_profiles
  BEFORE INSERT OR UPDATE OF nin ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_encrypt_nin();

-- ── 5. Privileged RPC — decrypt NIN for a profile ───────────────────────────
--
-- Usage from the frontend:
--   const { data } = await supabase.rpc('get_decrypted_nin', {
--     p_profile_id: employee.id
--   });
--
-- Only super_admin and admin roles may call this.  NULL-bypass is fixed from
-- the start (caller_role IS NULL check).

CREATE OR REPLACE FUNCTION public.get_decrypted_nin(p_profile_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = _private, public
AS $$
DECLARE
  v_caller_role text;
  enc_val       text;
  k             text;
BEGIN
  -- Fail closed: require authentication.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT nin_enc INTO enc_val
    FROM public.profiles
    WHERE id = p_profile_id;

  SELECT value INTO k FROM _private.enc_keys WHERE name = 'nin';
  IF k IS NULL OR k = '' OR enc_val IS NULL OR enc_val = '' THEN
    RETURN NULL;
  END IF;

  RETURN pgp_sym_decrypt(decode(enc_val, 'base64'), k);
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_decrypted_nin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_decrypted_nin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_decrypted_nin(uuid) TO authenticated;

-- ── 6. Backfill existing rows ───────────────────────────────────────────────
-- Encrypt plaintext nin values that haven't been encrypted yet.

DO $$
DECLARE
  k text;
  n int;
BEGIN
  SELECT value INTO k FROM _private.enc_keys WHERE name = 'nin';

  IF k IS NULL OR k = '' THEN
    RAISE WARNING 'enc_keys row for nin missing — backfill skipped.';
    RETURN;
  END IF;

  UPDATE public.profiles
    SET nin_enc   = encode(pgp_sym_encrypt(nin, k), 'base64'),
        nin_last4 = RIGHT(nin, 4),
        nin       = '****'
    WHERE nin IS NOT NULL
      AND nin != ''
      AND nin != '****'
      AND nin_enc IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'profiles NIN backfilled: % rows', n;

  RAISE NOTICE 'NIN backfill complete.';
END;
$$;

COMMIT;
