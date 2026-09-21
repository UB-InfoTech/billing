// using
import React, { useEffect, useState } from 'react';
import { createProduct, fetchProducts, updateProduct, searchProductByBarcode } from '../services/productService';
import axios from 'axios';
import { Html5QrcodeScanner } from "html5-qrcode";


export default function ProductPage() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({});
  const [images, setImages] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [error, setError] = useState('');
  const barcodeString = "E:/POS/Demo/backend"; // Adjust this to your backend URL

  // Fetch products initially
  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    const res = await fetchProducts();
    setProducts(res.data.products);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleImageChange = (e) => {
    setImages([...e.target.files]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const formData = new FormData();
    ['productName','productCode','description','rate','quantity','serialNumber','designNo','purchaseDate','purchasePrice','barcode','minStock']
      .forEach((key) => {
        if (form[key] !== undefined && form[key] !== null) {
          formData.append(key, form[key]);
        }
      });
    images.forEach((img) => formData.append('images', img));

    try {
      if (editingProduct?._id) {
        await updateProduct(editingProduct._id, formData);
      } else {
        await createProduct(formData);
      }

      setForm({});
      setImages([]);
      setEditingProduct(null);
      await loadProducts();
    } catch (err) {
      console.error('Product save error:', err);
      setError(err.response?.data?.message || err.message || 'Unable to save product.');
    }
  };

  const handleEdit = (product) => {
    setForm(product);
    setEditingProduct(product);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const BASE_URL = 'http://localhost:5000/api/products';
 

  const handleBarcodeSearch = async (code) => {
    try {
      const res = await searchProductByBarcode(code);
      const product = res.data.product;
      if (product) {
        alert(`✅ Product: ${product.productName}`);
        // or set into form/edit modal
      } else {
        alert('❌ No product found for this barcode');
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 });
    scanner.render((text) => {
      handleBarcodeSearch(text);
    });
    return () => scanner.clear();
  }, []);

  return (
    // <div className="container py-4">
    <div className="w-100 mx-3 mt-3">
      <h2 className="mb-4 text-primary">🧵 Product Management</h2>
      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={handleSubmit} className="mb-2 p-4 border rounded bg-light shadow-sm ">
        <div className="row row-gap-1 mb-3">
          <div className="col-md-3">
            <input
              name="productName"
              value={form.productName || ''}
              placeholder="Product Name"
              className="form-control"
              onChange={handleChange}
              required
            />
          </div>
          <div className="col-md-3">
            <input
              name="rate"
              type="number"
              value={form.rate || ''}
              placeholder="Rate"
              className="form-control"
              onChange={handleChange}
            />
          </div>
          {/* <div className="col-md-3">
            <input
              name="quantity"
              type="number"
              value={form.quantity || ''}
              placeholder="Quantity"
              className="form-control"
              onChange={handleChange}
            />
          </div> */}
          <div className="col-md-3">
            <input
              name="designNo"
              value={form.designNo || ''}
              placeholder="Design No."
              className="form-control"
              onChange={handleChange}
            />
          </div>

          <div className="mb-3 col-md-3">  
            <textarea
              name="description"
              value={form.description || ''}
              placeholder="Description"
              className="form-control"
              onChange={handleChange}
              style={{ height: '37.6px' }}
            />
          </div>

        </div>

        {/* <div className="row mb-3">
          <div className="col-md-6">
            <input
              name="purchasePrice"
              type="number"
              value={form.purchasePrice || ''}
              placeholder="Purchase Price"
              className="form-control"
              onChange={handleChange}
            />
          </div>
          <div className="col-md-6">
            <input
              name="purchaseDate"
              type="date"
              value={form.purchaseDate || ''}
              className="form-control"
              onChange={handleChange}
            />
          </div>
        </div> */}


        {/* <div className="mb-3">
          <input type="file" className="form-control" multiple onChange={handleImageChange} />
        </div> */}

        <button className="btn btn-success w-100">
          {editingProduct ? 'Update Product' : 'Add Product'}
        </button>
      </form>
      <input
        id="barcodeInput"
        type="text"
        className='mb-3 form-control w-auto'
        // style={{ top: -9999 }}
        placeholder="Enter barcode"
        onChange={(e) => handleBarcodeSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleBarcodeSearch(e.target.value);
            e.target.value = '';
          }
        }}
        />
      <div id="reader" className='d-none'></div>
      {/* FORM */}

      {/* PRODUCT GRID */}
      <div className="row">
        {products.map((product) => (
          <div className="col-md-4 mb-4" key={product._id}>
            <div className="card h-100 shadow-sm">
              {product.images?.[0] && (
                <img
                  src={product.images[0]}
                  className="card-img-top"
                  alt="product"
                  style={{ height: 200, objectFit: 'cover' }}
                />
              )}
              <div className="card-body">
                <div className="d-flex justify-content-between">
                  <h5 className="card-title">{product.productName}</h5>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => handleEdit(product)}
                  >
                    Edit
                  </button>
                  {/* You can add delete or view actions here */}
                </div>
                <p className="card-text">{product.description?.slice(0, 80)}</p>
                <ul className="list-unstyled small">
                  <li><strong>Rate:</strong> ₹{product.rate}</li>
                  <li><strong>Code:</strong> ₹{product.productCode}</li>
                  {/* <li><strong>Qty:</strong> {product.quantity}</li> */}
                  {/* <li><strong>Price:</strong> ₹{product.purchasePrice}</li> */}
                  {/* <li><strong>Date:</strong> {product.purchaseDate?.slice(0, 10)}</li> */}
                </ul>
                {/* {product.barcode && ( */}
                <div className="mt-2">
                  {/* <img src={"E:/POS/Demo/backend" + product.barcode} alt="barcode" style={{ width: 140 }} /> */}


                  {/* <img src={barcodeString +product.barcode} alt="barcode" style={{ width: 140 }} /> */}
                  {/* <img src={`${BASE_URL}/` + product.barcode} alt="barcode" style={{ width: 140 }} /> */}
                  {/* <img src={`http://localhost:5000/barcodes/barcode-P818825.png` } alt="barcode"  /> */}
                  {/* <img src={`E:/POS/Demo/backend/barcodes/barcode-P818825.png`} alt="barcode" />
                  <p className="small text-muted">Barcode: {`E:/POS/Demo/backend` + product.barcode}</p> */}
                </div>
                {/* )} */}
                
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
