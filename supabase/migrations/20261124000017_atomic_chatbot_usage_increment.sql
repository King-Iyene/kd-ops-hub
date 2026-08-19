-- Atomic chatbot usage counter to prevent read-then-write race condition.
CREATE OR REPLACE FUNCTION public.increment_chatbot_usage(
  p_user_id uuid,
  p_usage_date date,
  p_messages integer DEFAULT 1,
  p_tokens integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.chatbot_usage (user_id, usage_date, message_count, tokens_total)
  VALUES (p_user_id, p_usage_date, p_messages, p_tokens)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET
    message_count = chatbot_usage.message_count + EXCLUDED.message_count,
    tokens_total  = chatbot_usage.tokens_total  + EXCLUDED.tokens_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_chatbot_usage(uuid, date, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_chatbot_usage(uuid, date, integer, integer) TO service_role;
