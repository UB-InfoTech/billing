import React, { useState, useEffect } from 'react';
import ExpenseList from '../components/ExpenseList';
import { getExpenses, deleteExpense } from '../services/api';
import * as XLSX from 'xlsx'; // Importing XLSX for Excel export functionality

function Expenses() {
  const [expenses, setExpenses] = useState([]);

  useEffect(() => {
    fetchExpenses();
  }, []);

  const fetchExpenses = async () => {
    try {
      const response = await getExpenses();
      setExpenses(response.data);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteExpense(id);
      setExpenses(expenses.filter(exp => exp._id !== id));
    } catch (error) {
      console.error('Error deleting expense:', error);
    }
  };

  const handleExportExcel = () => {
    const exportData = expenses.map(exp => ({
      date: new Date(exp.date).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
      vendor: exp.vendor,
      description: exp.description,
      category: exp.category,
      amount: exp.amount,

    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Expenses');
    XLSX.writeFile(workbook, 'expenses_report.xlsx');
  }


  return (
    <div className="container py-4">
      <div className="d-flex">
        <h1 className="mb-4 text-center text-nowrap">Your Expenses</h1>
        <div className="d-flex justify-content-end w-100">
          <div className="col-md-1 me-1 text-end">
            <button className="btn btn-primary " onClick={() => window.location.href = '/add-expense'}>
              +
            </button>
          </div>
          <div className="col-md-1">
            <button className="btn btn-success w-100" onClick={handleExportExcel}>
              Excel
            </button>
          </div>
        </div>
      </div>
      <ExpenseList expenses={expenses} onDelete={handleDelete} />
    </div>
  );
}

export default Expenses;