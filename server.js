const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Route catégories
app.get('/api/categories', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM categories ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur récupération catégories" });
    }
});

app.post('/api/categories', async (req, res) => {
    const { name } = req.body;
    try {
        const result = await pool.query('INSERT INTO categories (name) VALUES ($1) RETURNING *;', [name]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur création catégorie" });
    }
});

// Route pour lister tous les produits avec leur catégorie
app.get('/api/products', async (req, res) => {
    try {
        const query = `
            SELECT p.*, c.name as category_name 
            FROM products p 
            LEFT JOIN categories c ON p.category_id = c.id 
            ORDER BY p.id DESC;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur lors de la récupération des produits" });
    }
});

// Route pour ajouter un produit (avec code-barres et catégorie)
app.post('/api/products', async (req, res) => {
    const { name, category_id, price, stock_quantity, barcode } = req.body;
    try {
        const query = `
            INSERT INTO products (name, category_id, price, stock_quantity, barcode) 
            VALUES ($1, $2, $3, $4, $5) RETURNING *;
        `;
        const values = [name, category_id || null, price, stock_quantity || 0, barcode || null];
        const result = await pool.query(query, values);
        res.status(201).json({ message: "Produit ajouté avec succès", product: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur lors de l'ajout du produit (Code-barres peut-être déjà utilisé)" });
    }
});

// Route pour enregistrer une vente
app.post('/api/sales', async (req, res) => {
    const { items } = req.body; 
    
    if (!items || items.length === 0) {
        return res.status(400).json({ error: "Aucun article dans la vente" });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let totalAmount = 0;
        for (let item of items) {
            totalAmount += item.quantity * item.unit_price;
        }

        const saleQuery = `INSERT INTO sales (total_amount) VALUES ($1) RETURNING id;`;
        const saleResult = await client.query(saleQuery, [totalAmount]);
        const saleId = saleResult.rows[0].id;

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

        await client.query('COMMIT');
        res.status(201).json({ message: "Vente enregistrée avec succès", sale_id: saleId, total_amount: totalAmount });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: "Erreur lors de l'enregistrement de la vente" });
    } finally {
        client.release();
    }
});
// Route pour les statistiques du Tableau de Bord
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        // Chiffre d'affaires et nombre de ventes du jour
        const todayQuery = `
            SELECT COALESCE(SUM(total_amount), 0) as total_sales, COUNT(id) as sales_count 
            FROM sales 
            WHERE DATE(created_at) = CURRENT_DATE;
        `;
        const todayResult = await pool.query(todayQuery);

        // Valeur totale du stock et nombre de produits en rupture
        const stockQuery = `
            SELECT 
                COALESCE(SUM(price * stock_quantity), 0) as total_stock_value,
                COUNT(CASE WHEN stock_quantity <= 0 THEN 1 END) as out_of_stock_count
            FROM products;
        `;
        const stockResult = await pool.query(stockQuery);

        res.json({
            today_sales: todayResult.rows[0].total_sales,
            sales_count: todayResult.rows[0].sales_count,
            total_stock_value: stockResult.rows[0].total_stock_value,
            out_of_stock_count: stockResult.rows[0].out_of_stock_count
        });
    } catch (err) {
        console.error("Erreur stats dashboard:", err);
        res.status(500).json({ error: "Erreur lors de la récupération des statistiques" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
