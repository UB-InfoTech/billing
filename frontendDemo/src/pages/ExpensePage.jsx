// Complete Expense Page - All-In-One
import React, { useState, useEffect } from 'react';
// import axios from '../api/axios';
import axios from 'axios';
import { useForm } from 'react-hook-form';
import { Bar } from 'react-chartjs-2';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';


const ExpensePage = () => {
  const { register, handleSubmit, reset } = useForm();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [chartData, setChartData] = useState({});

  useEffect(() => {
    fetchExpenses();
  }, []);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/expenses');
      setExpenses(response.data);
      generateChartData(response.data);
    } catch (error) {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  const generateChartData = (data) => {
    const categories = [...new Set(data.map(exp => exp.category))];
    const amounts = categories.map(cat =>
      data.filter(exp => exp.category === cat).reduce((acc, curr) => acc + curr.amount, 0)
    );
    setChartData({
      labels: categories,
      datasets: [{ label: 'Expense by Category', data: amounts, backgroundColor: 'rgba(75,192,192,0.6)' }],
    });
  };

  const onSubmit = async (data) => {
    try {
      await axios.post('/expenses', data);
      toast.success('Expense added successfully');
      reset();
      fetchExpenses();
    } catch (error) {
      toast.error('Failed to add expense');
    }
  };

  const filteredExpenses = expenses.filter(exp => exp.title.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className='container'>
      <h2>Expense Management</h2>
      <form onSubmit={handleSubmit(onSubmit)} className='mb-4'>
        <input {...register('title')} placeholder='Title' required />
        <input {...register('amount')} placeholder='Amount' type='number' required />
        <select {...register('category')} required>
          <option value='Production'>Production</option>
          <option value='Operational'>Operational</option>
          <option value='Marketing'>Marketing</option>
        </select>
        <button type='submit'>Add Expense</button>
      </form>

      <input placeholder='Filter by Title' onChange={(e) => setFilter(e.target.value)} />

      {loading ? <p>Loading...</p> : (
        <ul>
          {filteredExpenses.map(exp => (
            <li key={exp._id}>{exp.title} - ₹{exp.amount} ({exp.category})</li>
          ))}
        </ul>
      )}

      <div className='mt-4'>
        <h3>Expense Insights</h3>
        <Bar data={chartData} />
      </div>
    </div>
  );
};

export default ExpensePage;
