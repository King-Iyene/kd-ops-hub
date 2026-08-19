-- HIGH finding from forensic review: fuel_requests RLS is fully open
-- (fuel_requests_insert / _update both WITH CHECK(true), by design — any
-- employee must be able to submit their own request, and Log External
-- Purchase inserts directly on an admin's behalf). Nothing at the DB level
-- stopped a row from being inserted or updated with logged_externally=true
-- but status='pending'/'approved' — which the normal admin approval flow
-- (handleFuelStatusUpdate) would then happily route into a real
-- payment_batches / batch_items row and dispatch for actual money, even
-- though "logged externally" means the money already moved outside the
-- platform. A CHECK constraint closes this at the one layer client code
-- can't bypass, regardless of how permissive RLS is or ever becomes.
--
-- The client always sets status='payment_sent' at insert for a logged-
-- external fuel row (src/pages/Fleet.tsx submitLogExternalPurchase) — this
-- constraint just makes that the ONLY legal state for such a row, so it can
-- never sit in 'pending'/'approved' where the batch-creation path would
-- ever see it.
ALTER TABLE public.fuel_requests
  ADD CONSTRAINT fuel_requests_logged_externally_never_pending
  CHECK (NOT logged_externally OR status = 'payment_sent');

-- Same guarantee on the expenses side (repairs). log_external_repair_purchase
-- already hardcodes payment_status='processed' unconditionally, so this
-- constraint should never actually bind in practice — it exists purely so
-- that guarantee holds even if a future code path inserts a
-- logged_externally=true expenses row some other way.
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_logged_externally_never_pending
  CHECK (NOT logged_externally OR payment_status = 'processed');
