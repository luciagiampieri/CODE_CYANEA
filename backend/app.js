const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());

// Ruta de prueba inicial
app.get('/', (req, res) => {
    res.json({ message: "Servidor de Cyanea corriendo correctamente🐙" });
});

app.listen(PORT, () => {
    console.log(`Servidor activo en el puerto ${PORT}`);
});