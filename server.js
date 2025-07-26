require('dotenv').config();
const app = require('./app');
const connectDB = require('./src/config/db');

const PORT = process.env.PORT || 5000;

// Connect DB first
connectDB();


app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
