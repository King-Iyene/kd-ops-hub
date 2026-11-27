-- Where the KD Ops desktop app installers live for everyone.
--
-- The installers are built by GitHub Actions into releases of a private repository, so only people with a GitHub
-- login to that repository could ever download them (everyone else got a GitHub 404/login page from the Download
-- button). The "Mirror desktop installers" workflow now copies the current installers into this public bucket, and
-- the app links to them here. A public bucket serves files by URL without a login (reads need no policy); only the
-- workflow, using the service key, can write.
--
-- The files themselves are public by design (an installer is not a secret), and the bucket holds nothing else.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('desktop-app', 'desktop-app', true, 314572800) -- 300 MB per file (the installers are about 80 to 110 MB)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit;
