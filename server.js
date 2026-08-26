const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Connexion à PostgreSQL via la variable d'environnement de Railway
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Nécessaire souvent pour le cloud
});

// Route de test simple
app.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ message: "API connectée avec succès !", time: result.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur de connexion à la base de données" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});