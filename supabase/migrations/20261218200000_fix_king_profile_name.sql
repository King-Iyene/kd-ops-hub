-- Fix profile name: "King Test" → "King Iyene"
UPDATE public.profiles
SET    full_name = 'King Iyene'
WHERE  email = 'code@kdsquares.com'
  AND  full_name = 'King Test';
