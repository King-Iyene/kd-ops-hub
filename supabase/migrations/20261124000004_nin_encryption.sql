-- Encrypt NIN (National ID Number) using pgcrypto + vault secret.
--
-- NDPR compliance: NIN is sensitive PII and must not be stored in plaintext.
--
-- Architecture mirrors the live account-number pattern:
--   * nin_enc column stores PGP-encrypted ciphertext (base64-encoded text).
--   * BEFORE INSERT/UPDATE trigger auto-encrypts every write and masks the
--     plaintext nin column (last 4 stored in nin_last4, plaintext replaced
--     with '****').
--   * encrypt_nin / get_decrypted_nin RPCs for explicit encrypt/decrypt.
--   * Only super_admin and admin roles may decrypt.
--   * Encryption key sourced from vault.decrypted_secrets 'encryption_key'.

-- ── 1. Add encrypted shadow column ──────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nin_enc text;

-- ── 2. Low-level encrypt / decrypt helpers ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.encrypt_nin(plaintext text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text;
BEGIN
  SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name = 'encryption_key';
  IF k IS NULL OR k = '' THEN RETURN NULL; END IF;
  IF plaintext IS NULL OR plaintext = '' THEN RETURN NULL; END IF;
  RETURN encode(pgp_sym_encrypt(plaintext, k), 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_nin(ciphertext text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text;
BEGIN
  SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name = 'encryption_key';
  IF k IS NULL OR k = '' THEN RETURN NULL; END IF;
  IF ciphertext IS NULL OR ciphertext = '' THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(decode(ciphertext, 'base64'), k);
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.encrypt_nin(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrypt_nin(text) FROM PUBLIC, anon, authenticated;

-- ── 3. Auto-encrypt trigger ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_encrypt_nin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text;
  raw_nin text;
BEGIN
  raw_nin := NEW.nin;

  IF raw_nin IS NULL OR raw_nin = '' OR raw_nin = '****' THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name = 'encryption_key';
  IF k IS NULL OR k = '' THEN
    RETURN NEW;
  END IF;

  NEW.nin_enc := encode(pgp_sym_encrypt(raw_nin, k), 'base64');
  NEW.nin_last4 := RIGHT(raw_nin, 4);
  NEW.nin := '****';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_encrypt_nin_profiles ON public.profiles;
CREATE TRIGGER trg_encrypt_nin_profiles
  BEFORE INSERT OR UPDATE OF nin ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_encrypt_nin();

-- ── 4. Privileged RPC — decrypt NIN for a profile ───────────────────────────

CREATE OR REPLACE FUNCTION public.get_decrypted_nin(p_profile_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  enc_val       text;
  k             text;
BEGIN
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

  SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name = 'encryption_key';
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

-- ── 5. Backfill existing rows ───────────────────────────────────────────────

DO $$
DECLARE
  k text;
  n int;
BEGIN
  SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name = 'encryption_key';

  IF k IS NULL OR k = '' THEN
    RAISE WARNING 'vault encryption_key missing — backfill skipped.';
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
END;
$$;
