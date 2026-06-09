-- Add test assignment for Roger (if Roger exists)
-- This migration creates a test multiplication assignment

-- First, let's find or create Roger
DO $$
DECLARE
  v_roger_id uuid := '0b266a82-ec3c-4156-9c11-f954a3874a25'::uuid;
  v_parent_id uuid;
BEGIN
  -- Check if Roger exists, if not create a test parent and Roger
  IF NOT EXISTS (SELECT 1 FROM children WHERE id = v_roger_id) THEN
    -- Create a test parent user first
    INSERT INTO users (id, email, role)
    VALUES (
      '11111111-1111-1111-1111-111111111111'::uuid,
      'testparent@example.com',
      'parent'
    )
    ON CONFLICT DO NOTHING;

    -- Create Roger with test parent
    INSERT INTO children (
      id, parent_id, name, age, grade_level, selected_avatar,
      max_times_table, pin, word_problems_enabled,
      preferred_language, max_addition_number
    )
    VALUES (
      v_roger_id,
      '11111111-1111-1111-1111-111111111111'::uuid,
      'Roger',
      8,
      'Grade 3',
      'boy',
      12,
      '1234',
      true,
      'English',
      100
    );

    v_parent_id := '11111111-1111-1111-1111-111111111111'::uuid;
  ELSE
    -- Get Roger's parent_id
    SELECT parent_id INTO v_parent_id FROM children WHERE id = v_roger_id;
  END IF;

  -- Create test multiplication assignment for Roger
  INSERT INTO assignments (
    parent_id,
    child_id,
    subject,
    focus,
    mode,
    question_count,
    status,
    custom_questions
  )
  VALUES (
    v_parent_id,
    v_roger_id,
    'math',
    'multiplication',
    'regular',
    4,
    'active',
    '[
      {
        "question_text": "7 × 8 = ?",
        "correct_answer": "56",
        "question_type": "numeric",
        "subject": "math",
        "topic": "multiplication",
        "tier": "M2"
      },
      {
        "question_text": "6 × 9 = ?",
        "correct_answer": "54",
        "question_type": "numeric",
        "subject": "math",
        "topic": "multiplication",
        "tier": "M2"
      },
      {
        "question_text": "8 × 7 = ?",
        "correct_answer": "56",
        "question_type": "numeric",
        "subject": "math",
        "topic": "multiplication",
        "tier": "M2"
      },
      {
        "question_text": "9 × 6 = ?",
        "correct_answer": "54",
        "question_type": "numeric",
        "subject": "math",
        "topic": "multiplication",
        "tier": "M2"
      }
    ]'::jsonb
  )
  ON CONFLICT DO NOTHING;

END $$;
