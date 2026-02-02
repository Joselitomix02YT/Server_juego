const express = require('express');
const cors = require('cors');const MySQLStore = require('express-mysql-session')(session)
const mysql = require('mysql2/promise')
const path = require('path')
const bcrypt = require('bcrypt')

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

// Obtener productos (solo los NO comprados)
app.get('/api/productos', (req, res) => {
    const query = 'SELECT * FROM productos WHERE comprada = FALSE OR comprada IS NULL';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Error al obtener productos' });
        }
        res.json(results);
    });
});

// Marcar producto como comprado
app.put('/api/productos/:id/comprar', (req, res) => {
    const productId = req.params.id;
    const query = 'UPDATE productos SET comprada = TRUE WHERE id = ?';
    
    db.query(query, [productId], (err, result) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Error al comprar producto' });
        }
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }
        
        res.json({ success: true, mensaje: 'Producto comprado exitosamente' });
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
