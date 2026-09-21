import axios from 'axios';

// const linkone = 'http://localhost:5000'; // Adjust based on your environment
  const linkone = `https://baba.divinesparks.in`;


const API_URL = `${linkone}/api/expenses`; // Adjust based on backend

export const getExpenses = () => axios.get(API_URL, {
  headers: {
    'x-auth-token': localStorage.getItem('token')
  }
});

export const getExpenseById = (id) => axios.get(`${API_URL}/${id}`);

export const createExpense = (data) => axios.post(API_URL, data, {
  headers: {
    'x-auth-token': localStorage.getItem('token'),
  }
});

export const updateExpense = (id, data) => axios.put(`${API_URL}/${id}`, data);

export const deleteExpense = (id) => axios.delete(`${API_URL}/${id}`, {
  headers: {
    'x-auth-token': localStorage.getItem('token'),
  }
});

export const uploadReceipt = async (file) => {
  const formData = new FormData();
  formData.append('receipt', file);
  const response = await axios.post(`${API_URL}/upload-receipt`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};