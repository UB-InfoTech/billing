import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from '../pages/Dashboard';
import ExpenseList from '../pages/ExpenseList';
import AddEditExpense from '../pages/AddEditExpense';
import ExpenseReport from '../pages/ExpenseReport';
import ExpenseInsights from '../pages/ExpenseInsights';

const AppRoutes = () => (
  <Router>
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/expenses" element={<ExpenseList />} />
      <Route path="/expenses/add" element={<AddEditExpense />} />
      <Route path="/expenses/edit/:id" element={<AddEditExpense />} />
      <Route path="/expenses/report" element={<ExpenseReport />} />
      <Route path="/expenses/insights" element={<ExpenseInsights />} />
    </Routes>
  </Router>
);

export default AppRoutes;
