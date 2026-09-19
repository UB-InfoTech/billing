// no use 
import React from 'react';
import axios from 'axios';

const instance = axios.create({
  baseURL: 'http://localhost:5000'
  // baseURL: 'https://baba.divinesparks.in'
});

instance.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token');
   if (token) {
      config.headers['x-auth-token'] = token;
      console.log('Axios Interceptor - Set x-auth-token header:', config.headers['x-auth-token']); // Debug log
    } else {
      console.log('Axios Interceptor - No token found in localStorage'); // Debug log
    }
    console.log('Axios Interceptor - Full headers:', JSON.stringify(config.headers, null, 2)); // Debug log
    return config;
  },
  error => {
    console.error('Axios Interceptor - Request error:', error.message); // Debug log
    return Promise.reject(error);
  }
);

export default instance;