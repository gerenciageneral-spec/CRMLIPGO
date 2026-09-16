-- Reset the invtrans ID sequence to prevent duplicate key errors
-- This script synchronizes the sequence with the maximum ID in the table

-- Get the current maximum ID and set the sequence to that value + 1
SELECT setval(
  pg_get_serial_sequence('invtrans', 'id'),
  COALESCE((SELECT MAX(id) FROM invtrans), 1),
  true
);

-- Verify the sequence is now correct
SELECT currval(pg_get_serial_sequence('invtrans', 'id')) as current_sequence_value,
       MAX(id) as max_table_id
FROM invtrans;
