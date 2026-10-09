import React,{useState} from "react";
import axios from "axios";
import {Link,useNavigate} from "react-router-dom";

const Login=()=>{
  const apiBase=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
  const [formData,setFormData]=useState({email:"",password:""});
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [showPassword,setShowPassword]=useState(false);
  const navigate=useNavigate();
  const {email,password}=formData;

  const onChange=event=>{
    setError("");
    setFormData(previous=>({...previous,[event.target.name]:event.target.value}));
  };

  const onSubmit=async event=>{
    event.preventDefault();
    setError("");
    setLoading(true);
    try{
      const response=await axios.post(apiBase+"/api/auth/login",{email:email.trim(),password});
      if(!response.data?.token)throw new Error("Sign in did not return a session. Please try again.");
      localStorage.setItem("token",response.data.token);
      if(response.data.user)localStorage.setItem("user",JSON.stringify(response.data.user));
      navigate("/dashboard",{replace:true});
    }catch(err){
      setError(err.response?.data?.message||err.response?.data?.msg||err.message||"We couldn't sign you in. Check your email and password.");
    }finally{
      setLoading(false);
    }
  };

  return(
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-brand-mark"><i className="bi bi-receipt-cutoff"></i></div>
        <div className="auth-eyebrow">YOUR BUSINESS WORKSPACE</div>
        <h1 id="login-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to manage invoices, customers and everyday business tasks.</p>

        {error&&<div className="alert alert-danger auth-alert" role="alert"><i className="bi bi-exclamation-circle me-2"></i>{error}</div>}

        <form onSubmit={onSubmit}>
          <div className="mb-3">
            <label htmlFor="login-email" className="form-label">Email address</label>
            <input
              id="login-email"
              name="email"
              type="email"
              className="form-control auth-input"
              value={email}
              onChange={onChange}
              placeholder="you@company.com"
              autoComplete="email"
              required
              autoFocus
            />
          </div>
          <div className="mb-4">
            <label htmlFor="login-password" className="form-label">Password</label>
            <div className="input-group auth-password-group">
              <input
                id="login-password"
                name="password"
                type={showPassword?"text":"password"}
                className="form-control auth-input"
                value={password}
                onChange={onChange}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <button type="button" className="btn btn-light auth-password-toggle" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?"Hide password":"Show password"}>
                <i className={`bi ${showPassword?"bi-eye-slash":"bi-eye"}`}></i>
              </button>
            </div>
          </div>
          <button type="submit" className="btn btn-primary w-100 auth-submit" disabled={loading}>
            {loading?<><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Signing in...</>:<>Sign in <i className="bi bi-arrow-right ms-2"></i></>}
          </button>
        </form>

        <p className="auth-switch mb-0">New to the workspace? <Link to="/register">Create an account</Link></p>
      </section>
      <div className="auth-footnote"><i className="bi bi-shield-check me-1"></i>Your business information stays in your account.</div>
    </main>
  );
};

export default Login;
