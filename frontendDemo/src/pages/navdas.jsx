import React from 'react'
// import Navbar from '../Navbar2/components/Navbar2'
import Navbar from '../components/Navbar2'
import './navdas.css'
function navdas() {
    return (
        <div className="App">
          <Navbar />
          <div className="container-fluid">
            <div className="row">
              <div className="col-md-3 d-none d-md-block"></div>
              <div className="col-md-9 p-4">
                <h1>Main Content</h1>
                <p>Your content goes here...</p>
              </div>
            </div>
          </div>
        </div>
      )
}

export default navdas