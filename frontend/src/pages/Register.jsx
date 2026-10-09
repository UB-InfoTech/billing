import React,{useState} from "react";
import axios from "axios";
import {Link,useNavigate} from "react-router-dom";

const Register=()=>{
  const apiBase=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
  const [formData,setFormData]=useState({username:"",email:"",password:"",confirmPassword:""});
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [showPassword,setShowPassword]=useState(false);
  const navigate=useNavigate();
  const {username,email,password,confirmPassword}=formData;

  const onChange=event=>{
    setError("");
    setFormData(previous=>({...previous,[event.target.name]:event.target.value}));
  };

  const onSubmit=async event=>{
    event.preventDefault();
    setError("");
    if(password!==confirmPassword){
      setError("The passwords don't match yet. Please check both fields.");
      return;
    }
    setLoading(true);
    try{
      const response=await axios.post(apiBase+"/api/auth/register",{
        username:username.trim(),
        email:email.trim(),
        password
      });
      if(!response.data?.token)throw new Error("Your account was not created. Please try again.");
      localStorage.setItem("token",response.data.token);
      const account=response.data.user||{username:username.trim(),email:email.trim()};
      localStorage.setItem("user",JSON.stringify(account));
      navigate("/dashboard",{replace:true});
    }catch(err){
      setError(err.response?.data?.message||err.response?.data?.msg||err.message||"We couldn't create your account. Please check the details and try again.");
    }finally{
      setLoading(false);
    }
  };

  return(
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="register-title">
        <div className="auth-brand-mark"><i className="bi bi-receipt-cutoff"></i></div>
        <div className="auth-eyebrow">GET STARTED</div>
        <h1 id="register-title">Create your account</h1>
        <p className="auth-subtitle">Set up your workspace to start managing invoices, customers and products.</p>

        {error&&<div className="alert alert-danger auth-alert" role="alert"><i className="bi bi-exclamation-circle me-2"></i>{error}</div>}

        <form onSubmit={onSubmit}>
          <div className="mb-3">
            <label htmlFor="register-name" className="form-label">Your name</label>
            <input
              id="register-name"
              name="username"
              type="text"
              className="form-control auth-input"
              value={username}
              onChange={onChange}
              placeholder="e.g. Priya Shah"
              autoComplete="name"
              required
              autoFocus
            />
          </div>
          <div className="mb-3">
            <label htmlFor="register-email" className="form-label">Work email</label>
            <input
              id="register-email"
              name="email"
              type="email"
              className="form-control auth-input"
              value={email}
              onChange={onChange}
              placeholder="you@company.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="mb-3">
            <label htmlFor="register-password" className="form-label">Create a password</label>
            <div className="input-group auth-password-group">
              <input
                id="register-password"
                name="password"
                type={showPassword?"text":"password"}
                className="form-control auth-input"
                value={password}
                onChange={onChange}
                placeholder="Create a password"
                autoComplete="new-password"
                required
              />
              <button type="button" className="btn btn-light auth-password-toggle" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?"Hide password":"Show password"}>
                <i className={`bi ${showPassword?"bi-eye-slash":"bi-eye"}`}></i>
              </button>
            </div>
          </div>
          <div className="mb-4">
            <label htmlFor="register-confirm-password" className="form-label">Confirm password</label>
            <input
              id="register-confirm-password"
              name="confirmPassword"
              type={showPassword?"text":"password"}
              className="form-control auth-input"
              value={confirmPassword}
              onChange={onChange}
              placeholder="Type the same password again"
              autoComplete="new-password"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary w-100 auth-submit" disabled={loading}>
            {loading?<><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Creating account...</>:<>Create account <i className="bi bi-arrow-right ms-2"></i></>}
          </button>
        </form>

        <p className="auth-switch mb-0">Already have an account? <Link to="/login">Sign in</Link></p>
      </section>
      <div className="auth-footnote"><i className="bi bi-lightning-charge me-1"></i>Simple setup. You can add more business details later.</div>
    </main>
  );
};

export default Register;
