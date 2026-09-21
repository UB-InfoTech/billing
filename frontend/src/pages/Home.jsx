import React,{useEffect,useState} from "react";
import axios from "axios";
import {useNavigate} from "react-router-dom";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});
const money=v=>"₹"+Number(v||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});

export default function Home(){
  const navigate=useNavigate();
  const [user,setUser]=useState(null);
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{let alive=true;Promise.all([axios.get(API+"/api/auth/user",auth()),axios.get(API+"/api/reports/dashboard-summary",auth())]).then(([u,d])=>{if(alive){setUser(u.data);setData(d.data);}}).catch(e=>{if(!alive)return;if(e.response?.status===401){localStorage.removeItem("token");navigate("/login");}else setError(e.response?.data?.message||"Unable to load dashboard.");}).finally(()=>alive&&setLoading(false));return()=>{alive=false;};},[navigate]);
  if(loading)return <div className="container-fluid py-5 text-center"><span className="spinner-border text-primary"/></div>;
  const cards=[["Invoices",data?.orders||0,"/orders"],["Clients",data?.clients||0,"/clients"],["Products",data?.products||0,"/products"],["Revenue",money(data?.revenue),"/analytics"],["Outstanding",money(data?.due),"/orders"],["Expenses",money(data?.expenses),"/expense"]];
  return <div className="container-fluid py-4">
    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4"><div><h2 className="mb-1">Dashboard</h2><div className="text-muted">Welcome back{user?.username?", "+user.username:""}.</div></div><div className="d-flex gap-2"><button className="btn btn-primary" onClick={()=>navigate("/orders")}>+ New Invoice</button><button className="btn btn-outline-primary" onClick={()=>navigate("/credit-notes")}>Credit Note</button></div></div>
    {error&&<div className="alert alert-danger">{error}</div>}
    <div className="row g-3 mb-4">{cards.map(([label,value,to])=><div className="col-6 col-md-4 col-xl-2" key={label}><button className="card border-0 shadow-sm w-100 h-100 text-start bg-white" onClick={()=>navigate(to)}><div className="card-body"><div className="text-muted small">{label}</div><div className="fs-4 fw-bold mt-1">{value}</div></div></button></div>)}</div>
    <div className="row g-3"><div className="col-lg-8"><div className="card border-0 shadow-sm h-100"><div className="card-body"><h5 className="mb-3">Business Snapshot</h5><div className="row g-3"><div className="col-md-4"><div className="small text-muted">Paid</div><div className="fw-bold">{money(data?.paid)}</div></div><div className="col-md-4"><div className="small text-muted">Credit Notes</div><div className="fw-bold">{money(data?.creditNotes)}</div></div><div className="col-md-4"><div className="small text-muted">Net after Expenses</div><div className="fw-bold">{money(Number(data?.revenue||0)-Number(data?.expenses||0))}</div></div></div></div></div></div>
      <div className="col-lg-4"><div className="card border-0 shadow-sm h-100"><div className="card-body"><h5 className="mb-3">Quick Actions</h5><div className="d-grid gap-2"><button className="btn btn-outline-primary" onClick={()=>navigate("/bulk-payment")}>Record Bulk Payment</button><button className="btn btn-outline-secondary" onClick={()=>navigate("/add-expense")}>Add Expense</button><button className="btn btn-outline-success" onClick={()=>navigate("/calendar")}>Schedule Event</button><button className="btn btn-outline-dark" onClick={()=>navigate("/profile")}>Company Settings</button></div></div></div></div>
    </div>
  </div>;
}