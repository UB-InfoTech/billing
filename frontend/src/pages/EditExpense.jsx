import React,{useEffect,useState} from "react";
import {useNavigate,useParams} from "react-router-dom";
import ExpenseForm from "../components/ExpenseForm";
import {getExpenseById,updateExpense} from "../services/api";

export default function EditExpense(){
  const {id}=useParams();
  const navigate=useNavigate();
  const [initialData,setInitialData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  useEffect(()=>{
    let alive=true;
    (async()=>{
      try{
        const response=await getExpenseById(id);
        if(!alive)return;
        const expense=response.data||{};
        setInitialData({
          ...expense,
          clientId:expense.clientId?._id||expense.clientId||"",
          orderId:expense.orderId?._id||expense.orderId||"",
          date:expense.date?new Date(expense.date).toISOString().slice(0,10):new Date().toISOString().slice(0,10),
          tags:Array.isArray(expense.tags)?expense.tags:[],
          recurringEndDate:expense.recurringEndDate?new Date(expense.recurringEndDate).toISOString().slice(0,10):"",
        });
      }catch(err){
        if(alive)setError(err.response?.data?.message||"Unable to load expense.");
      }finally{
        if(alive)setLoading(false);
      }
    })();
    return()=>{alive=false;};
  },[id]);

  const handleSubmit=async(data)=>{
    await updateExpense(id,data);
    navigate("/expense");
  };

  if(loading)return <div className="container py-5 text-center"><span className="spinner-border"/></div>;
  if(error)return <div className="container py-4"><div className="alert alert-danger">{error}</div></div>;

  return <div className="container py-4">
    <div className="d-flex justify-content-between align-items-center mb-3">
      <h2 className="mb-0">Edit Expense</h2>
      <button className="btn btn-outline-secondary" onClick={()=>navigate("/expense")}>Back</button>
    </div>
    {initialData&&<ExpenseForm onSubmit={handleSubmit} initialData={initialData}/>}
  </div>;
}
