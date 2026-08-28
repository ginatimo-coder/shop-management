// ==========================================
// API : CONTACTS (Clients & Fournisseurs)
// ==========================================
app.get('/api/contacts', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM contacts ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur récupération contacts" });
    }
});

app.post('/api/contacts', async (req, res) => {
    const { name, phone, email, address, is_supplier, is_professional } = req.body;
    try {
        const query = `
            INSERT INTO contacts (name, phone, email, address, is_supplier, is_professional) 
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
        `;
        const values = [name, phone || null, email || null, address || null, is_supplier || false, is_professional || false];
        const result = await pool.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur création contact" });
    }
});

// ==========================================
// API : VENTES & DOCUMENTS (Devis, Facture, BL)
// ==========================================
app.post('/api/sales', async (req, res) => {
    const { contact_id, items, payment_method, status, document_type } = req.body; 
    
    if (!items || items.length === 0) {
        return res.status(400).json({ error: "Aucun article dans le document" });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let totalAmount = 0;
        for (let item of items) {
            totalAmount += item.quantity * item.unit_price;
        }

        // Génération d'un numéro de document unique
        const docPrefix = document_type === 'devis' ? 'DEV' : document_type === 'bon_livraison' ? 'BL' : 'FAC';
        const docNumber = `${docPrefix}-${Date.now().toString().slice(-6)}`;

        const saleQuery = `
            INSERT INTO sales (customer_id, total_amount, status, payment_method, document_type, document_number) 
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;
        `;
        const saleResult = await client.query(saleQuery, [
            contact_id || null, 
            totalAmount, 
            status || 'payé', 
            payment_method || 'especes',
            document_type || 'facture',
            docNumber
        ]);
        const saleId = saleResult.rows[0].id;

        for (let item of items) {
            const itemQuery = `
                INSERT INTO sale_items (sale_id, part_id, quantity, unit_price) 
                VALUES ($1, $2, $3, $4);
            `;
            await client.query(itemQuery, [saleId, item.part_id, item.quantity, item.unit_price]);

            // Si c'est une facture ou un bon de livraison (validé), on décrémente le stock
            if (document_type !== 'devis') {
                const updateStockQuery = `
                    UPDATE parts 
                    SET stock_quantity = stock_quantity - $1 
                    WHERE id = $2;
                `;
                await client.query(updateStockQuery, [item.quantity, item.part_id]);
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ message: "Document enregistré avec succès", sale_id: saleId, total_amount: totalAmount, document_number: docNumber });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: "Erreur lors de l'enregistrement du document" });
    } finally {
        client.release();
    }
});
