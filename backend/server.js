const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
// const axios = require('axios');
const clientRoutes = require('./routes/clientRoutes');
const orderRoutes = require('./routes/orderRoutes2');
const authRoutes = require('./routes/auth');
const reportRoutes = require('./routes/reportRoutes');
const calendarRoutes = require('./routes/calendar');
const productRoutes = require('./routes/productRoute');
const profileRoutes = require('./routes/profile');

const ewaybillRoutes = require('./routes/ewaybillRoutes');
const getGstDetailsRoutes = require('./routes/getGstDetailsRoutes');
const bulkPaymentRoutes = require('./routes/bulkPayment');

// credit notes
// const creditNoteOldRoutes = require('./routes/creditNoteRoutesOld');
const creditNoteRoutes = require('./routes/creditNoteRoutes');

// const { cloudinary } = require('./utils/cloudinary');

// const supplierRoutes = require('./routes/supplierRoutes');
// const orderRoutes = require('./routes/orderRoutes');
// const auth = require('./routes/auth');
// const expenseRoutes = require('./routes/expenseRoutes');

// const setupRecurringExpenses = require('./utils/recurringExpense');
// setupRecurringExpenses();

// const http = require('http');
// const socketIo = require('socket.io');
// const server = http.createServer(app);
// const io = socketIo(server, {
//   cors: { origin: '*' }
// });

dotenv.config();
const app = express();

// app.set('io', io); // pass to controller

// Middleware
// app.use(cors());
app.use(cors({
  // origin: 'http://localhost:5173',
  credentials: true,
  allowedHeaders: ['Content-Type', 'x-auth-token'],
  exposedHeaders: ['x-auth-token']
}));
app.use(express.json());


// Database Connection
mongoose.connect(process.env.MONGO_URI).then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

// JWT Middleware
const verifyToken = (req, res, next) => {
  // const token = req.header('x-auth-token') || req.query.token || req.body.token;
  const token = req.header('x-auth-token');

  if (!token) return res.status(401).json({ message: 'Access Denied' });
  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    // res.status(400).json({ message: 'Invalid Token' });
    res.status(400).json({ message: 'Token Expired' });
  }
};


// Routes
// app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth', authRoutes);


// Routes
app.use('/api/clients', clientRoutes);
app.use('/api/order', orderRoutes);
// app.use('/api/reports', reportRoutes);
app.use('/api/events', calendarRoutes);
app.use('/api/expenses', require('./routes/expenseRoutes2'));
app.use('/api/products', productRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/ewaybill', ewaybillRoutes);
app.use('/api/gstdetails', getGstDetailsRoutes);
app.use('/api/payments', bulkPaymentRoutes);
app.use('/api/credit-notes', creditNoteRoutes);
// app.use('/api/credit-notesOld', creditNoteOldRoutes);

// app.use('/api/notes', require('./routes/notes')); // Add this line
// app.use('/api/suppliers', supplierRoutes);
// app.use('/api/clients', verifyToken, clientRoutes);
// app.use('/api/suppliers', verifyToken, supplierRoutes);
// app.use('/api/auth', authRoutes);

// app.use('/api/expenses', auth, expenseRoutes);
// app.use('/api/expenses', expenseRoutes);


// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
