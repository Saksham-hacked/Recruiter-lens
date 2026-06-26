const { createClient } = require('@supabase/supabase-js');

// IMPORTANT: This table has exactly ONE row, always id=1.
// All token reads and writes target that single row.
// Never insert a second row. The upsert in saveInitialTokens handles first-time setup.

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = supabase;
