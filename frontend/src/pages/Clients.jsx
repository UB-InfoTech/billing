import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import editSVG from '../assets/edit.svg';
import deleteSVG from '../assets/delete.svg';
import * as XLSX from 'xlsx';

function Clients() {

  const linkone = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
  
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [newClient, setNewClient] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    state: '',
    city: '',
    pinCode: '',
    stateCode: '',
    gstNumber: '',
    companyName: '',
    businessType: '',
    paymentTerms: '30',
    discountRate: 0,
    accountStatus: 'Active',
    notes: ''
  });

  // -----
  const [editClient, setEditClient] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [filters, setFilters] = useState({
    businessType: '',
    accountStatus: '',
    minRevenue: '',
    maxRevenue: ''
  });

  const [sortKey, setSortKey] = useState('orderNumber'); // default
  const [sortClient, setSortClient] = useState('asc'); // default


  const [editingClient, setEditingClient] = useState(null);

  useEffect(() => {
    // setLoading(true);
    fetchClients();
    // setLoading(false);
  }, []);

  const token = localStorage.getItem('token');
  const authConfig = { headers: { "x-auth-token": token || "" } };
  if (!token) {
    throw new Error('No token found');
  }
  const fetchClients = async () => {
    try {


      const response = await axios.get(`${linkone}/api/clients`, {
        headers: {
          'x-auth-token': token
        }
      });
      setClients(response.data);
    } catch (error) {
      // alert(error.response.data.msg);
      if (error.response && error.response.data && error.response.data.msg === "Token is not valid") {
        localStorage.removeItem('token');
        window.location.reload();
      }
      console.error('Error fetching clients', error);
    }
  };

  const fetchGstDetails = async (gstNumber) => {
    try {
      const stateCode = gstNumber.slice(0, 2);
      const pan = gstNumber.slice(2, 12);
      const entityNumber = gstNumber[12];
      const gstinStates = {
        '01': 'Jammu and Kashmir',
        '02': 'Himachal Pradesh',
        '03': 'Punjab',
        '04': 'Chandigarh',
        '05': 'Uttarakhand',
        '06': 'Haryana',
        '07': 'Delhi',
        '08': 'Rajasthan',
        '09': 'Uttar Pradesh',
        '10': 'Bihar',
        '11': 'Sikkim',
        '12': 'Arunachal Pradesh',
        '13': 'Nagaland',
        '14': 'Manipur',
        '15': 'Mizoram',
        '16': 'Tripura',
        '17': 'Meghalaya',
        '18': 'Assam',
        '19': 'West Bengal',
        '20': 'Jharkhand',
        '21': 'Odisha',
        '22': 'Chhattisgarh',
        '23': 'Madhya Pradesh',
        '24': 'Gujarat',
        // '25': 'Daman and Diu',//
        '26': 'Dadra and Nagar Haveli and Daman and Diu',
        '27': 'Maharashtra',
        // '28': 'Andhra Pradesh (Old)', // /?
        '29': 'Karnataka',
        '30': 'Goa',
        '31': 'Lakshadweep',
        '32': 'Kerala',
        '33': 'Tamil Nadu',
        '34': 'Puducherry',
        '35': 'Andaman and Nicobar Islands',//
        '36': 'Telangana',
        '37': 'Andhra Pradesh',
        '38': 'Ladakh',
        '97': 'Other Territory',
        '99': 'Other Country'
      };

      const stateName = gstinStates[stateCode] || 'Unknown';

      const response = await axios.get(`${linkone}/api/gstdetails/${gstNumber}`, authConfig);

      if (!response.data || !response.data.success) {
        throw new Error('Failed to fetch GST details');
      }

      const gstData = response.data.data;

      setNewClient(prev => ({
        ...prev,
        stateCode: gstData.stateCode || stateCode,
        name: gstData.tradeName || '',
        address: `${gstData.address1 || ''}, ${gstData.address2 || ''}`,
        pinCode: gstData.pinCode,
        companyName: gstData.legalName,
        accountStatus: gstData.status === 'ACT' ? 'Active' : 'Inactive',
        state: stateName,
        // stateCode: stateCode,
      }));

      // return gstData;
    } catch (error) {
      alert("❌ Error fetching GST details");
      // return null;
    }
  };

  const handleAddClient = async (e) => {
    e.preventDefault();
    try {

      await axios.post(`${linkone}/api/clients`, newClient, {
        headers: {
          'x-auth-token': token
        }
      });

      alert("✅ Client Added Successfully");
      setShowModal(false);

      setNewClient({
        name: '',
        email: '',
        phone: '',
        address: '',
        state: '',
        city: '',
        pinCode: '',
        stateCode: '',
        gstNumber: '',
        companyName: '',
        businessType: '',
        paymentTerms: '30',
        discountRate: 0,
        accountStatus: 'Active',
        notes: ''
      });
      fetchClients();
    } catch (error) {
      // alert(response.data.message);
      alert("❌ Error adding client");
      console.error('Error adding client', error);
    }
  };

  const handleEditClient = (client) => {
    setEditingClient(client._id);
    // setNewClient({ name: client.name, gstin: client.gstin, credit_limit: client.credit_limit, outstanding_balance: client.outstanding_balance });
    setNewClient(client);
    setShowModal(true);
  };

  const handleUpdateClient = async () => {
    try {
      await axios.patch(
        `${linkone}/api/clients/${editingClient}`,
        {
          name: newClient.name || '',
          email: newClient.email || '',
          phone: newClient.phone || '',
          address: newClient.address || '',
          state: newClient.state || '',
          city: newClient.city || '',
          pinCode: newClient.pinCode || '',
          stateCode: newClient.stateCode || '',
          gstNumber: newClient.gstNumber || '',
          companyName: newClient.companyName || '',
          businessType: newClient.businessType || '',
          paymentTerms: newClient.paymentTerms || '30',
          discountRate: Number(newClient.discountRate || 0),
          accountStatus: newClient.accountStatus || 'Active',
          notes: newClient.notes || ''
        },
        {
          headers: {
            'x-auth-token': token
          }
        }
      );

      alert("✅ Client Updated Successfully");
      setShowModal(false);
      setEditingClient(null);
      // setNewClient({ name: "", gstin: "", credit_limit: 0, outstanding_balance: 0 });
      setNewClient({
        name: '',
        email: '',
        phone: '',
        address: '',
        state: '',
        city: '',
        pinCode: '',
        stateCode: '',
        gstNumber: '',
        companyName: '',
        businessType: '',
        paymentTerms: '30 days',
        discountRate: 0,
        accountStatus: 'Active',
        notes: ''

      });

      fetchClients();
    } catch (error) {
      alert("❌ Error updating client");
      console.error('Error updating client', error);
    }
  };

  const handleDeleteClient = async (id) => {
    const password = prompt("Enter password to delete:");
    if (password === "123") {
      try {
        await axios.delete(`${linkone}/api/clients/${id}`, authConfig);
        alert("✅ Client Deleted Successfully");

        fetchClients();
      } catch (error) {
        // alert(response.data.message);
        console.error('❌ Error deleting client', error);
      }
    } else {
      alert("❌ Incorrect password");
    }
  };

  // Indian States and Union Territories
  const indianStates = [
    "Gujarat", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Haryana",
    "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands",
    "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh",
    "Lakshadweep", "Puducherry", "Other Territory", "Other Country"
  ];

  // Expanded State-City Mapping (more cities, still not exhaustive)
  const stateCityMapping = {
    "Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Kurnool", "Tirupati", "Rajahmundry", "Kadapa"],
    "Arunachal Pradesh": ["Itanagar", "Naharlagun", "Tawang", "Pasighat", "Ziro", "Bomdila", "Tezu"],
    "Assam": ["Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Nagaon", "Tezpur", "Tinsukia", "Bongaigaon"],
    "Bihar": ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga", "Purnia", "Arrah", "Begusarai"],
    "Chhattisgarh": ["Raipur", "Bhilai", "Bilaspur", "Korba", "Durg", "Jagdalpur", "Raigarh", "Ambikapur"],
    "Goa": ["Panaji", "Margao", "Vasco da Gama", "Mapusa", "Ponda", "Bicholim"],
    "Gujarat": ["Surat", "Ahmedabad", "Vadodara", "Rajkot", "Gandhinagar", "Bhavnagar", "Jamnagar", "Junagadh", "Anand"],
    "Haryana": ["Gurugram", "Faridabad", "Chandigarh", "Hisar", "Panipat", "Karnal", "Rohtak", "Sonipat", "Yamunanagar"],
    "Himachal Pradesh": ["Shimla", "Manali", "Dharamshala", "Kullu", "Mandi", "Solan", "Una", "Hamirpur"],
    "Jharkhand": ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Deoghar", "Hazaribagh", "Giridih", "Ramgarh"],
    "Karnataka": ["Bengaluru", "Mysuru", "Hubli", "Mangalore", "Belgaum", "Davangere", "Bellary", "Shimoga", "Tumkur"],
    "Kerala": ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kollam", "Kannur", "Alappuzha", "Kottayam"],
    "Madhya Pradesh": ["Bhopal", "Indore", "Gwalior", "Jabalpur", "Ujjain", "Sagar", "Rewa", "Satna", "Ratlam"],
    "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Nashik", "Aurangabad", "Thane", "Solapur", "Kolhapur", "Amravati", "Latur"],
    "Manipur": ["Imphal", "Thoubal", "Bishnupur", "Churachandpur", "Ukhrul", "Senapati"],
    "Meghalaya": ["Shillong", "Tura", "Nongstoin", "Jowai", "Williamnagar"],
    "Mizoram": ["Aizawl", "Lunglei", "Champhai", "Saiha", "Kolasib"],
    "Nagaland": ["Kohima", "Dimapur", "Mokokchung", "Wokha", "Tuensang", "Zunheboto"],
    "Odisha": ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur", "Puri", "Balasore", "Baripada"],
    "Punjab": ["Chandigarh", "Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali", "Hoshiarpur"],
    "Rajasthan": ["Jaipur", "Udaipur", "Jodhpur", "Kota", "Ajmer", "Bikaner", "Alwar", "Sikar", "Bhilwara"],
    "Sikkim": ["Gangtok", "Pelling", "Namchi", "Gyalshing", "Mangan"],
    "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Salem", "Tiruchirappalli", "Tirunelveli", "Erode", "Vellore", "Dindigul"],
    "Telangana": ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam", "Mahbubnagar", "Adilabad"],
    "Tripura": ["Agartala", "Udaipur", "Dharmanagar", "Kailashahar", "Belonia"],
    "Uttar Pradesh": ["Lucknow", "Kanpur", "Varanasi", "Agra", "Meerut", "Ghaziabad", "Noida", "Allahabad", "Bareilly", "Moradabad"],
    "Uttarakhand": ["Dehradun", "Haridwar", "Rishikesh", "Nainital", "Mussoorie", "Almora", "Haldwani", "Roorkee"],
    "West Bengal": ["Kolkata", "Darjeeling", "Siliguri", "Howrah", "Durgapur", "Asansol", "Malda", "Kharagpur", "Haldia"],
    "Andaman and Nicobar Islands": ["Port Blair", "Havelock Island", "Neil Island"],
    "Chandigarh": ["Chandigarh"],
    "Dadra and Nagar Haveli and Daman and Diu": ["Daman", "Silvassa", "Diu"],
    "Delhi": ["New Delhi", "East Delhi", "West Delhi", "South Delhi", "North Delhi"],
    "Jammu and Kashmir": ["Srinagar", "Jammu", "Anantnag", "Baramulla", "Kathua", "Udhampur"],
    "Ladakh": ["Leh", "Kargil"],
    "Lakshadweep": ["Kavaratti", "Agatti", "Minicoy"],
    "Puducherry": ["Puducherry", "Karaikal", "Mahe", "Yanam"]
  };


  // Sorting function
  const sortedClients = useMemo(() => {
    let sortableClients = [...clients];
    if (sortConfig.key) {
      sortableClients.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
        if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableClients;
  }, [clients, sortConfig]);

  // Filtering function
  const filteredClients = useMemo(() => {
    return sortedClients.filter(client => {
      const revenueNum = client.totalRevenue;
      // const revenueNum = parseInt(client.totalRevenue.replace('$', ''));
      return (
        client.companyName.toLowerCase().includes(search.toLowerCase()) &&
        (filters.businessType === '' || client.businessType === filters.businessType) &&
        (filters.accountStatus === '' || client.accountStatus === filters.accountStatus) &&
        (filters.minRevenue === '' || revenueNum >= parseInt(filters.minRevenue)) &&
        (filters.maxRevenue === '' || revenueNum <= parseInt(filters.maxRevenue))
      );
    });
  }, [sortedClients, search, filters]);

  // Pagination
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentClients = filteredClients.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);

  // // Handlers
  // const handleSort = (key) => {
  //   setSortConfig({
  //     key,
  //     direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
  //   });
  // };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortClient(sortClient === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortClient('asc');
    }
  };

  const sortedData = [...filteredClients].sort((a, b) => {
    // const sortedData = [...orders].sort((a, b) => {
    let aVal = a[sortKey];
    let bVal = b[sortKey];

    // // Handle date comparison
    // if (sortKey === 'orderDate') {
    //   aVal = new Date(aVal);
    //   bVal = new Date(bVal);
    // }

    // Handle number comparison
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortClient === 'asc' ? aVal - bVal : bVal - aVal;
    }

    // Default string comparison
    return sortClient === 'asc'
      ? aVal?.toString().localeCompare(bVal?.toString())
      : bVal?.toString().localeCompare(aVal?.toString());
  });


  const handleExportExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(filteredClients);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Clients');
    XLSX.writeFile(workbook, 'clients_report.xlsx');
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return '';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* <div className="container mt-3"> */}
      <div className="w-100 mx-3 mt-3">
        <div className="d-flex align-items-center gap-4">
          <h2>Client Management</h2>
          <button className="btn btn-primary" onClick={() => { setShowModal(true); }}>Add New Client</button>
        </div>

        <div className="py-2">
          <div className="card p-3">
            {/* Filters and Search */}
            <div className="row mb-3 g-3">
              <div className="col-md-3">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search by name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="col-md-2">
                <select
                  className="form-select"
                  value={filters.businessType}
                  onChange={(e) => setFilters({ ...filters, businessType: e.target.value })}
                >
                  <option value="">All Business Types</option>
                  <option value="Retail">Retail</option>
                  <option value="Wholesale">Wholesale</option>
                  <option value="Service">Service</option>
                </select>
              </div>
              <div className="col-md-2">
                <select
                  className="form-select"
                  value={filters.accountStatus}
                  onChange={(e) => setFilters({ ...filters, accountStatus: e.target.value })}
                >
                  <option value="">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div className="col-md-2">
                <input
                  type="number"
                  className="form-control"
                  placeholder="Min Revenue"
                  value={filters.minRevenue}
                  onChange={(e) => setFilters({ ...filters, minRevenue: e.target.value })}
                />
              </div>
              <div className="col-md-2">
                <input
                  type="number"
                  className="form-control"
                  placeholder="Max Revenue"
                  value={filters.maxRevenue}
                  onChange={(e) => setFilters({ ...filters, maxRevenue: e.target.value })}
                />
              </div>
              <div className="col-md-1">
                <button className="btn btn-success w-100" onClick={handleExportExcel}>
                  Excel
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="table-responsive">
              <table className="table table-bordered table-striped table-hover">
                <thead className="">
                  <tr>
                    <th>#</th>
                    {[
                      ['companyName', 'Name'],
                      ['phone', 'Phone'],
                      ['address', 'Address'],
                      ['gstNumber', 'Gst No.'],
                      ['businessType', 'Business Type'],
                      ['paymentTerms', 'Payment Terms'],
                      ['discountRate', 'Dis%'],
                      ['orderCount', 'Order'],
                      ['totalRevenue', 'Total Revenue'],
                      ['accountStatus', 'A/C Status'],
                      ['notes', 'notes'],
                    ].map(([key, label]) => (
                      <th key={key} onClick={() => handleSort(key)} style={{ cursor: 'pointer' }}>
                        {label} {sortKey === key && (sortClient === 'asc' ? '↑' : '↓')}
                      </th>
                    ))}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {/* {currentClients.map((client, index) => ( */}
                  {sortedData.map((client, index) => (
                    <tr key={client._id}>
                      <td>{index + 1}</td>
                      {/* <td>{client.name}</td> */}
                      <td>{client.companyName}</td>
                      <td>{client.phone}</td>
                      <td>{client.address}</td>
                      <td>{client.gstNumber}</td>
                      <td>{client.businessType}</td>
                      <td>{client.paymentTerms} {client.paymentTerms !== 'Advance' && 'days'}</td>
                      <td>{client.discountRate} %</td>
                      <td>{client.orderCount}</td>
                      <td>{client.totalRevenue}</td>
                      <td>
                        <span className={`badge ${client.accountStatus === 'Active' ? 'bg-success' : 'bg-danger'}`}>
                          {client.accountStatus}
                        </span>
                      </td>
                      <td>{client.notes}</td>
                      <td>
                        <div className="d-flex gap-1">
                          <button className="btn btn-warning btn-sm" onClick={() => handleEditClient(client)}>
                            <img src={editSVG} alt="Edit" />
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteClient(client._id)}>
                            <img src={deleteSVG} alt="Delete" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2} className='text-end fw-bold'>Total: </td>
                    <td colSpan={7}></td>
                    <td colSpan={1} className="text-center fw-bold">₹{currentClients.reduce((sum, p) => sum + parseFloat(p.totalRevenue), 0)}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <nav aria-label="Page navigation">
              <ul className="pagination justify-content-center mt-3">
                <li className="page-item">
                  <button
                    className="page-link"
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                </li>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <li key={page} className={`page-item ${currentPage === page ? 'active' : ''}`}>
                    <button className="page-link" onClick={() => setCurrentPage(page)}>
                      {page}
                    </button>
                  </li>
                ))}
                <li className="page-item">
                  <button
                    className="page-link"
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                </li>
              </ul>
            </nav>

          </div>



          {showModal && (
            <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}>
              <div className="modal-dialog modal-dialog-centered modal-xl">
                <div className="modal-content shadow-lg border-0" style={{ borderRadius: '20px', overflow: 'hidden', backgroundColor: '#f8f9fa' }}>
                  <div className="modal-header bg-light text-dark p-3 border-bottom-0 d-flex justify-content-between align-items-center">
                    <h5 className="modal-title fw-bold">
                      {editingClient ? "Edit Client" : "Add New Client"}
                    </h5>
                    <button
                      type="button"
                      className="btn-close"
                      onClick={() => setShowModal(false)}
                      aria-label="Close"
                    ></button>
                  </div>

                  {/* Progress Bar */}
                  {/* <div className="px-3 pt-2">
                  <div className="progress" style={{ height: '8px', borderRadius: '10px' }}>
                    <div
                      className="progress-bar bg-primary"
                      role="progressbar"
                      style={{ width: `${(Object.values(newClient).filter(Boolean).length / Object.keys(newClient).length) * 100}%`, transition: 'width 0.3s ease' }}
                      aria-valuenow={(Object.values(newClient).filter(Boolean).length / Object.keys(newClient).length) * 100}
                      aria-valuemin="0"
                      aria-valuemax="100"
                    ></div>
                  </div>
                  <small className="text-muted mt-1 d-block text-center">
                    {Math.round((Object.values(newClient).filter(Boolean).length / Object.keys(newClient).length) * 100)}% Complete
                  </small>
                </div> */}

                  {/* <div className="modal-body p-3" style={{ maxHeight: '60vh', overflowY: 'auto' }}> */}
                  <form onSubmit={handleAddClient}>
                    <div className="modal-body p-3">
                      <div className="row g-0">
                        {/* First Row: Basic Information and Address Details */}
                        <div className="col-md-6 p-2">
                          <div className="card shadow-sm border-0" style={{ borderRadius: '10px', backgroundColor: '#fff' }}>
                            <div className="card-header bg-white p-2">
                              <h6 className="fw-semibold text-muted">
                                <i className="bi bi-person me-2 text-primary"></i> Basic Information
                              </h6>
                            </div>
                            <div className="card-body p-3 bg-light">
                              <div className="row g-3">
                                <div className="col-md-12">
                                  <label className="form-label fw-semibold text-muted" data-bs-toggle="tooltip" title="Full name of the client">
                                    <i className="bi bi-person-fill me-1"></i> Client Name
                                  </label>
                                  <input
                                    type="text"
                                    className={`form-control shadow-sm bg-white ${newClient.name ? 'is-valid' : ''}`}
                                    placeholder="Client Name"
                                    value={newClient.name}
                                    onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}

                                  />
                                  {/* {!newClient.name && <div className="invalid-feedback">Client Name is required.</div>} */}
                                </div>
                                <div className="col-md-6">
                                  <label className="form-label fw-semibold text-muted" data-bs-toggle="tooltip" title="Client's email address">
                                    <i className="bi bi-envelope me-1"></i> Email
                                  </label>
                                  <input
                                    type="email"
                                    className={`form-control shadow-sm bg-white ${newClient.email ? 'is-valid' : ''}`}
                                    placeholder="Email"
                                    value={newClient.email}
                                    onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                                  />
                                </div>
                                <div className="col-md-6">
                                  <label className="form-label fw-semibold text-muted" data-bs-toggle="tooltip" title="Client's contact number">
                                    <i className="bi bi-telephone me-1"></i> Phone
                                  </label>
                                  <input
                                    type="text"
                                    className={`form-control shadow-sm bg-white ${newClient.phone ? 'is-valid' : ''}`}
                                    placeholder="Phone"
                                    value={newClient.phone}
                                    onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}

                                  />
                                  {/* {!newClient.phone && <div className="invalid-feedback">Phone is required.</div>} */}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="col-md-6 p-2">
                          <div className="card shadow-sm border-0" style={{ borderRadius: '10px', backgroundColor: '#fff' }}>
                            <div className="card-header bg-white p-2">
                              <h6 className="fw-semibold text-muted">
                                <i className="bi bi-geo-alt me-2 text-primary"></i> Address Details
                              </h6>
                            </div>
                            <div className="card-body p-3 bg-light">
                              <div className="row g-3">
                                <div className="col-md-6">
                                  <label className="form-label fw-semibold text-muted" data-bs-toggle="tooltip" title="Client's full address">
                                    <i className="bi bi-house me-1"></i> Address
                                  </label>
                                  <input
                                    type="text"
                                    className={`form-control shadow-sm bg-white ${newClient.address ? 'is-valid' : 'is-invalid'}`}
                                    placeholder="Address"
                                    value={newClient.address}
                                    onChange={(e) => setNewClient({ ...newClient, address: e.target.value })}

                                  />
                                  {/* {!newClient.address && <div className="invalid-feedback">Address is required.</div>} */}
                                </div>
                                <div className="col-md-3">
                                  <label className="form-label fw-semibold text-muted" data-bs-toggle="tooltip" title="Client's pin code">
                                    <i className="bi bi-geo-fill me-1"></i>Pin Code
                                  </label>
                                  <input
                                    type="text"
                                    className={`form-control shadow-sm bg-white ${newClient.pinCode ? 'is-valid' : 'is-invalid'}`}
                                    placeholder="Pin Code"
                                    value={newClient.pinCode}
                                    onChange={(e) => setNewClient({ ...newClient, pinCode: e.target.value })}
                                  />
                                  {/* {!newClient.pinCode && <div className="invalid-feedback">Pin Code is required.</div>} */}
                                </div>

                                <div className="col-md-3">
                                  <label className="form-label fw-semibold text-muted" data-bs-toggle="tooltip" title="State code of the client">
                                    <i className="bi bi-code-slash me-1"></i>State Code
                                  </label>
                                  <input
                                    type="text"
                                    className={`form-control shadow-sm bg-white ${newClient.stateCode ? 'is-valid' : 'is-invalid'}`}
                                    placeholder="State Code"
                                    value={newClient.stateCode}
                                    onChange={(e) => setNewClient({ ...newClient, stateCode: e.target.value })}
                                  />
                                  {/* {!newClient.stateCode && <div className="invalid-feedback">State Code is required.</div>} */}
                                </div>




                                <div className="col-md-6">
                                  <label className="form-label fw-semibold text-muted" data-bs-toggle="tooltip" title="State of the client">
                                    <i className="bi bi-map me-1"></i> State
                                  </label>
                                  <select
                                    className={`form-select shadow-sm bg-white ${newClient.state ? 'is-valid' : 'is-invalid'}`}
                                    value={newClient.state}
                                    onChange={(e) => {
                                      setNewClient({ ...newClient, state: e.target.value, city: '' }); // Reset city when state changes
                                    }}
                                  >
                                    <option value="">Select State</option>
                                    {indianStates.map((state) => (
                                      <option key={state} value={state}>{state}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="col-md-6">
                                  <label className="form-label fw-semibold text-muted" data-bs-toggle="tooltip" title="City of the client">
                                    <i className="bi bi-building me-1"></i> City
                                  </label>
                                  <select
                                    className={`form-select shadow-sm bg-white ${newClient.city ? 'is-valid' : ''}`}
                                    value={newClient.city}
                                    onChange={(e) => setNewClient({ ...newClient, city: e.target.value })}
                                    disabled={!newClient.state} // Disable if no state is selected
                                  >
                                    <option value="">Select City</option>
                                    {newClient.state && stateCityMapping[newClient.state]?.map((city) => (
                                      <option key={city} value={city}>{city}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Second Row: Business Details and Additional Information */}
                        <div className="col-md-6 p-2">
                          <div className="card shadow-sm border-0" style={{ borderRadius: '10px', backgroundColor: '#fff' }}>
                            <div className="card-header bg-white p-2">
                              <h6 className="fw-semibold text-muted">
                                <i className="bi bi-briefcase me-2 text-primary"></i> Business Details
                              </h6>
                            </div>
                            <div className="card-body p-3 bg-light">
                              <div className="row g-3">
                                <div className="col-md-6">
                                  <label className="form-label fw-semibold text-muted" data-bs-toggle="tooltip" title="Client's GST registration number">
                                    <i className="bi bi-card-text me-1"></i> GST Number
                                  </label>
                                  <div className="d-flex gap-2">

                                    <input
                                      type="text"
                                      className={`form-control shadow-sm bg-white ${newClient.gstNumber ? 'is-valid' : 'is-invalid'}`}
                                      placeholder="GST Number"
                                      value={newClient.gstNumber}
                                      onChange={(e) => setNewClient({ ...newClient, gstNumber: e.target.value })}

                                    />
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-secondary"
                                      onClick={() => {
                                        // fetchGstDetails(newClient.gstNumber);
                                        // alert("✅ GST Number fetched successfully");
                                        if (newClient.gstNumber) {
                                          const gstRegex = /^(0[1-9]|1[0-9]|2[0-9]|3[0-7])[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

                                          if (gstRegex.test(newClient.gstNumber)) {
                                            fetchGstDetails(newClient.gstNumber);
                                            alert("✅ GST Number fetched successfully");
                                            // 34AACCC1596Q002
                                            // 24BPJPA7447A1ZB
                                          } else {
                                            alert("❌ Invalid GST Number format");
                                          }
                                        } else {
                                          alert("❌ Please enter a GST Number");
                                        }
                                      }}
                                    >get</button>
                                  </div>
                                  {/* {!newClient.gstNumber && <div className="invalid-feedback">GST Number is required.</div>} */}
                                </div>
                                <div className="col-md-6">
                                  <label className="form-label fw-semibold text-muted" data-bs-toggle="tooltip" title="Client's company name">
                                    <i className="bi bi-building me-1"></i> Company Name
                                  </label>
                                  <input
                                    type="text"
                                    className={`form-control shadow-sm bg-white ${newClient.companyName ? 'is-valid' : 'is-invalid'}`}
                                    placeholder="Company Name"
                                    value={newClient.companyName}
                                    onChange={(e) => setNewClient({ ...newClient, companyName: e.target.value })}

                                  />
                                  {/* {!newClient.companyName && <div className="invalid-feedback">Company Name is required.</div>} */}
                                </div>
                                <div className="col-md-6">
                                  <label className="form-label fw-semibold text-muted" data-bs-toggle="tooltip" title="Type of business">
                                    <i className="bi bi-shop me-1"></i> Business Type
                                  </label>
                                  <select
                                    className={`form-select shadow-sm bg-white ${newClient.businessType ? 'is-valid' : ''}`}
                                    value={newClient.businessType}
                                    onChange={(e) => setNewClient({ ...newClient, businessType: e.target.value })}

                                  >
                                    <option value="">Select Business Type</option>
                                    <option value="Retail">Retail</option>
                                    <option value="Wholesale">Wholesale</option>
                                    <option value="Manufacturer">Manufacturer</option>
                                    <option value="Trader">Trader</option>
                                    <option value="Supplier">Supplier</option>
                                  </select>
                                  {/* {!newClient.businessType && <div className="invalid-feedback">Business Type is required.</div>} */}
                                </div>
                                <div className="col-md-6">
                                  <label className="form-label fw-semibold text-muted" data-bs-toggle="tooltip" title="Payment terms for transactions">
                                    <i className="bi bi-calendar-check me-1"></i> Payment Terms
                                  </label>
                                  <select
                                    className={`form-select shadow-sm bg-white ${newClient.paymentTerms ? 'is-valid' : 'is-invalid'}`}
                                    value={newClient.paymentTerms}
                                    onChange={(e) => setNewClient({ ...newClient, paymentTerms: e.target.value })}

                                  >
                                    <option value="">Select Payment Terms</option>
                                    <option value="30">30 days</option>
                                    <option value="60">60 days</option>
                                    <option value="90">90 days</option>
                                    <option value="Advance">Advance Payment</option>
                                  </select>
                                  {/* {!newClient.paymentTerms && <div className="invalid-feedback">Payment Terms are required.</div>} */}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="col-md-6 p-2">
                          <div className="card shadow-sm border-0" style={{ borderRadius: '10px', backgroundColor: '#fff' }}>
                            <div className="card-header bg-white p-2">
                              <h6 className="fw-semibold text-muted">
                                <i className="bi bi-info-circle me-2 text-primary"></i> Additional Information
                              </h6>
                            </div>
                            <div className="card-body p-3 bg-light">
                              <div className="row g-3">
                                <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted" data-bs-toggle="tooltip" title="Discount rate offered to the client">
                                    <i className="bi bi-percent me-1"></i> Discount Rate
                                  </label>
                                  <input
                                    type="number"
                                    className="form-control shadow-sm bg-white"
                                    placeholder="Discount Rate"
                                    value={newClient.discountRate}
                                    onChange={(e) => setNewClient({ ...newClient, discountRate: e.target.value })}
                                  />
                                </div>
                                <div className="col-md-8">
                                  <label className="form-label fw-semibold text-muted" data-bs-toggle="tooltip" title="Current status of the client account">
                                    <i className="bi bi-toggle-on me-1"></i> Account Status
                                  </label>
                                  <select
                                    className={`form-select shadow-sm bg-white ${newClient.accountStatus ? 'is-valid' : ''}`}
                                    value={newClient.accountStatus}
                                    onChange={(e) => setNewClient({ ...newClient, accountStatus: e.target.value })}
                                  >
                                    <option value="">Select Account Status</option>
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Inactive</option>
                                  </select>
                                  {/* {!newClient.accountStatus && <div className="invalid-feedback">Account Status is required.</div>} */}
                                </div>
                                <div className="col-md-12">
                                  <label className="form-label fw-semibold text-muted" data-bs-toggle="tooltip" title="Additional notes about the client">
                                    <i className="bi bi-sticky me-1"></i> Notes
                                  </label>
                                  <textarea
                                    className="form-control shadow-sm bg-white"
                                    placeholder="Notes"
                                    value={newClient.notes}
                                    onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })}
                                    style={{ height: '38px' }}
                                  ></textarea>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>



                    </div>
                    {/* Sticky Footer */}
                    <div className="modal-footer bg-light p-3 border-top-0 sticky-bottom" style={{ boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.1)' }}>
                      <button
                        type="button"
                        className="btn btn-outline-secondary me-2"
                        onClick={() => setShowModal(false)}
                        style={{ borderRadius: '10px', transition: 'all 0.3s ease' }}
                        onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                        onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                      >
                        Cancel
                      </button>

                      {editingClient ? (
                        <button
                          type="button"
                          className="btn btn-primary px-5 shadow"
                          onClick={handleUpdateClient}
                          disabled={!['address', 'pinCode', 'stateCode', 'state', 'gstNumber', 'companyName', 'paymentTerms'].every((field) => newClient[field])}
                          style={{
                            backgroundColor: '#b8d4ff',
                            borderColor: '#b8d4ff',
                            color: '#1e40af',
                            borderRadius: '12px',
                            transition: 'all 0.3s ease',
                          }}
                          onMouseEnter={(e) => {
                            if (['address', 'pinCode', 'stateCode', 'state', 'gstNumber', 'companyName', 'paymentTerms'].every((field) => newClient[field])) {
                              e.target.style.backgroundColor = '#93c5fd';
                              e.target.style.borderColor = '#93c5fd';
                              e.target.style.transform = 'scale(1.05)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.backgroundColor = '#b8d4ff';
                            e.target.style.borderColor = '#b8d4ff';
                            e.target.style.transform = 'scale(1)';
                          }}
                        >
                          Update Client
                        </button>
                      ) : (
                        // <button type="submit" className="btn btn-success">Add Client</button>
                        <button
                          type="submit"
                          className="btn btn-primary px-5 shadow"
                          disabled={!['address', 'pinCode', 'stateCode', 'state', 'gstNumber', 'companyName', 'paymentTerms'].every((field) => newClient[field])}
                          style={{
                            backgroundColor: '#b8d4ff',
                            borderColor: '#b8d4ff',
                            color: '#1e40af',
                            borderRadius: '12px',
                            transition: 'all 0.3s ease',
                          }}
                          onMouseEnter={(e) => {
                            if (['address', 'pinCode', 'stateCode', 'state', 'gstNumber', 'companyName', 'paymentTerms'].every((field) => newClient[field])) {
                              e.target.style.backgroundColor = '#93c5fd';
                              e.target.style.borderColor = '#93c5fd';
                              e.target.style.transform = 'scale(1.05)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.backgroundColor = '#b8d4ff';
                            e.target.style.borderColor = '#b8d4ff';
                            e.target.style.transform = 'scale(1)';
                          }}
                        >
                          Add Client
                        </button>
                      )}
                    </div>
                  </form>

                </div>
              </div>
            </div>
          )}



          {/* Edit Modal */}
          {showModal && editClient && (
            <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
              <div className="modal-dialog modal-dialog-centered modal-lg">
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title">Edit Client</h5>
                    <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
                  </div>
                  <form onSubmit={(e) => { e.preventDefault(); handleUpdateClient(); }}>
                    <div className="modal-body">
                      <div className="row g-3">
                        {Object.keys(editClient).filter(key => key !== '_id').map(key => (
                          <div key={key} className="col-md-6">
                            <input
                              type={key.includes('Revenue') || key.includes('Count') ? 'number' : 'text'}
                              className="form-control"
                              placeholder={key.charAt(0).toUpperCase() + key.slice(1)}
                              value={editClient[key]}
                              onChange={(e) => setEditClient({ ...editClient, [key]: e.target.value })}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                        Close
                      </button>
                      <button type="submit" className="btn btn-primary">
                        Save changes
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>





        {/* {showModal && (
          <div className="modal show d-block" tabIndex="-1">
            <div className="modal-dialog">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">{editingClient ? "Edit Client" : "Add New Client"}</h5>
                  <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
                </div>
                <div className="modal-body">
                  <form onSubmit={handleAddClient} className="mb-3">
                    <input type="text" className="form-control mb-2" placeholder="Client Name" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} required />
                    <input type="email" className="form-control mb-2" placeholder="Email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
                    <input type="text" className="form-control mb-2" placeholder="Phone" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} required />
                    <input type="text" className="form-control mb-2" placeholder="Address" value={newClient.address} onChange={(e) => setNewClient({ ...newClient, address: e.target.value })} required />
                    <input type="text" className="form-control mb-2" placeholder="State" value={newClient.state} onChange={(e) => setNewClient({ ...newClient, state: e.target.value })} />
                    <input type="text" className="form-control mb-2" placeholder="City" value={newClient.city} onChange={(e) => setNewClient({ ...newClient, city: e.target.value })} />
                    <input type="text" className="form-control mb-2" placeholder="GST Number" value={newClient.gstNumber} onChange={(e) => setNewClient({ ...newClient, gstNumber: e.target.value })} required />
                    <input type="text" className="form-control mb-2" placeholder="Company Name" value={newClient.companyName} onChange={(e) => setNewClient({ ...newClient, companyName: e.target.value })} required />
                    <select className="form-select mb-2" value={newClient.businessType} onChange={(e) => setNewClient({ ...newClient, businessType: e.target.value })} required>
                      <option value="">Select Business Type</option>
                      <option value="Retail">Retail</option>
                      <option value="Wholesale">Wholesale</option>
                      <option value="Manufacturer">Manufacturer</option>
                      <option value="Trader">Trader</option>
                      <option value="Supplier">Supplier</option>
                    </select>
                    <select className="form-select mb-2" value={newClient.paymentTerms} onChange={(e) => setNewClient({ ...newClient, paymentTerms: e.target.value })} required>
                      <option value="">Select Payment Terms</option>
                      <option value="30">30 days</option>
                      <option value="60">60 days</option>
                      <option value="90">90 days</option>
                      <option value="Advance">Advance Payment</option>
                    </select>
                    <input type="number" className="form-control mb-2" placeholder="Discount Rate" value={newClient.discountRate} onChange={(e) => setNewClient({ ...newClient, discountRate: e.target.value })} />
                    <select className="form-select mb-2" value={newClient.accountStatus} onChange={(e) => setNewClient({ ...newClient, accountStatus: e.target.value })} required>
                      <option value="">Select Account Status</option>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                    <textarea className="form-control mb-2" placeholder="Notes" value={newClient.notes} onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })}></textarea>


                    {editingClient ? (
                      <button type="button" className="btn btn-warning" onClick={handleUpdateClient}>Update Client</button>
                    ) : (
                      <button type="submit" className="btn btn-success">Add Client</button>
                    )}
                  </form>
                </div>
              </div>
            </div>
          </div>
        )} */}


      </div>
    </>
    //   );
    // }

    // <input type="text" className="form-control mb-2" placeholder="Name" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} required />
    // <input type="email" className="form-control mb-2" placeholder="Email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} required />
    // <button type="submit" className="btn btn-success">Add Client</button>
    // </form>
    // <table className="table table-bordered">
    //   <thead>
    //     <tr>
    //       <th>ID</th>
    //       <th>Name</th>
    //       <th>Email</th>
    //       <th>Actions</th>
    //     </tr>
    //   </thead>
    //   <tbody>
    //     {clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase())).map((client) => (
    //       <tr key={client.id}>
    //         <td>{client.id}</td>
    //         <td>{client.name}</td>
    //         <td>{client.email}</td>
    //         <td>
    //           <button className="btn btn-warning btn-sm me-2" onClick={() => handleEditClient(client)}>Edit</button>
    //           <button className="btn btn-danger btn-sm" onClick={() => handleDeleteClient(client.id)}>Delete</button>
    //         </td>
    //       </tr>
    //     ))}
    //   </tbody>
    // </table>
    // </div >




  );
}

export default Clients;
