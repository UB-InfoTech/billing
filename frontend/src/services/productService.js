import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api/products';

export const fetchProducts = () => axios.get(BASE_URL);

export const createProduct = (data) =>
  axios.post(BASE_URL, data, { headers: { 'Content-Type': 'multipart/form-data' } });

export const updateProduct = (id, data) =>
  axios.put(`${BASE_URL}/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } });

export const deleteProduct = (id) => axios.delete(`${BASE_URL}/${id}`);
