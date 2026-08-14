// setup-db.js
// Faili hii inatengeneza/kurekebisha majedwali kwenye database yako
// Endesha mara MOJA tu: node setup-db.js

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runStartupMigration() {
  try {
    console.log("🔄 Inakagua database schema...");

    // MKULIMA VERIFICATION
    await pool.query(`
      ALTER TABLE IF EXISTS wakulima
      ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;
    `);

    // BUYER REQUEST STATUS
    await pool.query(`
      ALTER TABLE IF EXISTS buyer_requests
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';
    `);

    // Hakikisha records za zamani hazibaki NULL
    await pool.query(`
      UPDATE wakulima
      SET verified = FALSE
      WHERE verified IS NULL;
    `);

    await pool.query(`
      UPDATE buyer_requests
      SET status = 'pending'
      WHERE status IS NULL;
    `);

    // MATANGAZO
    await pool.query(`
      ALTER TABLE IF EXISTS matangazo
      ADD COLUMN IF NOT EXISTS bei INTEGER;
    `);

    await pool.query(`
      ALTER TABLE IF EXISTS matangazo
      ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
    `);

    await pool.query(`
      ALTER TABLE IF EXISTS matangazo
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP
      DEFAULT (NOW() + INTERVAL '90 days');
    `);

    console.log("✅ Database schema iko sawa.");

  } catch (error) {
    console.error("❌ Startup migration error:", error.message);
    // Hatumalizi server hapa; itaendelea ku-run
    // lakini error itaonekana kwenye Render logs.
  }
}

setup();