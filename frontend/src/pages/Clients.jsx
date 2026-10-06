import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import editSVG from '../assets/edit.svg';
import deleteSVG from '../assets/delete.svg';
import DynamicTable from '../components/DynamicTable';
import FormConfigurator from '../components/FormConfigurator';
import ConfiguredField from '../components/ConfiguredField';
import {useFormConfiguration,applyFormulas,applyAutoFill,getFieldState,syncConfiguredCustomFields} from "../hooks/useFormConfiguration";
import {useNoCodeDataSources} from "../hooks/useNoCodeDataSources";
import * as XLSX from 'xlsx';

const CLIENT_FORM_FIELDS=[
  {key:"name",label:"Client Name",fieldType:"text",width:12,section:"basic",order:0},
  {key:"email",label:"Email",fieldType:"text",width:6,section:"basic",order:1},
  {key:"phone",label:"Phone",fieldType:"text",width:6,section:"basic",order:2},
  {key:"address",label:"Address",fieldType:"textarea",width:6,section:"address",required:true,order:3},
  {key:"pinCode",label:"Pin Code",fieldType:"text",width:3,section:"address",required:true,order:4},
  {key:"stateCode",label:"State Code",fieldType:"text",width:3,section:"address",required:true,order:5},
  {key:"state",label:"State",fieldType:"select",width:6,section:"address",required:true,order:6},
  {key:"city",label:"City",fieldType:"select",width:6,section:"address",order:7},
  {key:"gstNumber",label:"GST Number",fieldType:"text",width:6,section:"business",required:true,order:8},
  {key:"companyName",label:"Company Name",fieldType:"text",width:6,section:"business",required:true,order:9},
  {key:"businessType",label:"Business Type",fieldType:"select",width:6,section:"business",order:10,options:["Retail","Wholesale","Manufacturer","Trader","Supplier"]},
  {key:"paymentTerms",label:"Payment Terms",fieldType:"select",width:6,section:"business",required:true,order:11,options:[{value:"30",label:"30 days"},{value:"60",label:"60 days"},{value:"90",label:"90 days"},{value:"Advance",label:"Advance Payment"}]},
  {key:"discountRate",label:"Discount Rate",fieldType:"number",width:4,section:"additional",order:12},
  {key:"accountStatus",label:"Account Status",fieldType:"select",width:8,section:"additional",order:13,options:["Active","Inactive"]},
  {key:"notes",label:"Notes",fieldType:"textarea",width:12,section:"additional",order:14}
];

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
    notes: '',
    customFields: {}
  });

  // -----
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
  const [formSettingsOpen,setFormSettingsOpen]=useState(false);
  const clientFormConfig=useFormConfiguration("clients.form",CLIENT_FORM_FIELDS);
  const linkedClientSources=useMemo(()=>Array.from(new Set(clientFormConfig.fields.map(field=>field.dataSource?.resource).filter(Boolean))),[clientFormConfig.fields]);
  const {records:linkedRecords}=useNoCodeDataSources(linkedClientSources);
  const clientSectionTitle=section=>String(section||"General").replace(/[_-]+/g," ").replace(/\b\w/g,letter=>letter.toUpperCase());
  const clientSectionIcon=section=>{
    const value=String(section||"").toLowerCase();
    if(value.includes("address"))return "bi-geo-alt";
    if(value.includes("business")||value.includes("company"))return "bi-briefcase";
    if(value.includes("payment"))return "bi-wallet2";
    return value.includes("basic")? "bi-person":"bi-folder2-open";
  };
  const clientValue=field=>field.custom
    ? newClient.customFields?.[field.key]??newClient[field.key]??field.defaultValue??""
    : newClient[field.key]??field.defaultValue??"";
  const updateClientField=(field,value,record=null)=>{
    setNewClient(prev=>{
      let next=field.custom
        ? {...prev,[field.key]:value,customFields:{...(prev.customFields||{}),[field.key]:value}}
        : {...prev,[field.key]:value};
      if(record)next=applyAutoFill(field,record,next);
      next=syncConfiguredCustomFields(next,clientFormConfig.fields);
      return applyFormulas(clientFormConfig.fields,next);
    });
  };
  const visibleClientFields=clientFormConfig.fields.filter(field=>field.visible!==false);
  const clientSections=[...new Set(visibleClientFields.map(field=>field.section||"General"))];

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
        notes: '',
        customFields: {}
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
    const hydrated={
      ...client,
      ...((client.customFields&&typeof client.customFields==="object")?client.customFields:{}),
      customFields:{...(client.customFields||{})}
    };
    setNewClient(hydrated);
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
          notes: newClient.notes || '',
          customFields: newClient.customFields || {}
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
        paymentTerms: '30',
        discountRate: 0,
        accountStatus: 'Active',
        notes: '',
        customFields: {}
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
            <DynamicTable
              tableKey="clients.list"
              rows={sortedData}
              getRowKey={client => client._id}
              columns={[
                { key:"__rowNumber", label:"#", locked:false, render:(_row,index)=>index+1 },
                { key:"companyName", label:"Name", sortKey:"companyName" },
                { key:"phone", label:"Phone", sortKey:"phone" },
                { key:"address", label:"Address" },
                { key:"gstNumber", label:"GST No." },
                { key:"businessType", label:"Business Type", sortKey:"businessType" },
                { key:"paymentTerms", label:"Payment Terms", render:client=>`${client.paymentTerms||""}${client.paymentTerms!=="Advance"&&client.paymentTerms?" days":""}` },
                { key:"discountRate", label:"Dis%", render:client=>`${client.discountRate??0} %` },
                { key:"orderCount", label:"Orders", sortKey:"orderCount" },
                { key:"totalRevenue", label:"Total Revenue", sortKey:"totalRevenue", render:client=>`₹${Number(client.totalRevenue||0).toFixed(2)}` },
                { key:"accountStatus", label:"A/C Status", render:client=><span className={`badge ${client.accountStatus==="Active"?"bg-success":"bg-danger"}`}>{client.accountStatus}</span> },
                { key:"notes", label:"Notes" },
              ]}
              onSort={handleSort}
              actionColumn={{
                label:"Actions",
                locked:true,
                render:client=>(
                  <div className="d-flex gap-1 justify-content-end">
                    <button className="btn btn-warning btn-sm" onClick={()=>handleEditClient(client)} title="Edit">
                      <img src={editSVG} alt="Edit" />
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={()=>handleDeleteClient(client._id)} title="Delete">
                      <img src={deleteSVG} alt="Delete" />
                    </button>
                  </div>
                )
              }}
              footer={({visibleColumns,hasActions})=>{
                const totalRevenue=currentClients.reduce((sum,p)=>sum+Number(p.totalRevenue||0),0).toFixed(2);
                return (
                  <tr>
                    {visibleColumns.map((column,index)=>(
                      <td key={column.key} className={column.key==="totalRevenue"?"text-center fw-bold":index===0?"text-end fw-bold":""}>
                        {column.key==="totalRevenue" ? "₹"+totalRevenue : index===0 ? "Total:" : ""}
                      </td>
                    ))}
                    {hasActions&&<td></td>}
                  </tr>
                );
              }}
            />

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



        </div>

          {showModal && (
            <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}>
              <div className="modal-dialog modal-dialog-centered modal-xl">
                <div className="modal-content shadow-lg border-0" style={{ borderRadius: '20px', overflow: 'hidden', backgroundColor: '#f8f9fa' }}>
                  <div className="modal-header bg-light text-dark p-3 border-bottom-0 d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-2">
                      <h5 className="modal-title fw-bold mb-0">
                        {editingClient ? "Edit Client" : "Add New Client"}
                      </h5>
                      <button type="button" className="btn btn-sm btn-outline-primary" onClick={()=>setFormSettingsOpen(true)}>
                        <i className="bi bi-sliders2 me-1"></i>Customize form
                      </button>
                    </div>
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
                      <div className="row g-3">
                        {clientSections.map(section=>(
                          <div className="col-12 col-lg-6" key={section}>
                            <section className="card border-0 shadow-sm h-100">
                              <div className="card-header bg-white d-flex align-items-center gap-2 py-3">
                                <i className={`bi ${clientSectionIcon(section)} text-primary`}></i>
                                <h6 className="mb-0 fw-semibold">{clientSectionTitle(section)}</h6>
                              </div>
                              <div className="card-body">
                                <div className="row g-3">
                                  {visibleClientFields.filter(field=>(field.section||"General")===section).sort((a,b)=>(a.order??0)-(b.order??0)).map(field=>{
                                    const state=getFieldState(field,{...newClient,...(newClient.customFields||{})});
                                    if(!state.visible)return null;
                                    const source=field.dataSource?.resource?linkedRecords[field.dataSource.resource]||[]:[];
                                    const common={
                                      field:{...field,required:state.required,readOnly:state.readOnly},
                                      value:clientValue(field),
                                      onChange:value=>updateClientField(field,value,null),
                                      onRecordChange:record=>updateClientField(field,record?.[field.dataSource?.valueField||"_id"]??"",record),
                                      lookupRecords:source
                                    };
                                    if(field.key==="state"&&!field.dataSource?.resource){
                                      return <div key={field.key} className={`col-12 col-md-${field.width||6}`}>
                                        <ConfiguredField {...common} options={indianStates}/>
                                      </div>;
                                    }
                                    if(field.key==="city"&&!field.dataSource?.resource){
                                      return <div key={field.key} className={`col-12 col-md-${field.width||6}`}>
                                        <ConfiguredField {...common} options={newClient.state?(stateCityMapping[newClient.state]||[]):[]} disabled={!newClient.state}/>
                                      </div>;
                                    }
                                    if(field.key==="companyName"&&!field.custom&&!field.dataSource?.resource){
                                      return <div key={field.key} className={`col-12 col-md-${field.width||6}`}>
                                        <ConfiguredField {...common} listId="clientCompanyName" listOptions={clients.map(client=>client.companyName)}/>
                                      </div>;
                                    }
                                    if(field.key==="gstNumber"&&!field.custom&&!field.dataSource?.resource){
                                      const suffix=(
                                        <button type="button" className="btn btn-sm btn-outline-secondary mt-2" onClick={()=>{
                                          const gst=String(newClient.gstNumber||"").trim().toUpperCase();
                                          if(!gst){alert("Please enter a GST number first.");return;}
                                          const gstRegex=/^(0[1-9]|1[0-9]|2[0-9]|3[0-7])[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
                                          if(!gstRegex.test(gst)){alert("Please enter a valid GST number.");return;}
                                          fetchGstDetails(gst);
                                        }}>Fetch GST details</button>
                                      );
                                      return <div key={field.key} className={`col-12 col-md-${field.width||6}`}>
                                        <ConfiguredField {...common} suffix={suffix}/>
                                      </div>;
                                    }
                                    return <div key={field.key} className={`col-12 col-md-${field.width||6}`}>
                                      <ConfiguredField {...common}/>
                                    </div>;
                                  })}
                                </div>
                              </div>
                            </section>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="modal-footer bg-white p-3 border-top sticky-bottom">
                      <button type="button" className="btn btn-light border" onClick={()=>setShowModal(false)}>Cancel</button>
                      <button
                        type={editingClient?"button":"submit"}
                        className="btn btn-primary px-4"
                        onClick={editingClient?handleUpdateClient:undefined}
                        disabled={!visibleClientFields.filter(field=>getFieldState(field,{...newClient,...(newClient.customFields||{})}).visible&&getFieldState(field,{...newClient,...(newClient.customFields||{})}).required).every(field=>String(clientValue(field)??"").trim())}
                      >
                        {editingClient?"Update client":"Add client"}
                      </button>
                    </div>                  </form>

                </div>
              </div>
            </div>
          )}




        <FormConfigurator
        open={formSettingsOpen}
        onClose={()=>setFormSettingsOpen(false)}
        title="Customize Client Form"
        subtitle="Arrange Client fields, show or hide them, change field type and width, and save the layout."
        fields={clientFormConfig.fields}
        saving={clientFormConfig.saving}
        onSave={clientFormConfig.save}
        onReset={async()=>{const defaults=await clientFormConfig.reset();clientFormConfig.setFields(defaults);setFormSettingsOpen(false);}}
      />
        </div>
);
}

export default Clients;
