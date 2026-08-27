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
// Route pour ajouter un produit
app.post('/api/products', async (req, res) => {
    const { name, category_id, price, stock_quantity } = req.body;
    try {
        const query = `
            INSERT INTO products (name, category_id, price, stock_quantity) 
            VALUES ($1, $2, $3, $4) RETURNING *;
        `;
        const values = [name, category_id || null, price, stock_quantity || 0];
        const result = await pool.query(query, values);
        res.status(201).json({ message: "Produit ajouté avec succès", product: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur lors de l'ajout du produit" });
    }
});
// Route pour lister tous les produits
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur lors de la récupération des produits" });
    }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
