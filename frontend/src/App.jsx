import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Clients from './pages/Clients.jsx';
import Login from './pages/Login.jsx';
// import Orders from './pages/Order.jsx';
import Orders2 from './pages/Order2.jsx';
// import Navbar from './components/Navbar.jsx';
import Layout from './Layout.jsx';
// import Analytics from './pages/Analytics.jsx';
import Calendar from './pages/Calendar.jsx';
import SalesAnalytics from './pages/SalesAnalytics.jsx';
// import Login from './pages/Login';
import Register from './pages/Register';
// import ExpensePage from './pages/ExpensePage.jsx';
import Expenses from './pages/Expenses';
import AddExpense from './pages/AddExpense';
import ProductPage from './pages/ProductPage.jsx';

import Profile from './pages/Profile.jsx';
import BulkPayment from './pages/BulkPayment.jsx';
import CreditNote from './pages/CreditNote.jsx';


// import ProtectedRoute from './components/ProtectedRoute.jsx';

// import navdas from './pages/navdas.jsx';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');

  if (!token) {
    alert('❌ ProtectedRoute - No token found , Rout protected'); // Debug log
  }

  return token ? children : <Navigate to="/login" />;

};

function App() {
  return (
    // <div className="container mt-4">
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Layout />}>
        <Route path="*" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/" element={<Login />} />
        
        <Route path="/calendar" element={
          <ProtectedRoute>
            <Calendar />
          </ProtectedRoute>

        } />
        <Route path="/analytics" element={
          <ProtectedRoute>
            <SalesAnalytics />
          </ProtectedRoute>
        } />

        <Route path="/credit-notes" element={
          <ProtectedRoute>
            <CreditNote />
          </ProtectedRoute>
        } />

        <Route path="/bulk-payment" element={
          <ProtectedRoute>
            <BulkPayment />
          </ProtectedRoute>
        } />
        
        <Route path="/expense" element={
          <ProtectedRoute>
            <Expenses />
          </ProtectedRoute>
        } />

        <Route path="/add-expense" element={
          <ProtectedRoute>
            <AddExpense />
          </ProtectedRoute>
        } />

        <Route
          path="/clients"
          element={
            <ProtectedRoute>
              <Clients />
            </ProtectedRoute>
          }
        />

        <Route path='/orders'
          element={
            <ProtectedRoute>
              <Orders2 />
            </ProtectedRoute>
          } />

        <Route path='/profile'
          element={
              <Profile />
          } />

      
        <Route path='/products'
          element={
            <ProtectedRoute>
              <ProductPage />
            </ProtectedRoute>
          } />
        

        
      </Route>

    </Routes>
    // </div>
  );
}

export default App;