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

//Obtener racha del niño
app.get('/api/racha', (req, res) => {
    const { id_niño } = req.query;

    if (!id_niño) {
        return res.status(400).json({ error: 'id_niño es requerido' });
    }

    console.log('Buscando racha para id_niño:', id_niño);
    const query = 'SELECT fecha, fecha_registro, Finalizado FROM racha_diaria WHERE id_niño = ?';

    db.query(query, [id_niño], (err, results) => {
        if (err) {
            console.error('Error al obtener racha:', err);
            return res.status(500).json({ error: 'Error al obtener racha' });
        }

        console.log(`✓ Se encontraron ${results.length} rachas`);

        const rachas = results.map(row => ({
            id_racha: row.id_racha,
            Fecha_inicio: row.fecha,
            Fecha_actual: row.fecha_registro,
            activa: row.Finalizado === 1
        }));

        console.log('Datos enviados:', JSON.stringify(rachas));
        res.json(rachas);
    });
});

//Update racha del niño
app.put('/api/racha/:id', (req, res) => {
    const rachaId = req.params.id;
    const { fecha_registro, Finalizado } = req.body;
    if (!fecha_registro || Finalizado === undefined) {
        return res.status(400).json({ error: 'fecha_registro y Finalizado son requeridos' });
    }
    const query = 'UPDATE racha_diaria SET fecha_registro = ?, Finalizado = ? WHERE id_niño = ?';
    db.query(query, [fecha_registro, Finalizado, rachaId], (err, result) => {
        if (err) {
            console.error('Error al actualizar racha:', err);
            return res.status(500).json({ error: 'Error al actualizar racha' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Racha no encontrada' });
        }
        res.json({ success: true, mensaje: 'Racha actualizada exitosamente' });
    });
});

//Update racha del niño marcador de Finalizado hasta el momento

app.put('/api/racha/marcador/:id', (req, res) => {
    const rachaId = req.params.id;
    const { Finalizado } = req.body;

    if (Finalizado === undefined) {
        return res.status(400).json({ error: 'Finalizado es requerido' });
    }

    const query = 'UPDATE racha_diaria SET Finalizado = ? WHERE id_racha = ?';
    db.query(query, [Finalizado, rachaId], (err, result) => {
        if (err) {
            console.error('Error al actualizar marcador de racha:', err);
            return res.status(500).json({ error: 'Error al actualizar marcador de racha' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Racha no encontrada' });
        }

        res.json({ success: true, mensaje: 'Marcador de racha actualizado exitosamente' });
    });
});

//insertar racha si no tiene activa
app.post('/api/racha', (req, res) => {
    const { id_niño, fecha, fecha_registro, Finalizado } = req.body;

    if (!id_niño || !fecha || !fecha_registro || Finalizado === undefined) {
        return res.status(400).json({ error: 'id_niño, fecha, fecha_registro y Finalizado son requeridos' });
    }

    const query = 'INSERT INTO racha_diaria (id_niño, fecha, fecha_registro, Finalizado) VALUES (?, ?, ?, ?)';
    db.query(query, [id_niño, fecha, fecha_registro, Finalizado], (err, result) => {
        if (err) {
            console.error('Error al insertar racha:', err);
            return res.status(500).json({ error: 'Error al insertar racha' });
        }

        res.json({ success: true, mensaje: 'Racha insertada exitosamente', id: result.insertId });
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
    const { id_nino } = req.query;
    
    if (!id_nino) {
        return res.status(400).json({ error: 'id_nino es requerido' });
    }
    
    console.log('Obteniendo productos disponibles para niño ID:', id_nino);
    
    // Obtener productos que NO estén en la tabla productos_niño para este niño
    const query = `
        SELECT p.* 
        FROM productos p
        LEFT JOIN productos_niño pn ON p.id_producto = pn.id_producto AND pn.id_niño = ?
        WHERE pn.id IS NULL
    `;
    
    db.query(query, [id_nino], (err, results) => {
        if (err) {
            console.error('Error al obtener productos:', err);
            console.error('Query ejecutada:', query);
            console.error('Parámetro id_nino:', id_nino);
            return res.status(500).json({ error: 'Error al obtener productos', detalle: err.message });
        }
        
        console.log(`✓ Se encontraron ${results.length} productos disponibles`);
        console.log('Datos enviados:', JSON.stringify(results));
        res.json(results);
    });
});

//Obtener productos comprados por un niño
app.get('/api/productos/comprados', (req, res) => {
    const { id_nino } = req.query;

    if (!id_nino) {
        return res.status(400).json({ error: 'id_nino es requerido' });
    }

    console.log('Obteniendo productos comprados para niño ID:', id_nino);

    const query = `
    SELECT p.* 
    FROM productos p
    INNER JOIN productos_niño pn ON p.id_producto = pn.id_producto
    WHERE pn.id_niño = ?
    `;

    db.query(query, [id_nino], (err, results) => {
        if (err) {
            console.error('Error al obtener productos comprados:', err);
            return res.status(500).json({ error: 'Error al obtener productos comprados' });
        }

        console.log(`✓ Se encontraron ${results.length} productos comprados`);
        console.log('Datos enviados:', JSON.stringify(results));
        res.json(results);
    });
});

// Registrar compra de producto en productos_niño
app.post('/api/productos_nino', (req, res) => {
    const { id_nino, id_producto } = req.body;
    
    if (!id_nino || !id_producto) {
        return res.status(400).json({ error: 'id_nino e id_producto son requeridos' });
    }
    
    console.log(`Registrando compra: Niño ${id_nino}, Producto ${id_producto}`);
    
    const query = 'INSERT INTO productos_niño (id_niño, id_producto) VALUES (?, ?)';
    db.query(query, [id_nino, id_producto], (err, result) => {
        if (err) {
            console.error('Error al registrar compra:', err);
            return res.status(500).json({ error: 'Error al registrar compra' });
        }
        
        console.log('✓ Compra registrada exitosamente');
        res.json({ success: true, id: result.insertId, mensaje: 'Compra registrada exitosamente' });
    });
});

// Guardar puntaje maximo de un juego
app.post('/api/puntajemax_juego', (req, res) => {
    const { juego, puntaje, id_nino } = req.body;
    
    if (!juego || puntaje === undefined || !id_nino) {
        return res.status(400).json({ error: 'juego, puntaje e id_nino son requeridos' });
    }
    
    console.log('Registrando puntaje maximo: Juego', juego, 'Puntaje', puntaje, 'Nino', id_nino);
    
    const query = 'INSERT INTO puntajemax_juego (juego, puntaje, id_nino) VALUES (?, ?, ?)';
    db.query(query, [juego, puntaje, id_nino], (err, result) => {
        if (err) {
            console.error('Error al registrar puntaje:', err);
            return res.status(500).json({ error: 'Error al registrar puntaje' });
        }
        
        console.log('Puntaje registrado exitosamente');
        res.json({ success: true, id: result.insertId, mensaje: 'Puntaje registrado exitosamente' });
    });
});

// Obtener puntaje maximo de un juego para un nino
app.get('/api/puntajemax_juego', (req, res) => {
    const { juego, id_nino } = req.query;
    
    if (!juego || !id_nino) {
        return res.status(400).json({ error: 'juego e id_nino son requeridos' });
    }
    
    console.log('Obteniendo puntaje maximo: Juego', juego, 'Nino', id_nino);
    
    const query = 'SELECT * FROM puntajemax_juego WHERE juego = ? AND id_nino = ? ORDER BY puntaje DESC LIMIT 1';
    db.query(query, [juego, id_nino], (err, results) => {
        if (err) {
            console.error('Error al obtener puntaje:', err);
            return res.status(500).json({ error: 'Error al obtener puntaje' });
        }
        
        console.log('Puntaje obtenido:', results.length, 'registros');
        res.json(results.length > 0 ? results[0] : null);
    });
});

// Actualizar puntaje maximo si es mayor
app.put('/api/puntajemax_juego/:id', (req, res) => {
    const puntajeId = req.params.id;
    const { puntaje } = req.body;
    
    if (puntaje === undefined) {
        return res.status(400).json({ error: 'puntaje es requerido' });
    }
    
    const query = 'UPDATE puntajemax_juego SET puntaje = ? WHERE id_puntajemax = ?';
    db.query(query, [puntaje, puntajeId], (err, result) => {
        if (err) {
            console.error('Error al actualizar puntaje:', err);
            return res.status(500).json({ error: 'Error al actualizar puntaje' });
        }
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Puntaje no encontrado' });
        }
        
        res.json({ success: true, mensaje: 'Puntaje actualizado exitosamente' });
    });
});

// Actualizar monedas de un niño (sumar monedas ganadas)
app.put('/api/ninos/:id/monedas', (req, res) => {
    const ninoId = req.params.id;
    const { monedas } = req.body;
    
    if (monedas === undefined) {
        return res.status(400).json({ error: 'monedas es requerido' });
    }
    
    console.log('Actualizando monedas para nino ID ' + ninoId + ': +' + monedas + ' monedas');
    
    const query = 'UPDATE prueba_niños SET Monedas = Monedas + ? WHERE id_niño = ?';
    db.query(query, [monedas, ninoId], (err, result) => {
        if (err) {
            console.error('Error al actualizar monedas:', err);
            return res.status(500).json({ error: 'Error al actualizar monedas' });
        }
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Nino no encontrado' });
        }
        
        console.log('Monedas actualizadas exitosamente');
        res.json({ success: true, mensaje: 'Monedas actualizadas exitosamente' });
    });
});

// Obtener monedas actuales de un niño
app.get('/api/ninos/:id/monedas', (req, res) => {
    const ninoId = req.params.id;
    
    console.log('Obteniendo monedas para nino ID ' + ninoId);
    
    const query = 'SELECT Monedas FROM prueba_niños WHERE id_niño = ?';
    db.query(query, [ninoId], (err, results) => {
        if (err) {
            console.error('Error al obtener monedas:', err);
            return res.status(500).json({ error: 'Error al obtener monedas' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Nino no encontrado' });
        }
        
        console.log('Monedas obtenidas: ' + results[0].Monedas);
        res.json({ monedas: results[0].Monedas });
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
