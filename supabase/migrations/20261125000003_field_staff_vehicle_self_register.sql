-- Fix: no role other than super_admin/admin/operations could ever add a
-- vehicle. VehiclesTab.tsx already has a dedicated self-service flow for
-- this — an explicit "I have verified all details and understand they
-- cannot be changed after submission" confirmation gate, distinct from the
-- trusted admin/operations path — but the vehicles_write RLS policy
-- (INSERT) never matched it, so every non-admin submission hit a 403,
-- surfaced to the user as an unreadable "[object Object]" error (fixed
-- separately in lib/db-errors.ts — errorMessage() didn't handle
-- PostgrestError, a plain object, not an Error instance).
--
-- Per explicit instruction: every authenticated role should be able to see
-- (already true — vehicles_select_all is unrestricted) and add a vehicle.
-- Scope stays INSERT-only: UPDATE/DELETE remain restricted to
-- admin/super_admin/operations (delete: admin/super_admin only) — matches
-- the UI, which never shows edit/delete controls outside those roles (see
-- canManageVehicles/canDeleteVehicle in VehiclesTab.tsx), and matches the
-- "can't be edited after submission" promise made to the submitter.

DROP POLICY IF EXISTS vehicles_write ON public.vehicles;
CREATE POLICY vehicles_write ON public.vehicles
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
