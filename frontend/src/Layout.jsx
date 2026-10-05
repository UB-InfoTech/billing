import React,{useState} from "react";
import Navbar from "./components/Navbar";
import {Outlet} from "react-router-dom";

export default function Layout(){
  const [collapsed,setCollapsed]=useState(()=>localStorage.getItem("sidebarCollapsed")==="true");
  const [mobileOpen,setMobileOpen]=useState(false);

  const handleCollapsedChange=updater=>{
    setCollapsed(prev=>{
      const next=typeof updater==="function"?updater(prev):updater;
      localStorage.setItem("sidebarCollapsed",String(next));
      return next;
    });
  };

  return(
    <div className={`app-layout ${collapsed?"sidebar-is-collapsed":""}`}>
      <Navbar
        collapsed={collapsed}
        setCollapsed={handleCollapsedChange}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <main className="app-main">
        <Outlet/>
      </main>
    </div>
  );
}
