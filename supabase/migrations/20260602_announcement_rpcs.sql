-- ─── create_announcement ─────────────────────────────────────────────────────
-- Creates a new announcement (PUBLISHED or SCHEDULED) with targets and attachments.

CREATE OR REPLACE FUNCTION create_announcement(
  p_title        text,
  p_body         text,
  p_author_id    uuid,
  p_sy_id        int,
  p_status       text,
  p_published_at timestamptz,
  p_everyone     bool,
  p_role_ids     int[],
  p_attachments  jsonb
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id int;
BEGIN
  INSERT INTO announcements (title, body, author_id, sy_id, status, published_at)
  VALUES (p_title, p_body, p_author_id, p_sy_id, p_status, p_published_at)
  RETURNING announcement_id INTO v_id;

  IF p_everyone THEN
    INSERT INTO announcement_targets (announcement_id, role_id)
    VALUES (v_id, NULL);
  ELSIF array_length(p_role_ids, 1) > 0 THEN
    INSERT INTO announcement_targets (announcement_id, role_id)
    SELECT v_id, r FROM unnest(p_role_ids) AS r;
  END IF;

  IF jsonb_array_length(p_attachments) > 0 THEN
    INSERT INTO announcement_attachments
      (announcement_id, storage_path, file_name, mime_type, file_size_bytes, display_order)
    SELECT
      v_id,
      a->>'storage_path',
      a->>'file_name',
      a->>'mime_type',
      (a->>'file_size_bytes')::int,
      (a->>'display_order')::int
    FROM jsonb_array_elements(p_attachments) AS a;
  END IF;

  RETURN v_id;
END;
$$;


-- ─── delete_published_announcement ───────────────────────────────────────────
-- Hard-deletes a PUBLISHED announcement and all its related rows.

CREATE OR REPLACE FUNCTION delete_published_announcement(p_announcement_id int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM announcement_reads       WHERE announcement_id = p_announcement_id;
  DELETE FROM announcement_attachments WHERE announcement_id = p_announcement_id;
  DELETE FROM announcement_targets     WHERE announcement_id = p_announcement_id;

  DELETE FROM announcements
  WHERE  announcement_id = p_announcement_id
    AND  status          = 'PUBLISHED';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Announcement % not found or not in PUBLISHED status', p_announcement_id;
  END IF;
END;
$$;


-- ─── publish_announcement ─────────────────────────────────────────────────────
-- Immediately publishes a SCHEDULED announcement by setting status to PUBLISHED
-- and published_at to NOW().

CREATE OR REPLACE FUNCTION publish_announcement(p_announcement_id int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE announcements
  SET    status       = 'PUBLISHED',
         published_at = NOW()
  WHERE  announcement_id = p_announcement_id
    AND  status          = 'SCHEDULED';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Announcement % not found or not in SCHEDULED status', p_announcement_id;
  END IF;
END;
$$;


-- ─── update_published_announcement ───────────────────────────────────────────
-- Atomically updates a PUBLISHED announcement's fields, targets, and attachments.

CREATE OR REPLACE FUNCTION update_published_announcement(
  p_announcement_id  int,
  p_title            text,
  p_body             text,
  p_everyone         bool,
  p_role_ids         int[],
  p_attachments      jsonb
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE announcements
  SET    title = p_title,
         body  = p_body
  WHERE  announcement_id = p_announcement_id
    AND  status          = 'PUBLISHED';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Announcement % not found or not in PUBLISHED status', p_announcement_id;
  END IF;

  DELETE FROM announcement_targets WHERE announcement_id = p_announcement_id;
  IF p_everyone THEN
    INSERT INTO announcement_targets (announcement_id, role_id)
    VALUES (p_announcement_id, NULL);
  ELSIF array_length(p_role_ids, 1) > 0 THEN
    INSERT INTO announcement_targets (announcement_id, role_id)
    SELECT p_announcement_id, r FROM unnest(p_role_ids) AS r;
  END IF;

  DELETE FROM announcement_attachments WHERE announcement_id = p_announcement_id;
  IF jsonb_array_length(p_attachments) > 0 THEN
    INSERT INTO announcement_attachments
      (announcement_id, storage_path, file_name, mime_type, file_size_bytes, display_order)
    SELECT
      p_announcement_id,
      a->>'storage_path',
      a->>'file_name',
      a->>'mime_type',
      (a->>'file_size_bytes')::int,
      (a->>'display_order')::int
    FROM jsonb_array_elements(p_attachments) AS a;
  END IF;

  RETURN p_announcement_id;
END;
$$;


-- ─── update_scheduled_announcement ───────────────────────────────────────────
-- Atomically updates a SCHEDULED announcement's fields, targets, and attachments.
-- p_attachments: jsonb array of {storage_path, file_name, mime_type, file_size_bytes, display_order}

CREATE OR REPLACE FUNCTION update_scheduled_announcement(
  p_announcement_id  int,
  p_title            text,
  p_body             text,
  p_published_at     timestamptz,
  p_everyone         bool,
  p_role_ids         int[],
  p_attachments      jsonb
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE announcements
  SET    title        = p_title,
         body         = p_body,
         published_at = p_published_at
  WHERE  announcement_id = p_announcement_id
    AND  status          = 'SCHEDULED';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Announcement % not found or not in SCHEDULED status', p_announcement_id;
  END IF;

  -- Replace targets
  DELETE FROM announcement_targets WHERE announcement_id = p_announcement_id;

  IF p_everyone THEN
    INSERT INTO announcement_targets (announcement_id, role_id)
    VALUES (p_announcement_id, NULL);
  ELSIF array_length(p_role_ids, 1) > 0 THEN
    INSERT INTO announcement_targets (announcement_id, role_id)
    SELECT p_announcement_id, r
    FROM   unnest(p_role_ids) AS r;
  END IF;

  -- Replace attachments
  DELETE FROM announcement_attachments WHERE announcement_id = p_announcement_id;

  IF jsonb_array_length(p_attachments) > 0 THEN
    INSERT INTO announcement_attachments
      (announcement_id, storage_path, file_name, mime_type, file_size_bytes, display_order)
    SELECT
      p_announcement_id,
      a->>'storage_path',
      a->>'file_name',
      a->>'mime_type',
      (a->>'file_size_bytes')::int,
      (a->>'display_order')::int
    FROM jsonb_array_elements(p_attachments) AS a;
  END IF;

  RETURN p_announcement_id;
END;
$$;


-- ─── delete_announcement ──────────────────────────────────────────────────────
-- Hard-deletes a SCHEDULED announcement and all its related rows.

CREATE OR REPLACE FUNCTION delete_announcement(p_announcement_id int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM announcement_reads       WHERE announcement_id = p_announcement_id;
  DELETE FROM announcement_attachments WHERE announcement_id = p_announcement_id;
  DELETE FROM announcement_targets     WHERE announcement_id = p_announcement_id;

  DELETE FROM announcements
  WHERE  announcement_id = p_announcement_id
    AND  status          = 'SCHEDULED';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Announcement % not found or not in SCHEDULED status', p_announcement_id;
  END IF;
END;
$$;
