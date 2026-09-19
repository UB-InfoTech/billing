import { useState } from 'react';

const Navbar2 = () => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleNavbar = () => {
    setIsOpen(!isOpen);
  };

  return (
    <>
      {/* Navbar Toggle Button for Mobile */}
      <button 
        className="btn btn-primary d-md-none position-fixed top-0 start-0 m-3 z-3"
        onClick={toggleNavbar}
      >
        ☰ Menu
      </button>

      {/* Navbar */}
      <div 
        className={`bg-dark text-white vh-100 position-fixed top-0 start-0 z-2 
          ${isOpen ? 'translate-0' : '-translate-x-100'} 
          md:translate-x-0 transition-transform duration-300 ease-in-out`}
        style={{ width: '250px' }}
      >
        {/* Close Button for Mobile */}
        <button 
          className="btn btn-close btn-close-white d-md-none position-absolute top-0 end-0 m-2"
          onClick={toggleNavbar}
        ></button>

        {/* Navbar Content */}
        <div className="p-4">
          <h3 className="mb-4">Menu</h3>
          <ul className="nav flex-column">
            <li className="nav-item">
              <a href="#" className="nav-link text-white">Home</a>
            </li>
            <li className="nav-item">
              <a href="#" className="nav-link text-white">About</a>
            </li>
            <li className="nav-item">
              <a href="#" className="nav-link text-white">Services</a>
            </li>
            <li className="nav-item">
              <a href="#" className="nav-link text-white">Contact</a>
            </li>
          </ul>
        </div>
      </div>

      {/* Overlay for mobile when navbar is open */}
      {isOpen && (
        <div 
          className="position-fixed top-0 start-0 w-100 h-100 bg-black bg-opacity-50 d-md-none z-1"
          onClick={toggleNavbar}
        ></div>
      )}
    </>
  );
};

export default Navbar2;