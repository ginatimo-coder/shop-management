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

// ==========================================
// API : CATÉGORIES
// ==========================================
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

// ==========================================
// API : PIÈCES & STOCK (PARTS)
// ==========================================
app.get('/api/parts', async (req, res) => {
    try {
        const query = `
            SELECT p.*, c.name as category_name 
            FROM parts p 
            LEFT JOIN categories c ON p.category_id = c.id 
            ORDER BY p.id DESC;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur récupération des pièces" });
    }
});

app.post('/api/parts', async (req, res) => {
    const { category_id, sku, name, brand_part, part_number, purchase_price, sale_price, stock_quantity, min_stock_alert, location } = req.body;
    try {
        const query = `
            INSERT INTO parts (category_id, sku, name, brand_part, part_number, purchase_price, sale_price, stock_quantity, min_stock_alert, location) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *;
        `;
        const values = [
            category_id || null, 
            sku, 
            name, 
            brand_part || null, 
            part_number, 
            purchase_price || 0, 
            sale_price || 0, 
            stock_quantity || 0, 
            min_stock_alert || 5, 
            location || null
        ];
        const result = await pool.query(query, values);
        res.status(201).json({ message: "Pièce ajoutée avec succès", part: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur lors de l'ajout de la pièce" });
    }
});

// Route pour modifier une pièce
app.put('/api/parts/:id', async (req, res) => {
    const { id } = req.params;
    const { category_id, sku, name, brand_part, part_number, purchase_price, sale_price, stock_quantity, min_stock_alert, location } = req.body;
    try {
        const query = `
            UPDATE parts 
            SET category_id = $1, sku = $2, name = $3, brand_part = $4, part_number = $5, 
                purchase_price = $6, sale_price = $7, stock_quantity = $8, min_stock_alert = $9, location = $10 
            WHERE id = $11 RETURNING *;
        `;
        const values = [
            category_id || null, sku, name, brand_part || null, part_number, 
            purchase_price || 0, sale_price || 0, stock_quantity || 0, 
            min_stock_alert || 5, location || null, id
        ];
        const result = await pool.query(query, values);
        res.json({ message: "Pièce mise à jour avec succès", part: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur lors de la mise à jour de la pièce" });
    }
});

// Route pour supprimer une pièce
app.delete('/api/parts/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM parts WHERE id = $1', [id]);
        res.json({ message: "Pièce supprimée avec succès" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur lors de la suppression de la pièce" });
    }
});

// ==========================================
// API : CLIENTS (CUSTOMERS)
// ==========================================
app.get('/api/customers', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM customers ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur récupération clients" });
    }
});

// ==========================================
// API : VENTES & CAISSE (SALES)
// ==========================================
app.post('/api/sales', async (req, res) => {
    const { customer_id, items, payment_method, status } = req.body; 
    
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

        const saleQuery = `
            INSERT INTO sales (customer_id, total_amount, status, payment_method) 
            VALUES ($1, $2, $3, $4) RETURNING id;
        `;
        const saleResult = await client.query(saleQuery, [
            customer_id || null, 
            totalAmount, 
            status || 'payé', 
            payment_method || 'especes'
        ]);
        const saleId = saleResult.rows[0].id;

        for (let item of items) {
            const itemQuery = `
                INSERT INTO sale_items (sale_id, part_id, quantity, unit_price) 
                VALUES ($1, $2, $3, $4);
            `;
            await client.query(itemQuery, [saleId, item.part_id, item.quantity, item.unit_price]);

            const updateStockQuery = `
                UPDATE parts 
                SET stock_quantity = stock_quantity - $1 
                WHERE id = $2;
            `;
            await client.query(updateStockQuery, [item.quantity, item.part_id]);
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

// ==========================================
// API : TABLEAU DE BORD (DASHBOARD STATS)
// ==========================================
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const todayQuery = `
            SELECT COALESCE(SUM(total_amount), 0) as total_sales, COUNT(id) as sales_count 
            FROM sales 
            WHERE DATE(created_at) = CURRENT_DATE AND status = 'payé';
        `;
        const todayResult = await pool.query(todayQuery);

        const stockQuery = `
            SELECT 
                COALESCE(SUM(sale_price * stock_quantity), 0) as total_stock_value,
                COUNT(CASE WHEN stock_quantity <= min_stock_alert THEN 1 END) as low_stock_count
            FROM parts;
        `;
        const stockResult = await pool.query(stockQuery);

        res.json({
            today_sales: todayResult.rows[0].total_sales,
            sales_count: todayResult.rows[0].sales_count,
            total_stock_value: stockResult.rows[0].total_stock_value,
            low_stock_count: stockResult.rows[0].low_stock_count
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
