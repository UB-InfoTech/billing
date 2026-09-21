import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./Layout.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Clients from "./pages/Clients.jsx";
import Orders2 from "./pages/Order2.jsx";
import Calendar from "./pages/Calendar.jsx";
import SalesAnalytics from "./pages/SalesAnalytics.jsx";
import Expenses from "./pages/Expenses.jsx";
import AddExpense from "./pages/AddExpense.jsx";
import EditExpense from "./pages/EditExpense.jsx";
import ProductPage from "./pages/ProductPage.jsx";
import Profile from "./pages/Profile.jsx";
import BulkPayment from "./pages/BulkPayment.jsx";
import CreditNote from "./pages/CreditNote.jsx";

function ProtectedRoute({children}){
  return localStorage.getItem("token") ? children : <Navigate to="/login" replace />;
}

export default function App(){
  return <Routes>
    <Route path="/login" element={<Login/>}/>
    <Route path="/register" element={<Register/>}/>
    <Route path="/" element={<Layout/>}>
      <Route index element={<ProtectedRoute><Home/></ProtectedRoute>}/>
      <Route path="dashboard" element={<ProtectedRoute><Home/></ProtectedRoute>}/>
      <Route path="analytics" element={<ProtectedRoute><SalesAnalytics/></ProtectedRoute>}/>
      <Route path="orders" element={<ProtectedRoute><Orders2/></ProtectedRoute>}/>
      <Route path="clients" element={<ProtectedRoute><Clients/></ProtectedRoute>}/>
      <Route path="products" element={<ProtectedRoute><ProductPage/></ProtectedRoute>}/>
      <Route path="expense" element={<ProtectedRoute><Expenses/></ProtectedRoute>}/>
      <Route path="add-expense" element={<ProtectedRoute><AddExpense/></ProtectedRoute>}/>
      <Route path="edit-expense/:id" element={<ProtectedRoute><EditExpense/></ProtectedRoute>}/>
      <Route path="calendar" element={<ProtectedRoute><Calendar/></ProtectedRoute>}/>
      <Route path="bulk-payment" element={<ProtectedRoute><BulkPayment/></ProtectedRoute>}/>
      <Route path="credit-notes" element={<ProtectedRoute><CreditNote/></ProtectedRoute>}/>
      <Route path="profile" element={<ProtectedRoute><Profile/></ProtectedRoute>}/>
      <Route path="*" element={<Navigate to="/dashboard" replace/>}/>
    </Route>
    <Route path="*" element={<Navigate to="/login" replace/>}/>
  </Routes>;
}