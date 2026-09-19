import React from 'react';
import { useNavigate } from 'react-router-dom';
import ExpenseForm from '../components/ExpenseForm';
import { createExpense } from '../services/api';

function AddExpense() {
  const navigate = useNavigate();

  const handleSubmit = async (formData) => {
    try {
      await createExpense(formData);
      navigate('/expense');
    } catch (error) {
      console.error('Error adding expense:', error);
    }
  };

  return (
    <div className="container py-4">
      <ExpenseForm onSubmit={handleSubmit} />
    </div>
  );
}

export default AddExpense;