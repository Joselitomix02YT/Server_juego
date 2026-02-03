const express = require('express');
const cors = require('cors');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const mysql = require('mysql2');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuración de la base de datos con reconexión automática
let db;

function crearConexion() {
    db = mysql.createConnection({
        host: 'shortline.proxy.rlwy.net',
        port: 43144,
        user: 'root',
        password: 'hfXnwibzLojsAoVVJKlwBQtvfpSVUGIn',
        database: 'railway',
        connectTimeout: 20000,
        ssl: {
            rejectUnauthorized: false
        }
    });

    db.connect((err) => {
        if (err) {
            console.error('Error conectando a la base de datos:', err);
            console.log('Reintentando en 5 segundos...');
            setTimeout(crearConexion, 5000);
            return;
        }
        console.log('Conectado a MySQL');
    });

    db.on('error', (err) => {
        console.error('Error de conexión MySQL:', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
            console.log('Reconectando...');
            crearConexion();
        } else {
            throw err;
        }
    });
}

crearConexion();

// Rutas de la API
app.get('/api/test', (req, res) => {
    res.json({ mensaje: 'Servidor funcionando correctamente' });
});

// Guardar puntuación
app.post('/api/guardar-puntuacion', (req, res) => {
    const { nombre, puntuacion } = req.body;
    
    const query = 'INSERT INTO jugadores (nombre, puntuacion) VALUES (?, ?)';
    db.query(query, [nombre, puntuacion], (err, result) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Error al guardar datos' });
        }
        res.json({ success: true, id: result.insertId });
    });
});

// Obtener puntuaciones
app.get('/api/puntuaciones', (req, res) => {
    const query = 'SELECT * FROM jugadores ORDER BY puntuacion DESC LIMIT 10';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Error al obtener datos' });
        }
        res.json(results);
    });
});

// Validar login con bcrypt
app.get('/api/login', (req, res) => {
    const { username, password } = req.query;
    
    console.log('Login attempt for user:', username);
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }
    
    const query = 'SELECT id_papa, u_nombre, password FROM c_papa WHERE u_nombre = ?';
    db.query(query, [username], (err, results) => {
        if (err) {
            console.error('Error en query SQL:', err);
            return res.status(500).json({ error: 'Error al validar login', details: err.message });
        }
        
        console.log('Query results:', results.length, 'users found');
        
        if (results.length === 0) {
            console.log('Usuario no encontrado:', username);
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }
        
        const usuario = results[0];
        console.log('Usuario encontrado:', usuario.u_nombre, 'ID:', usuario.id_papa);
        
        // Comparar contraseña con bcrypt
        const bcrypt = require('bcrypt');
        bcrypt.compare(password, usuario.password, (err, isMatch) => {
            if (err) {
                console.error('Error al comparar contraseña:', err);
                return res.status(500).json({ error: 'Error al validar contraseña', details: err.message });
            }
            
            console.log('Password match:', isMatch);
            
            if (isMatch) {
                // Login exitoso - Retornar datos del usuario (sin contraseña)
                console.log('✓ Login exitoso para:', usuario.u_nombre);
                res.json({
                    id_papa: usuario.id_papa,
                    u_nombre: usuario.u_nombre
                });
            } else {
                console.log('✗ Contraseña incorrecta para:', usuario.u_nombre);
                res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
            }
        });
    });
});

// Obtener niños asociados a un papa
app.get('/api/ninos', (req, res) => {
    const { id_papa } = req.query;
    
    if (!id_papa) {
        return res.status(400).json({ error: 'id_papa es requerido' });
    }
    
    console.log('Buscando niños para id_papa:', id_papa);
    
    const query = 'SELECT id_niño, n_nombre, id_papa FROM prueba_niños WHERE id_papa = ?';
    db.query(query, [id_papa], (err, results) => {
        if (err) {
            console.error('Error al obtener niños:', err);
            return res.status(500).json({ error: 'Error al obtener niños' });
        }
        
        console.log(`✓ Se encontraron ${results.length} niños`);
        
        // Mapear los nombres de las columnas al formato que espera Unity
        const ninos = results.map(row => ({
            id: row.id_niño,
            nombre: row.n_nombre,
            id_papa: row.id_papa
        }));
        
        console.log('Datos enviados:', JSON.stringify(ninos));
        res.json(ninos);
    });
});

//Obtener objetivos de un niño
app.get('/api/objetivos', (req, res) => {
    const { id_niño } = req.query;

    if (!id_niño) {
        return res.status(400).json({ error: 'id_niño es requerido' });
    }

    console.log('Buscando objetivos para id_niño:', id_niño);
    const query = 'SELECT id_objetivo, texto_objetivo, completado FROM objetivos WHERE id_niño = ?';
    db.query(query, [id_niño], (err, results) => {
        if (err) {
            console.error('Error al obtener objetivos:', err);
            return res.status(500).json({ error: 'Error al obtener objetivos' });
        }

        console.log(`✓ Se encontraron ${results.length} objetivos`);

        const objetivos = results.map(row => ({
            id: row.id_objetivo,
            descripcion: row.texto_objetivo,
            completado: row.completado,
            id_niño: id_niño
        }));

        console.log('Datos enviados:', JSON.stringify(objetivos));
        res.json(objetivos);
    });

});

//Actualizar objetivos
app.put('/api/objetivos/:id', (req, res) => {
    const objetivoId = req.params.id;
    const { completado, fecha_completado } = req.body;

    if (completado === undefined || !fecha_completado) {
        return res.status(400).json({ error: 'completado y fecha_completado son requeridos' });
    }

    const query = 'UPDATE objetivos SET completado = ?, fecha_completado = ? WHERE id_objetivo = ?';
    db.query(query, [completado, fecha_completado, objetivoId], (err, result) => {
        if (err) {
            console.error('Error al actualizar objetivo:', err);
            return res.status(500).json({ error: 'Error al actualizar objetivo' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Objetivo no encontrado' });
        }

        res.json({ success: true, mensaje: 'Objetivo actualizado exitosamente' });
    });
});

// Obtener productos disponibles para un niño (que NO estén en productos_niño)
app.get('/api/productos/disponibles', (req, res) => {
    const { id_niño } = req.query;
    
    if (!id_niño) {
        return res.status(400).json({ error: 'id_niño es requerido' });
    }
    
    console.log('Obteniendo productos disponibles para niño ID:', id_niño);
    
    // Obtener productos que NO estén en la tabla productos_niño para este niño
    const query = `
        SELECT p.* 
        FROM productos p
        LEFT JOIN productos_niño pn ON p.id = pn.id_producto AND pn.id_niño = ?
        WHERE pn.id IS NULL
    `;
    
    db.query(query, [id_niño], (err, results) => {
        if (err) {
            console.error('Error al obtener productos:', err);
            return res.status(500).json({ error: 'Error al obtener productos' });
        }
        
        console.log(`✓ Se encontraron ${results.length} productos disponibles`);
        console.log('Datos enviados:', JSON.stringify(results));
        res.json(results);
    });
});

//Obtener productos comprados por un niño


// Registrar compra de producto en productos_niño
app.post('/api/productos_nino', (req, res) => {
    const { id_niño, id_producto } = req.body;
    
    if (!id_niño || !id_producto) {
        return res.status(400).json({ error: 'id_niño e id_producto son requeridos' });
    }
    
    console.log(`Registrando compra: Niño ${id_niño}, Producto ${id_producto}`);
    
    const query = 'INSERT INTO productos_niño (id_niño, id_producto) VALUES (?, ?)';
    db.query(query, [id_niño, id_producto], (err, result) => {
        if (err) {
            console.error('Error al registrar compra:', err);
            return res.status(500).json({ error: 'Error al registrar compra' });
        }
        
        console.log('✓ Compra registrada exitosamente');
        res.json({ success: true, id: result.insertId, mensaje: 'Compra registrada exitosamente' });
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
