// using
const express = require('express');
const router = express.Router();
const { 
  createExpense, 
  getExpenses, 
  deleteExpense, 
  // getExpenseById, 
  // updateExpense, 
//   uploadReceipt 
} = require('../controllers/expenseController2');
const auth = require('../middleware/auth');
// const { protect } = require('../middleware/auth'); // Placeholder for future auth
// const { validateExpense } = require('../middleware/validate');
// const multer = require('multer');
// const upload = multer({ dest: 'uploads/' }); // Temporary storage before S3

router.route('/')
.post(auth, createExpense)
.get(auth, getExpenses); 
// .delete(deleteExpense);
//   .post(protect, validateExpense, createExpense)
//   .get(protect, getExpenses);

router.route('/:id')
//   .get(getExpenseById)
//   .put(updateExpense)
  .delete(deleteExpense);
//   .get(protect, getExpenseById)
//   .put(protect, validateExpense, updateExpense)
//   .delete(protect, deleteExpense);

// router.post('/upload-receipt', protect, upload.single('receipt'), uploadReceipt);

module.exports = router;