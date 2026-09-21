import React, { useState } from 'react';
import axios from 'axios';

const EWayBillForm = ({ orderId, profile }) => {
  const linkone = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

  const [formData, setFormData] = useState({
    supplyType: 'O', // required
    subSupplyType: '1', // required
    transactionType: '1', // required
    transporterName: '',
    transporterId: '',
    transDocNo: '',
    // transDocDate: new Date(),
    transDocDate: '',
    vehicleNo: '',
    vehicleType: 'R',
    transMode: '',
    transDistance: '0', // required
  });

  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };


  // const handleDownloadEwayBill = async (ewbNo) => {
  //   if (!ewbNo) return alert('❌ Invalid EWB number');

  //   setLoading(true); // Start spinner
  //   try {
  //     const response = await axios.get(`${linkone}/api/ewaybill/pdf/${ewbNo}`, {
  //       responseType: 'blob', // Important for binary data
  //     });

  //     const blob = new Blob([response.data], { type: 'application/pdf' });
  //     const url = window.URL.createObjectURL(blob);

  //     const link = document.createElement('a');
  //     link.href = url;
  //     link.download = `ewaybill_${ewbNo}.pdf`;
  //     document.body.appendChild(link);
  //     link.click();

  //     // Cleanup
  //     link.remove();
  //     window.URL.revokeObjectURL(url);

  //   } catch (err) {
  //     console.error('Error downloading PDF:', err);
  //     setError('Failed to download PDF');
  //   } finally {
  //     setLoading(false); // Stop spinner
  //   }
  // }

  const handleDownloadEwayBill = async (ewbNo , profile) => {
    if (!ewbNo) return alert('❌ Invalid EWB number');

    // setLoading(true); // Start spinner
    alert('Downloading PDF...');
    try {
      const response = await axios.get(`${linkone}/api/ewaybill/pdf/${ewbNo}/${profile.gstin}/${profile.eWayUserName}/${profile.eWayPassword}`, {
        responseType: 'blob', // Important for binary data
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `ewaybill_${ewbNo}.pdf`;
      document.body.appendChild(link);
      link.click();

      // Cleanup
      link.remove();
      window.URL.revokeObjectURL(url);

    } catch (err) {
      console.error('Error downloading PDF:', err);
      alert('❌ Failed to download PDF');
    } finally {
      // setLoading(false); // Stop spinner
      alert('✅ Download complete');
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${linkone}/api/ewaybill/generate/${orderId}`, formData, {
        headers: {
          'x-auth-token': localStorage.getItem('token'),
        }
      });

      await handleDownloadEwayBill(res.data.data.ewayBillNo, profile);
      setResponse(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="container">

      <form onSubmit={handleSubmit} className="row g-4">

        {/* 🚚 Logistics Department */}
        <div className="col-12">
          <div className="card shadow-sm">
            <div className="card-header bg-light">
              <i className="bi bi-truck-front-fill me-2 text-success"></i>
              Logistics / Transport Department
            </div>
            <div className="card-body row g-3">
              <div className="col-md-3">
                <label className="form-label">Trans Name</label>
                <input type="text" className={`form-control shadow-sm bg-white ${formData.transporterName ? 'is-valid' : ''}`} name="transporterName" value={formData.transporterName} onChange={handleChange} />
              </div>

              <div className="col-md-3">
                <label className="form-label">Trans GST/ID</label>
                <input type="text" className={`form-control shadow-sm bg-white ${formData.transporterId ? 'is-valid' : ''}`} name="transporterId" value={formData.transporterId} onChange={handleChange} />
              </div>

              <div className="col-md-3">
                <label className="form-label">Trans Doc No</label>
                <input type="text" className={`form-control shadow-sm bg-white ${formData.transDocNo ? 'is-valid' : ''}`} name="transDocNo" value={formData.transDocNo} onChange={handleChange} />
              </div>

              <div className="col-md-3">
                <label className="form-label">Trans Mode</label>
                <select className={`form-select shadow-sm bg-white ${formData.transMode ? 'is-valid' : ''}`} name="transMode" value={formData.transMode} onChange={handleChange} >
                  <option value="">Select</option>
                  <option value="1">Road</option>
                  <option value="2">Rail</option>
                  <option value="3">Air</option>
                  <option value="4">Ship</option>
                </select>
              </div>

              <div className="col-md-3">
                <label className="form-label">Trans Doc Date</label>
                <input type="date" className={`form-control shadow-sm bg-white ${formData.transDocDate ? 'is-valid' : ''}`} name="transDocDate"
                  // value={formData.transDocDate ? new Date(formData.transDocDate).toISOString().split('T')[0] : ''}
                  value={formData.transDocDate}
                  onChange={handleChange} />
              </div>

              <div className="col-md-3">
                <label className="form-label">Vehicle Number</label>
                <input type="text" className={`form-control shadow-sm bg-white ${formData.vehicleNo ? 'is-valid' : ''}`} name="vehicleNo" value={formData.vehicleNo} onChange={handleChange} />
              </div>

              <div className="col-md-3">
                <label className="form-label">Vehicle Type</label>
                <select className={`form-select shadow-sm bg-white ${formData.vehicleType ? 'is-valid' : ''}`} name="vehicleType" value={formData.vehicleType} onChange={handleChange}>
                  <option value="">Select</option>
                  <option value="R">Regular</option>
                  <option value="O">ODC</option>
                </select>
              </div>



              <div className="col-md-3">
                <label className="form-label">Distance (in KM)</label>
                <input type="number" className={`form-control shadow-sm bg-white ${formData.transDistance ? 'is-valid' : 'is-invalid'}`} name="transDistance" value={formData.transDistance} onChange={handleChange} />
              </div>
            </div>
          </div>
        </div>

        {/* 💰 Accounts Department */}
        <div className="col-12">
          <div className="card shadow-sm">
            {/* <div className="card-header bg-light">
          <i className="bi bi-receipt-cutoff me-2 text-warning"></i>
          Accounts & Billing Department
        </div> */}
            <div className="card-header bg-light">
              <i className="bi bi-shield-check me-2 text-info"></i>
              Compliance / GST Department
            </div>
            <div className="card-body row g-3">
              <div className="col-md-4">
                <label className="form-label">Supply Type</label>
                <select className={`form-select shadow-sm bg-white ${formData.supplyType ? 'is-valid' : 'is-invalid'}`} name="supplyType" value={formData.supplyType} onChange={handleChange} required>
                  <option value="">Select</option>
                  <option value="O">Outward</option>
                  <option value="I">Inward</option>
                </select>
              </div>

              <div className="col-md-4">
                <label className="form-label">Sub Supply Type</label>
                <select className={`form-select shadow-sm bg-white ${formData.subSupplyType ? 'is-valid' : 'is-invalid'}`} name="subSupplyType" value={formData.subSupplyType} onChange={handleChange} required>
                  <option value="">Select</option>
                  <option value="1">Supply</option>
                  <option value="2">Import</option>
                  <option value="3">Export</option>
                  <option value="4">Job Work</option>
                  <option value="5">For Own Use</option>
                  <option value="6">Job work Returns</option>
                  <option value="7">Sales Return</option>
                  <option value="8">Others</option>
                </select>
              </div>

              <div className="col-md-4">
                <label className="form-label">Transaction Type</label>
                <select className={`form-select shadow-sm bg-white ${formData.transactionType ? 'is-valid' : 'is-invalid'}`} name="transactionType" value={formData.transactionType} onChange={handleChange} required>
                  <option value="">Select</option>
                  <option value="1">Regular</option>
                  <option value="2">Bill To - Ship To</option>
                  <option value="3">Bill From - Dispatch From</option>
                  <option value="4">Combination of 2 and 3</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="col-12 text-center mt-4">
          <button type="submit" className="btn btn-primary px-5" disabled={loading}>
            <i className="bi bi-file-earmark-arrow-up me-2"></i>
            {loading ? 'Generating...' : 'Generate E-Way Bill'}
          </button>
        </div>
      </form>

      {/* Success Message */}
      {/* {response && (
        <div className="alert alert-success mt-4">
          <strong><i className="bi bi-check-circle-fill me-2"></i> E-Way Bill Generated!</strong><br />
          EWB No: {response.ewbDetails.ewbNo}<br />
          Valid Till: {new Date(response.ewbDetails.validTill).toLocaleDateString()}
        </div>
      )} */}
      {response && (
        <div className="alert alert-success mt-4">
          <strong>E-Way Bill Generated!</strong><br />
          EWB No: {response.data.ewayBillNo}<br />
          EWB Date: {response.data.ewayBillDate}<br />
          Valid Till: {response.data.validUpto}<br />
          alert: {response.data.alert}<br />
          <i className="bi bi-check-circle-fill me-2"></i> E-Way Bill generated successfully.
          <br />
          <i className="bi bi-info-circle-fill me-2"></i> You can download the E-Way Bill PDF using the button below.
          {/*<br />
          <button className="btn btn-success mt-3" onClick={() => handleDownloadEwayBill(response.data.ewayBillNo)}>
            <i className="bi bi-file-earmark-arrow-down me-2"></i>
          </button>*/}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="alert alert-danger mt-4">
          <i className="bi bi-exclamation-octagon-fill me-2"></i> {error}
        </div>
      )}

      {loading && (
        <span
          className="spinner-border spinner-border-sm"
          role="status"
          aria-hidden="true"
        >
        </span>
      )
      }
    </div>


  );
};

export default EWayBillForm;
