-- Add an explicit audit log entry + admin notification when an admin/super_admin
-- bypasses the bank-change lock during an active payroll batch.
--
-- The existing AFTER UPDATE audit trigger (20260819) already logs the bank
-- change itself. This patch makes the BEFORE UPDATE lock trigger log the
-- *bypass* as a distinct, high-severity event so security reviews can
-- distinguish "normal bank change" from "bank change overriding active batch lock".

CREATE OR REPLACE FUNCTION public.block_bank_change_during_active_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id     uuid := auth.uid();
  v_actor_role   text;
  v_actor_name   text;
  v_batch_name   text;
  v_batch_status text;
  v_subject      text;
  v_old_mask     text;
  v_new_mask     text;
BEGIN
  -- System / service-role: bypass silently.
  IF v_actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role, full_name INTO v_actor_role, v_actor_name
    FROM public.profiles WHERE id = v_actor_id;

  -- Check if an active batch exists for this employee.
  SELECT pb.name, pb.status
    INTO v_batch_name, v_batch_status
    FROM public.batch_items bi
    JOIN public.payment_batches pb ON pb.id = bi.batch_id
   WHERE bi.account_number = OLD.bank_account_number
     AND COALESCE(bi.bank_name, '') = COALESCE(OLD.bank_name, '')
     AND pb.status IN (
       'pending_approval',
       'pending_second_approval',
       'approved',
       'funded',
       'processing'
     )
   LIMIT 1;

  -- Admin / super_admin: bypass the lock but log the override when a batch is active.
  IF v_actor_role IN ('admin', 'super_admin') THEN
    IF FOUND THEN
      v_subject  := COALESCE(NEW.full_name, NEW.email, NEW.id::text);
      v_old_mask := CASE
        WHEN OLD.bank_account_number IS NULL OR length(OLD.bank_account_number) < 4 THEN '(none)'
        ELSE '****' || right(OLD.bank_account_number, 4)
      END;
      v_new_mask := CASE
        WHEN NEW.bank_account_number IS NULL OR length(NEW.bank_account_number) < 4 THEN '(none)'
        ELSE '****' || right(NEW.bank_account_number, 4)
      END;

      INSERT INTO public.audit_logs (
        action_type, description, performed_by, performed_by_name, metadata
      ) VALUES (
        'bank_change_lock_admin_bypass',
        format(
          'SECURITY: %s (%s) bypassed bank-change lock for %s during active batch "%s" (%s). Account: %s %s → %s %s',
          COALESCE(v_actor_name, 'unknown'), v_actor_role,
          v_subject, v_batch_name, v_batch_status,
          COALESCE(OLD.bank_name, '(none)'), v_old_mask,
          COALESCE(NEW.bank_name, '(none)'), v_new_mask
        ),
        v_actor_id,
        COALESCE(v_actor_name, 'unknown'),
        jsonb_build_object(
          'subject_user_id',   NEW.id,
          'subject_full_name', v_subject,
          'batch_name',        v_batch_name,
          'batch_status',      v_batch_status,
          'old_bank_name',     OLD.bank_name,
          'new_bank_name',     NEW.bank_name,
          'old_account_mask',  v_old_mask,
          'new_account_mask',  v_new_mask,
          'old_bank_code',     OLD.bank_code,
          'new_bank_code',     NEW.bank_code
        )
      );

      -- Notify all OTHER admins/super_admins so the bypass is not silent.
      INSERT INTO public.notifications (user_id, type, module, priority, title, body)
      SELECT p.id,
             'bank_change_lock_bypass',
             'security',
             'high',
             'Bank change during active batch',
             format(
               '%s overrode the bank-change lock for %s while batch "%s" (%s) is active. Old: %s %s → New: %s %s. Review immediately if unexpected.',
               COALESCE(v_actor_name, 'Admin'), v_subject,
               v_batch_name, v_batch_status,
               COALESCE(OLD.bank_name, ''), v_old_mask,
               COALESCE(NEW.bank_name, ''), v_new_mask
             )
        FROM public.profiles p
       WHERE p.role IN ('admin', 'super_admin')
         AND p.id <> v_actor_id
         AND p.status = 'active';
    END IF;
    RETURN NEW;
  END IF;

  -- Non-admin with active batch: block the change.
  IF FOUND THEN
    RAISE EXCEPTION 'Bank account locked: % is in active batch "%" (%). Wait for the batch to complete or ask an admin to make the change.',
      COALESCE(NEW.full_name, NEW.email, 'this employee'),
      v_batch_name,
      v_batch_status
      USING ERRCODE = 'lock_not_available';
  END IF;

  RETURN NEW;
END;
$$;
