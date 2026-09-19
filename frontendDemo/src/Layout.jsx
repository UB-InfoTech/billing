import React from 'react'
import Navbar from './components/Navbar'
import { Outlet } from 'react-router-dom'

function Layout() {
  return (
    <>
    <div className="d-flex flex-row w-100 overflow-auto">
        <Navbar />
        <Outlet />
      </div>
    </>
  )
}

export default Layout