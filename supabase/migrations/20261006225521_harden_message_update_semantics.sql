-- Migration: harden message update semantics
BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_message_edit_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_window_minutes integer := 15;
  v_setting jsonb;
  v_is_moderator boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required to update a message';
  END IF;

  v_is_moderator := public.has_capability('stores.moderate');

  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.attachment_url IS DISTINCT FROM OLD.attachment_url
     OR NEW.attachment_url_type IS DISTINCT FROM OLD.attachment_url_type
     OR NEW.attachment_short_link_id IS DISTINCT FROM OLD.attachment_short_link_id THEN
    RAISE EXCEPTION 'Message authorship, conversation and attachments are immutable';
  END IF;

  NEW.is_edited := OLD.is_edited;
  NEW.edited_at := OLD.edited_at;

  IF OLD.sender_id <> v_uid AND NOT v_is_moderator THEN
    IF NEW.content IS DISTINCT FROM OLD.content THEN
      RAISE EXCEPTION 'Only the sender can edit message content';
    END IF;
    IF OLD.is_read = true AND NEW.is_read = false THEN
      RAISE EXCEPTION 'A read message cannot be marked unread by another participant';
    END IF;
  END IF;

  IF NEW.content IS DISTINCT FROM OLD.content THEN
    IF OLD.sender_id <> v_uid AND NOT v_is_moderator THEN
      RAISE EXCEPTION 'Only the sender can edit this message';
    END IF;

    SELECT value INTO v_setting
    FROM public.platform_settings
    WHERE key = 'message_edit_window_minutes';

    IF v_setting IS NOT NULL THEN
      BEGIN
        v_window_minutes := CASE jsonb_typeof(v_setting)
          WHEN 'number' THEN (v_setting::text)::integer
          WHEN 'string' THEN trim(both '"' from v_setting::text)::integer
          ELSE 15
        END;
      EXCEPTION WHEN OTHERS THEN
        v_window_minutes := 15;
      END;
    END IF;

    IF NOT v_is_moderator
       AND now() > OLD.created_at + make_interval(mins => GREATEST(v_window_minutes, 0)) THEN
      RAISE EXCEPTION 'The message edit window has expired';
    END IF;

    NEW.is_edited := true;
    NEW.edited_at := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;