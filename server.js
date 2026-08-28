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
