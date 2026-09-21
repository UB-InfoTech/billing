import React from 'react'
// import "../App.css";
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

function Navbar() {
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/login');
    };
    return (
        <>
            {/* Dashboard: <i className="bi bi-bar-chart"></i> - For analytics or insights. */}
            {/* Clients: <i className="bi bi-people"></i> - For client management. */}
            {/* Orders: <i className="bi bi-cart3"></i> - For order management. */}
            {/* Settings: <i className="bi bi-gear"></i> - For configuration. */}
            <nav className="bg-light border-end vh-auto p-3 min-vh-100">
                <h4>Admin Dashboard</h4>
                <ul className="nav flex-column row-gap-3">
                    <li className="nav-item"><div className="nav-link d-flex align-items-baseline gap-4"><h2><i className="bi bi-speedometer2 text-primary"></i></h2><h5><Link to="/dashboard" className="text-primary-emphasis">Dashboard</Link></h5></div></li>
                    <li className="nav-item">
                        <div className="nav-link d-flex align-items-baseline gap-4">
                            <h2>
                                {/* <i class="bi bi-graph-up-arrow"></i> */}

                                <svg xmlns="http://www.w3.org/2000/svg" height="27px" viewBox="0 -960 960 960" width="27px" fill="#052c65"><path d="m136-240-56-56 296-298 160 160 208-206H640v-80h240v240h-80v-104L536-320 376-480 136-240Z" /></svg>
                            </h2>
                            <h5>
                                <Link to="/analytics" className="text-primary-emphasis">Analytics</Link>
                            </h5>
                        </div>
                    </li>
                    <li className="nav-item">
                        <div className="nav-link d-flex align-items-baseline gap-4">
                            <h2>
                                {/* <IoAnalyticsOutline /> */}
                                <svg xmlns="http://www.w3.org/2000/svg" height="27px" viewBox="0 -960 960 960" width="27px" fill="#052c65"><path d="M440-600v-120H320v-80h120v-120h80v120h120v80H520v120h-80ZM280-80q-33 0-56.5-23.5T200-160q0-33 23.5-56.5T280-240q33 0 56.5 23.5T360-160q0 33-23.5 56.5T280-80Zm400 0q-33 0-56.5-23.5T600-160q0-33 23.5-56.5T680-240q33 0 56.5 23.5T760-160q0 33-23.5 56.5T680-80ZM40-800v-80h131l170 360h280l156-280h91L692-482q-11 20-29.5 31T622-440H324l-44 80h480v80H280q-45 0-68.5-39t-1.5-79l54-98-144-304H40Z" /></svg>
                            </h2>
                            <h5>
                                <Link to="/orders" className='text-primary-emphasis' >Bills</Link>
                            </h5>
                        </div>
                    </li>
                    <li className="nav-item">
                        <div className="nav-link d-flex align-items-baseline gap-4">
                            <h2>
                                {/* <IoAnalyticsOutline /> */}
                                <svg xmlns="http://www.w3.org/2000/svg" height="27px" viewBox="0 -960 960 960" width="27px" fill="#052c65"><path d="M720-400v-120H600v-80h120v-120h80v120h120v80H800v120h-80Zm-360-80q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM40-160v-112q0-34 17.5-62.5T104-378q62-31 126-46.5T360-440q66 0 130 15.5T616-378q29 15 46.5 43.5T680-272v112H40Zm80-80h480v-32q0-11-5.5-20T580-306q-54-27-109-40.5T360-360q-56 0-111 13.5T140-306q-9 5-14.5 14t-5.5 20v32Zm240-320q33 0 56.5-23.5T440-640q0-33-23.5-56.5T360-720q-33 0-56.5 23.5T280-640q0 33 23.5 56.5T360-560Zm0-80Zm0 400Z" /></svg>
                            </h2>
                            <h5>
                                <Link to="/clients" className="text-primary-emphasis">Clients</Link>
                            </h5>
                        </div>
                    </li>
                    <li className="nav-item">
                        <div className="nav-link d-flex align-items-baseline gap-4">
                            <h2>
                                {/* <IoAnalyticsOutline /> */}
                                <svg xmlns="http://www.w3.org/2000/svg" height="27px" viewBox="0 -960 960 960" width="27px" fill="#052c65"><path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z" /></svg>
                            </h2>
                            <h5>
                                <Link to="/products" className="text-primary-emphasis">Products</Link>
                            </h5>
                        </div>
                    </li>
                    <li className="nav-item">
                        <div className="nav-link d-flex align-items-baseline gap-4">
                            <h2>
                                <svg xmlns="http://www.w3.org/2000/svg" height="27px" viewBox="0 -960 960 960" width="27px" fill="#052c65"><path d="M480-40q-112 0-206-51T120-227v107H40v-240h240v80h-99q48 72 126.5 116T480-120q75 0 140.5-28.5t114-77q48.5-48.5 77-114T840-480h80q0 91-34.5 171T791-169q-60 60-140 94.5T480-40Zm-36-160v-52q-47-11-76.5-40.5T324-370l66-26q12 41 37.5 61.5T486-314q33 0 56.5-15.5T566-378q0-29-24.5-47T454-466q-59-21-86.5-50T340-592q0-41 28.5-74.5T446-710v-50h70v50q36 3 65.5 29t40.5 61l-64 26q-8-23-26-38.5T482-648q-35 0-53.5 15T410-592q0 26 23 41t83 35q72 26 96 61t24 77q0 29-10 51t-26.5 37.5Q583-274 561-264.5T514-250v50h-70ZM40-480q0-91 34.5-171T169-791q60-60 140-94.5T480-920q112 0 206 51t154 136v-107h80v240H680v-80h99q-48-72-126.5-116T480-840q-75 0-140.5 28.5t-114 77q-48.5 48.5-77 114T120-480H40Z" /></svg>
                            </h2>
                            <h5>
                                <Link to="/expense" className="text-primary-emphasis">Expences</Link>
                            </h5>
                        </div>
                    </li>
                    <li className="nav-item">
                        <div className="nav-link d-flex align-items-baseline gap-4">
                            <h2>
                                <svg xmlns="http://www.w3.org/2000/svg" height="27px" viewBox="0 -960 960 960" width="27px" fill="#052c65"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v240H160v240h400v80H160Zm0-480h640v-80H160v80ZM760-80v-120H640v-80h120v-120h80v120h120v80H840v120h-80ZM160-240v-480 480Z" /></svg>
                            </h2>
                            <h5>
                                <Link to="/add-expense" className="text-primary-emphasis">Add-Expences</Link>
                            </h5>
                        </div>
                    </li>
                    <li className="nav-item">
                        <div className="nav-link d-flex align-items-baseline gap-4">
                            <h2>
                                {/* <IoAnalyticsOutline /> */}
                                <svg xmlns="http://www.w3.org/2000/svg" height="27px" viewBox="0 -960 960 960" width="27px" fill="#052c65"><path d="M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Zm0 0v-80 80Zm280 240q-17 0-28.5-11.5T440-440q0-17 11.5-28.5T480-480q17 0 28.5 11.5T520-440q0 17-11.5 28.5T480-400Zm-160 0q-17 0-28.5-11.5T280-440q0-17 11.5-28.5T320-480q17 0 28.5 11.5T360-440q0 17-11.5 28.5T320-400Zm320 0q-17 0-28.5-11.5T600-440q0-17 11.5-28.5T640-480q17 0 28.5 11.5T680-440q0 17-11.5 28.5T640-400ZM480-240q-17 0-28.5-11.5T440-280q0-17 11.5-28.5T480-320q17 0 28.5 11.5T520-280q0 17-11.5 28.5T480-240Zm-160 0q-17 0-28.5-11.5T280-280q0-17 11.5-28.5T320-320q17 0 28.5 11.5T360-280q0 17-11.5 28.5T320-240Zm320 0q-17 0-28.5-11.5T600-280q0-17 11.5-28.5T640-320q17 0 28.5 11.5T680-280q0 17-11.5 28.5T640-240Z" /></svg>
                            </h2>
                            <h5>
                    <li className="nav-item"><div className="nav-link d-flex align-items-baseline gap-4"><h2><i className="bi bi-file-earmark-minus text-primary"></i></h2><h5><Link to="/credit-notes" className="text-primary-emphasis">Credit Notes</Link></h5></div></li>
                                <Link to="/calendar" className="text-primary-emphasis">Calendar</Link>
                            </h5>
                        </div>
                    </li>
                    <li className="nav-item">
                        <div className="nav-link d-flex align-items-baseline gap-4">
                            <h2>
                                {/* <IoAnalyticsOutline /> */}
                                <svg xmlns="http://www.w3.org/2000/svg" width="23px" height="23px" fill="#052c65" className="bi bi-person-circle" viewBox="0 0 16 16">
                                    <path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0" />
                                    <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m8-7a7 7 0 0 0-5.468 11.37C3.242 11.226 4.805 10 8 10s4.757 1.225 5.468 2.37A7 7 0 0 0 8 1" />
                                </svg>
                            </h2>
                            <h5>
                                <Link to="/profile" className="text-primary-emphasis">Profile</Link>
                            </h5>
                        </div>
                    </li>
                    {/* logout */}
                    <li className="nav-item">
                        <div className="nav-link d-flex align-items-baseline gap-4">
                            <button
                                className="btn btn-danger"
                                onClick={handleLogout}
                            >
                                {/* <Link to="/login" className="text-primary-emphasis">Logout</Link> */}
                                Logout
                            </button>
                            <h5>
                            </h5>
                        </div>
                    </li>
                </ul>
            </nav>
        </>
    );
}

export default Navbar




// import React from 'react'
// import { NavLink } from 'react-router-dom';

// function Navbar() {
//   return (
//     <nav className="navbar navbar-expand-lg navbar-dark bg-dark mb-4">
//       <div className="container">
//         <NavLink className="navbar-brand" to="/">
//           <i className="bi bi-wallet2 me-2"></i> POS Expense Manager
//         </NavLink>
//         <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
//           <span className="navbar-toggler-icon"></span>
//         </button>
//         <div className="collapse navbar-collapse" id="navbarNav">
//           <ul className="navbar-nav ms-auto">
//             <li className="nav-item">
//               <NavLink className="nav-link" to="/">
//                 <i className="bi bi-list-ul me-2"></i> Expenses
//               </NavLink>
//             </li>
//             <li className="nav-item">
//               <NavLink className="nav-link" to="/add-expense">
//                 <i className="bi bi-plus-circle me-2"></i> Add Expense
//               </NavLink>
//             </li>
//           </ul>
//         </div>
//       </div>
//     </nav>
//   );
// }

// export default Navbar;