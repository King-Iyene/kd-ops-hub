-- Defense-in-depth for the stored-XSS finding: contractor_applications is
-- writable by the public, unauthenticated /join form (JoinForm.tsx), whose
-- linkedin_url scheme check is client-side only (a regex on the React form,
-- easily bypassed by calling the Supabase REST endpoint directly). The
-- actual vulnerability — rendering this value into an <a href> — is already
-- closed at every render site via safeHref(); this constraint additionally
-- stops a non-LinkedIn/non-http(s) value from being stored at all.
ALTER TABLE public.contractor_applications
  ADD CONSTRAINT contractor_applications_linkedin_url_format
  CHECK (linkedin_url IS NULL OR linkedin_url ~* '^https?://(www\.)?linkedin\.com/');
