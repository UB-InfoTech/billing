import React, { useState, useEffect } from 'react';
import axios from 'axios';
// import { io } from 'socket.io-client';
import { Html5QrcodeScanner } from "html5-qrcode";


const API_URL = 'http://localhost:5000/api/products';
// const API_URL = 'https://baba.divinesparks.in/api/products';

export default function ProductPage() {
  const [form, setForm] = useState({
    productName: '', rate: '', quantity: '',
    description: '', purchaseDate: '', purchasePrice: ''
  });
  const [images, setImages] = useState([]);
  const [products, setProducts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [modalData, setModalData] = useState({});
  // const socket = io('http://localhost:5000');
  // const socket = io('https://baba.divinesparks.in'); // Use this for production

  // // Load Products
  // useEffect(() => {
  //   loadProducts();
  //   socket.on('stockUpdate', (data) => {
  //     setProducts(prev =>
  //       prev.map(p => p._id === data.productId ? { ...p, stock: data.stock } : p)
  //     );
  //   });
  //   return () => socket.disconnect();
  // }, []);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 });
    scanner.render((text) => {
      handleBarcodeSearch(text);
    });
    return () => scanner.clear();
  }, []);

  const loadProducts = async () => {
    const res = await axios.get(API_URL);
    setProducts(res.data.products);
  };

  // Handle Form
  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const handleImageChange = (e) => setImages([...e.target.files]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    Object.keys(form).forEach(key => formData.append(key, form[key]));
    images.forEach(img => formData.append('images', img));

    const res = await axios.post(API_URL, formData);
    setForm({ productName: '', rate: '', quantity: '', description: '', purchaseDate: '', purchasePrice: '' });
    setImages([]);
    loadProducts();
  };

  // Handle Edit Modal
  const openEdit = (product) => {
    setModalData(product);
    setEditing(product._id);
    new bootstrap.Modal(document.getElementById('editModal')).show();
  };

  const handleEditChange = (e) =>
    setModalData({ ...modalData, [e.target.name]: e.target.value });

  const submitEdit = async () => {
    await axios.put(`${API_URL}/${editing}`, modalData);
    setEditing(null);
    loadProducts();
    bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();
  };

  return (
    <div className="container py-4">
      <h2 className="mb-4">🧵 Product Management</h2>
      {/* <div id="reader"></div> */}
      {/* Product Form */}
      <form onSubmit={handleSubmit} className="border p-4 rounded bg-light">
        <div className="row mb-3">
          <div className="col">
            <input name="productName" value={form.productName} placeholder="Product Name" className="form-control" onChange={handleChange} required />
          </div>
          <div className="col">
            <input name="rate" type="number" value={form.rate} placeholder="Rate" className="form-control" onChange={handleChange} required />
          </div>
        </div>
        <div className="row mb-3">
          <div className="col">
            <input name="quantity" type="number" value={form.quantity} placeholder="Quantity" className="form-control" onChange={handleChange} />
          </div>
          <div className="col">
            <input name="purchasePrice" type="number" value={form.purchasePrice} placeholder="Purchase Price" className="form-control" onChange={handleChange} />
          </div>
        </div>
        <div className="mb-3">
          <textarea name="description" value={form.description} placeholder="Description" className="form-control" onChange={handleChange} />
        </div>
        <div className="row mb-3">
          <div className="col">
            <input type="date" name="purchaseDate" value={form.purchaseDate} className="form-control" onChange={handleChange} />
          </div>
          <div className="col">
            <input type="file" className="form-control" multiple onChange={handleImageChange} />
          </div>
        </div>
        <button className="btn btn-primary w-100">Add Product</button>
      </form>

      {/* Product Grid */}
      <div className="row mt-5">
        {products.map(p => (
          <div key={p._id} className="col-md-4 mb-4">
            <div className="card h-100">
              {p.images?.[0] && (
                <img src={p.images[0]} className="card-img-top" style={{ objectFit: 'cover', maxHeight: 180 }} />
              )}
              <div className="card-body">
                <h5 className="card-title">{p.productName}</h5>
                <p className="card-text">{p.description}</p>
                <ul className="list-unstyled small">
                  <li><strong>Rate:</strong> ₹{p.rate}</li>
                  <li><strong>Qty:</strong> {p.quantity}</li>
                  <li><strong>Purchase:</strong> ₹{p.purchasePrice}</li>
                  {p.barcode && <li><img src={p.barcode} style={{ width: 100 }} /></li>}
                </ul>
                <button className="btn btn-sm btn-outline-primary w-100 mt-2" onClick={() => openEdit(p)}>Edit</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      <div className="modal fade" id="editModal" tabIndex="-1">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Edit Product</h5>
              <button type="button" className="btn-close" data-bs-dismiss="modal" />
            </div>
            <div className="modal-body">
              <input className="form-control mb-2" name="productName" value={modalData.productName || ''} onChange={handleEditChange} placeholder="Product Name" />
              <input className="form-control mb-2" name="rate" value={modalData.rate || ''} onChange={handleEditChange} placeholder="Rate" type="number" />
              <input className="form-control mb-2" name="quantity" value={modalData.quantity || ''} onChange={handleEditChange} placeholder="Quantity" type="number" />
              <textarea className="form-control mb-2" name="description" value={modalData.description || ''} onChange={handleEditChange} placeholder="Description" />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button className="btn btn-primary" onClick={submitEdit}>Save</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
