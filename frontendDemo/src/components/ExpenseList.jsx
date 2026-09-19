import React from "react";

import ExpenseCard from './ExpenseCard';

function ExpenseList({ expenses, onDelete }) {
  return (
    <div>
      {expenses.length === 0 ? (
        <p className="text-center text-muted">No expenses found.</p>
      ) : (
        expenses.map((expense) => (
          <ExpenseCard key={expense._id} expense={expense} onDelete={onDelete} />
        ))
      )}
    </div>
  );
}

export default ExpenseList;