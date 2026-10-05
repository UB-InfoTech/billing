import React,{useEffect,useState} from "react";
import {NavLink,useNavigate} from "react-router-dom";

const MENU_ITEMS=[
  {to:"/dashboard",label:"Dashboard",icon:"bi-speedometer2"},
  {to:"/analytics",label:"Analytics",icon:"bi-graph-up-arrow"},
  {to:"/orders",label:"Bills",icon:"bi-receipt"},
  {to:"/clients",label:"Clients",icon:"bi-people"},
  {to:"/products",label:"Products",icon:"bi-box-seam"},
  {to:"/expense",label:"Expenses",icon:"bi-wallet2"},
  {to:"/add-expense",label:"Add Expense",icon:"bi-plus-circle"},
  {to:"/calendar",label:"Calendar",icon:"bi-calendar3"},
  {to:"/bulk-payment",label:"Bulk Payment",icon:"bi-cash-stack"},
  {to:"/credit-notes",label:"Credit Notes",icon:"bi-file-earmark-minus"},
  {to:"/profile",label:"Profile",icon:"bi-person-circle"},
];

export default function Navbar({collapsed,setCollapsed,mobileOpen,setMobileOpen}){
  const navigate=useNavigate();
  const [userName,setUserName]=useState("");

  useEffect(()=>{
    try{
      const stored=JSON.parse(localStorage.getItem("user")||"null");
      setUserName(stored?.username||stored?.name||"");
    }catch{
      setUserName("");
    }
  },[]);

  const closeMobile=()=>setMobileOpen(false);
  const handleLogout=()=>{
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
    closeMobile();
  };

  return(
    <>
      <button
        type="button"
        className="sidebar-mobile-toggle btn btn-primary shadow-sm"
        onClick={()=>setMobileOpen(true)}
        aria-label="Open navigation"
      >
        <i className="bi bi-list"></i>
      </button>

      {mobileOpen&&(
        <button
          type="button"
          className="sidebar-backdrop"
          onClick={closeMobile}
          aria-label="Close navigation"
        />
      )}

      <aside className={`app-sidebar ${collapsed?"is-collapsed":""} ${mobileOpen?"is-mobile-open":""}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark"><i className="bi bi-grid-1x2-fill"></i></div>
          <div className="sidebar-brand-text">
            <div className="fw-bold">Billing</div>
            <div className="small text-white-50">Business Manager</div>
          </div>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={()=>setCollapsed(prev=>!prev)}
            title={collapsed?"Expand sidebar":"Collapse sidebar"}
            aria-label={collapsed?"Expand sidebar":"Collapse sidebar"}
          >
            <i className={`bi ${collapsed?"bi-layout-sidebar-inset":"bi-layout-sidebar"}`}></i>
          </button>
          <button type="button" className="sidebar-mobile-close btn btn-sm" onClick={closeMobile} aria-label="Close navigation">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <div className="sidebar-scroll">
          <div className="sidebar-section-label">Workspace</div>
          <nav className="nav flex-column gap-1" aria-label="Main navigation">
            {MENU_ITEMS.map(item=>(
              <NavLink
                key={item.to}
                to={item.to}
                onClick={closeMobile}
                className={({isActive})=>`sidebar-nav-link ${isActive?"active":""}`}
              >
                <span className="sidebar-nav-icon"><i className={`bi ${item.icon}`}></i></span>
                <span className="sidebar-nav-label">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar"><i className="bi bi-person"></i></div>
            <div className="sidebar-user-copy">
              <div className="fw-semibold text-truncate">{userName||"Administrator"}</div>
              <div className="small text-white-50">Signed in</div>
            </div>
          </div>
          <button type="button" className="sidebar-logout" onClick={handleLogout} title="Logout">
            <i className="bi bi-box-arrow-right"></i>
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
