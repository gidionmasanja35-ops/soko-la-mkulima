// setup-db.js
// Faili hii inatengeneza majedwali (tables) kwenye database yako
// Endesha mara MOJA tu: node setup-db.js

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

    console.log("Inatengeneza jedwali la matangazo...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS matangazo (
        id SERIAL PRIMARY KEY,
        zao VARCHAR(100) NOT NULL,
        idadi VARCHAR(50) NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        tarehe TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("Inaweka bei za mfano (seed data)...");
    // Futa data ya zamani kwanza (kama ipo), kisha weka mpya
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

    console.log("✅ Database imetengenezwa kikamilifu!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Kuna tatizo:", err.message);
    process.exit(1);
  }
}

setup();
