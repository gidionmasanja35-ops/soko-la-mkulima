// setup-db.js
// Faili hii inatengeneza majedwali (tables) kwenye database yako
// Endesha mara MOJA tu: node setup-db.js
require('dotenv').config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Render inahitaji hii
});

async function setup() {
  try {
    console.log("Inatengeneza jedwali la bei_mazao...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bei_mazao (
        id SERIAL PRIMARY KEY,
        zao VARCHAR(50) NOT NULL,
        mkoa VARCHAR(50) NOT NULL,
        bei INTEGER NOT NULL,
        tarehe TIMESTAMP DEFAULT NOW()
      );
    `);

   // ... sehemu ya juu ya faili lako inabaki vilevile ...

    console.log("Inafuta na kutengeneza upya jedwali la matangazo...");
    // Tunafuta la zamani ili muundo mpya uchukue nafasi
    await pool.query("DROP TABLE IF EXISTS matangazo;"); 
    await pool.query(`
      CREATE TABLE matangazo (
        id SERIAL PRIMARY KEY,
        zao VARCHAR(100) NOT NULL,
        idadi VARCHAR(50) NOT NULL,
        bei INTEGER NOT NULL,               -- Column ya bei
        phone_number VARCHAR(20) NOT NULL,
        mkoa VARCHAR(50) NOT NULL,          -- column ya mkoa (IMEONGEZWA)
        status VARCHAR(20) DEFAULT 'pending',-- column ya status (IMEONGEZWA)
        active BOOLEAN DEFAULT TRUE,        -- Inahitajika kwenye USSD (Tazama Matangazo)
        expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days'), -- Tangazo lidumu siku 30
        tarehe TIMESTAMP DEFAULT NOW()
      );
    `);

// ... sehemu ya chini ya faili lako inabaki vilevile ...

    console.log("Inaweka bei za mfano (seed data)...");
    await pool.query("DELETE FROM bei_mazao");
    await pool.query(`
      INSERT INTO bei_mazao (zao, mkoa, bei) VALUES
      ('mahindi', 'Dodoma', 800),
      ('mahindi', 'Mbeya', 750),
      ('mahindi', 'Morogoro', 820),
      ('mpunga', 'Mbeya', 1200),
      ('mpunga', 'Morogoro', 1300),
      ('mpunga', 'Shinyanga', 1100),
      ('maharage', 'Dodoma', 1800),
      ('maharage', 'Songwe', 1700);
    `);

    console.log("✅ Database imetengenezwa kikamilifu na muundo mpya!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Kuna tatizo:", err.message);
    process.exit(1);
  }
}

setup();
