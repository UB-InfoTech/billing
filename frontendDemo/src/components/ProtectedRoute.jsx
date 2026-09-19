// import React, { useState, useEffect } from 'react';
// import { Navigate } from 'react-router-dom';
// import axios from 'axios';
// // import jwtDecode from 'jwt-decode';

// const ProtectedRoute = ({ children }) => {
//   const [isAuthenticated, setIsAuthenticated] = useState(null);
//   const [error, setError] = useState('');

//   useEffect(() => {
//     const checkAuth = async () => {
//       const token = localStorage.getItem('token');

//       console.log('Checking token in ProtectedRoute:', token); // Debug log

//       if (!token) {
//         console.log('No token found in localStorage'); // Debug log
//         setError('No token found, please login');
//         setIsAuthenticated(false);
//         return;
//       }

//       try {

//         // // Check token expiration
//         // const decoded = jwtDecode(token);
//         // const currentTime = Date.now() / 1000;

//         // if (decoded.exp < currentTime) {
//         //   console.log('Token expired:', decoded); // Debug log
//         //   localStorage.removeItem('token');
//         //   setError('Session expired, please login again');
//         //   setIsAuthenticated(false);
//         //   return;
//         // }

//         // Verify token with backend
//         const res = await axios.get('http://localhost:5000/api/auth/user', {
//           headers: {
//             'x-auth-token': token
//           }
//         });
//         console.log('User data fetched:', res.data); // Debug log
//         setIsAuthenticated(true);
//       } catch (err) {
//         console.error('Auth check error:', err.message); // Debug log
//         localStorage.removeItem('token');
//         setError(err.response?.data?.msg || 'Authentication failed');
//         setIsAuthenticated(false);
//       }
//     };

//     checkAuth();

//     // // Token expiration checker
//     // const interval = setInterval(() => {
//     //   const token = localStorage.getItem('token');
//     //   if (token) {
//     //     const decoded = jwtDecode(token);
//     //     const currentTime = Date.now() / 1000;
//     //     if (decoded.exp < currentTime) {
//     //       console.log('Token expired in interval check'); // Debug log
//     //       localStorage.removeItem('token');
//     //       setError('Session expired, please login again');
//     //       setIsAuthenticated(false);
//     //     }
//     //   }
//     // }, 60000);

//     return () => clearInterval(interval);
//   }, []);

//   // if (isAuthenticated === null) {
//   //   return (
//   //     <div className="container mt-5">
//   //       <div className="alert alert-info text-center">
//   //         {error ? error : 'Checking authentication...'}
//   //       </div>
//   //     </div>
//   //   );
//   // }

//   return isAuthenticated ? children : <Navigate to="/login" replace state={{ error }} />;
// };

// export default ProtectedRoute


import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import jwtDecode from 'jwt-decode';

const ProtectedRoute = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');

      if (!token) {
        setError('No token found, please login');
        setIsAuthenticated(false);
        return;
      }

      try {
        const decoded = jwtDecode(token);
        const currentTime = Date.now() / 1000;

        if (decoded.exp < currentTime) {
          localStorage.removeItem('token');
          setError('Session expired, please login again');
          setIsAuthenticated(false);
          return;
        }

        // const res = await axios.get(`${linkone}/api/auth/user`, {
        //   headers: {
        //     'x-auth-token': token
        //   }
        // });
        // console.log('User data fetched:', res.data); // Debug log
        setIsAuthenticated(true);

      } catch (err) {
        console.error('ProtectedRoute - Error:', err.response?.data, err.message); // Debug log
        localStorage.removeItem('token');
        setError(err.response?.data?.msg || 'Authentication failed');
        setIsAuthenticated(false);
      }
    };

    checkAuth();

    const interval = setInterval(() => {
      const token = localStorage.getItem('token');
      if (token) {
        const decoded = jwtDecode(token);
        const currentTime = Date.now() / 1000;
        if (decoded.exp < currentTime) {
          localStorage.removeItem('token');
          setError('Session expired, please login again');
          setIsAuthenticated(false);
        }
      }
    }, 60);

    return () => clearInterval(interval);
  }, []);

  if (isAuthenticated === null) {
    return (
      <div className="container mt-5">
        <div className="alert alert-info text-center">
          {error ? error : 'Checking authentication...'}
        </div>
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" replace state={{ error }} />;
};

export default ProtectedRoute;