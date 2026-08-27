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
// Route pour enregistrer une vente et mettre à jour le stock
app.post('/api/sales', async (req, res) => {
    const { items } = req.body; // items attendu : [{ product_id, quantity, unit_price }]
    
    if (!items || items.length === 0) {
        return res.status(400).json({ error: "Aucun article dans la vente" });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Début de la transaction

        // 1. Calculer le montant total
        let totalAmount = 0;
        for (let item of items) {
            totalAmount += item.quantity * item.unit_price;
        }

        // 2. Insérer l'en-tête de la vente
        const saleQuery = `INSERT INTO sales (total_amount) VALUES ($1) RETURNING id;`;
        const saleResult = await client.query(saleQuery, [totalAmount]);
        const saleId = saleResult.rows[0].id;

        // 3. Insérer les articles vendus et décrémenter le stock
        for (let item of items) {
            const itemQuery = `
                INSERT INTO sale_items (sale_id, product_id, quantity, unit_price) 
                VALUES ($1, $2, $3, $4);
            `;
            await client.query(itemQuery, [saleId, item.product_id, item.quantity, item.unit_price]);

            const updateStockQuery = `
                UPDATE products 
                SET stock_quantity = stock_quantity - $1 
                WHERE id = $2;
            `;
            await client.query(updateStockQuery, [item.quantity, item.product_id]);
        }

        await client.query('COMMIT'); // Valider la transaction
        res.status(201).json({ message: "Vente enregistrée avec succès", sale_id: saleId, total_amount: totalAmount });

    } catch (err) {
        await client.query('ROLLBACK'); // Annuler en cas d'erreur
        console.error(err);
        res.status(500).json({ error: "Erreur lors de l'enregistrement de la vente" });
    } finally {
        client.release();
    }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
