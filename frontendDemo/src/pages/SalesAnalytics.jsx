//using
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
} from 'chart.js';
import { Bar, Pie, Line } from 'react-chartjs-2';
import DatePicker from 'react-date-picker';
import { saveAs } from 'file-saver';
import 'react-date-picker/dist/DatePicker.css';
import 'react-calendar/dist/Calendar.css';
import infoSVG from '../assets/info.svg';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';



// Use a public GeoJSON URL instead of local file
const geoUrl = 'https://gist.githubusercontent.com/jbrobst/56c13bbbf9d97d187fea01ca62ea5112/raw/india_states.geojson';

import "../index.css"

const SalesAnalytics = () => {

  const linkone = `http://localhost:5000`;
  // const linkone = `https://baba.divinesparks.in`;


  const [salesData, setSalesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState({ title: '', orders: [] });
  const [startDate, setStartDate] = useState(new Date(new Date().setMonth(new Date().getMonth() - 1)));
  const [endDate, setEndDate] = useState(new Date());
  const [filteredSales, setFilteredSales] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [allOrders, setAllOrders] = useState([]);
  // New state for order status filters
  const [statusFilter, setStatusFilter] = useState('');
  const [orderNameFilter, setOrderNameFilter] = useState('');
  const [orderNumberFilter, setOrderNumberFilter] = useState('');
  const [selectedState, setSelectedState] = useState(null);
  const [position, setPosition] = useState({ coordinates: [78.9629, 20.5937], zoom: 1 });

  // Additional State
  const [addressFilter, setAddressFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [sortField, setSortField] = useState('orderDate');
  const [sortDirection, setSortDirection] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  // const [currentPage, setCurrentPage] = useState('');
  const [ordersPerPage] = useState(10); // Adjust as needed
  const [selectedOrders, setSelectedOrders] = useState([]);


  useEffect(() => {
    fetchSalesData();
  }, []);

  const fetchSalesData = async () => {
    try {
      const response = await axios.get(`${linkone}/api/order/sales-analytics`, {
        headers: {
          'x-auth-token': localStorage.getItem('token'),
        },
      });
      setSalesData(response.data);
      setFilteredSales(response.data);

      const allOrdersResponse = await axios.get(`${linkone}/api/order/all-orders`, {
        headers: {
          'x-auth-token': localStorage.getItem('token'),
        },
      });

      setAllOrders(allOrdersResponse.data);
      setLoading(false);
    } catch (error) {
      alert("❌ No Internet or Login again");
      // console.error('Error fetching sales data:', error);
      setLoading(false);
    }
  };

  const handleShowModal = (title, orders) => {
    setModalData({ title, orders });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSearchTerm('');
  };

  const filterByDateRange = () => {
    if (!salesData || !startDate || !endDate) return;
    const filtered = {};
    Object.keys(salesData).forEach(period => {
      const filteredOrders = salesData[period].orders.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= startDate && orderDate <= endDate;
      });
      filtered[period] = {
        totalSales: filteredOrders.reduce((sum, order) => sum + order.finalRevenue, 0),
        orderCount: filteredOrders.length,
        orders: filteredOrders,
      };
    });
    setFilteredSales(filtered);
  };

  const exportToCSV = () => {
    const csvRows = [];
    const headers = ['Period', 'Total Sales', 'Order Count', 'Order Name', 'Revenue', 'Date'];
    csvRows.push(headers.join(','));

    Object.keys(filteredSales).forEach(period => {
      filteredSales[period].orders.forEach(order => {
        const row = [
          period,
          filteredSales[period].totalSales,
          filteredSales[period].orderCount,
          order.orderName,
          order.finalRevenue,
          new Date(order.createdAt).toLocaleDateString(),
        ];
        csvRows.push(row.join(','));
      });
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, 'sales-analytics.csv');
  };

  // const exportToCSV = () => {
  //   const csvRows = [];
  //   const headers = ['Period', 'Total Sales', 'Order Count', 'Order Name', 'Revenue', 'Date', 'Address', 'State', 'City'];
  //   csvRows.push(headers.join(','));

  //   Object.keys(filteredSales).forEach(period => {
  //     filteredSales[period].orders.forEach(order => {
  //       const row = [
  //         period,
  //         filteredSales[period].totalSales,
  //         filteredSales[period].orderCount,
  //         order.orderName,
  //         order.finalRevenue,
  //         new Date(order.orderDate).toLocaleDateString(),
  //         order.Address || '',
  //         order.State || '',
  //         order.City || '',
  //       ];
  //       csvRows.push(row.join(','));
  //     });
  //   });

  //   const csvString = csvRows.join('\n');
  //   const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  //   saveAs(blob, 'sales-analytics.csv');
  // };

  // Filter orders for the Order Status Overview table


  // -----------------
  // const filteredOrders = allOrders.filter(order => {
  //   return (
  //     (statusFilter === '' || order.status === statusFilter) &&
  //     (orderNameFilter === '' || order.orderName.includes(orderNameFilter).toLowerCase()) &&
  //     // (orderNumberFilter === '' || order.orderNumber.includes(orderNumberFilter))
  //     // (orderNameFilter === '' || order.orderName.toLowerCase().includes(orderNameFilter.toLowerCase())) &&
  //     (orderNumberFilter === '' || order.orderNumber.toLowerCase().includes(orderNumberFilter.toLowerCase()))
  //   );
  // });
  // ----------

  const normalizeStateName = (name) => {
    const stateMap = {
      'MH': 'Maharashtra',
      'KA': 'Karnataka',
      'DL': 'Delhi',
      'TN': 'Tamil Nadu',
      'AP': 'Andhra Pradesh',
      'UP': 'Uttar Pradesh',
      // Add more mappings as needed
    };
    return stateMap[name] || name;
  };

  const stateData = allOrders.reduce((acc, order) => {
    if (order.State) {
      const normalizedState = normalizeStateName(order.State);
      acc[normalizedState] = {
        orderCount: (acc[normalizedState]?.orderCount || 0) + 1,
        totalSales: (acc[normalizedState]?.totalSales || 0) + (order.finalRevenue || 0),
        cities: {
          ...(acc[normalizedState]?.cities || {}),
          [order.City]: (acc[normalizedState]?.cities?.[order.City] || 0) + 1,
        },
      };
    }
    return acc;
  }, {});

  // const stateData = allOrders.reduce((acc, order) => {
  //   if (order.State) {
  //     acc[order.State] = {
  //       orderCount: (acc[order.State]?.orderCount || 0) + 1,
  //       totalSales: (acc[order.State]?.totalSales || 0) + (order.finalRevenue || 0),
  //       cities: {
  //         ..State]?.cities || {}),
  //         [order.City]: (acc[order.State]?.cities?.[order.City] || 0) + 1,
  //       },
  //     };
  //   }
  //   return acc;
  // }, {});

  const handleStateDoubleClick = (geo) => {
    const stateName = geo.properties.ST_NM;
    setSelectedState(stateName);
    const centroid = geo.properties.centroid || [78.9629, 20.5937]; // Fallback centroid
    setPosition({
      coordinates: centroid,
      zoom: 4,
    });
  };

  const resetMap = () => {
    setSelectedState(null);
    setPosition({ coordinates: [78.9629, 20.5937], zoom: 1 });
  };

  if (loading) return <div className="text-center mt-5"><h3>Loading...</h3></div>;
  if (!filteredSales) return <div className="text-center mt-5"><h3>No data available</h3></div>;

  // Bar Chart Data (Total Sales)
  const barChartData = {
    labels: ['Today', 'Yesterday', 'This Week', 'This Month', 'Last Week', 'Last Month'],
    datasets: [{
      label: 'Total Sales (₹)',
      data: [
        filteredSales.today.totalSales,
        filteredSales.yesterday.totalSales,
        filteredSales.thisWeek.totalSales,
        filteredSales.thisMonth.totalSales,
        filteredSales.lastWeek.totalSales,
        filteredSales.lastMonth.totalSales,
      ],
      backgroundColor: 'rgba(75, 192, 192, 0.6)',
      borderColor: 'rgba(75, 192, 192, 1)',
      borderWidth: 1,
    }],
  };

  const barChartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Total Sales by Period' },
    },
    onClick: (event, elements) => {
      if (elements.length > 0) {
        const index = elements[0].index;
        const period = barChartData.labels[index].toLowerCase().replace(' ', '');
        handleShowModal(barChartData.labels[index], filteredSales[period].orders);
      }
    },
  };

  // Pie Chart Data (Order Count)
  const pieChartData = {
    labels: ['Today', 'Yesterday', 'This Week', 'This Month', 'Last Week', 'Last Month'],
    datasets: [{
      label: 'Order Count',
      data: [
        filteredSales.today.orderCount,
        filteredSales.yesterday.orderCount,
        filteredSales.thisWeek.orderCount,
        filteredSales.thisMonth.orderCount,
        filteredSales.lastWeek.orderCount,
        filteredSales.lastMonth.orderCount,
      ],
      backgroundColor: [
        'rgba(255, 99, 132, 0.6)',
        'rgba(255, 159, 64, 0.6)', // New color for Yesterday
        'rgba(54, 162, 235, 0.6)',
        'rgba(255, 206, 86, 0.6)',
        'rgba(75, 192, 192, 0.6)',
        'rgba(153, 102, 255, 0.6)',
      ],
      borderColor: [
        'rgba(255, 99, 132, 1)',
        'rgba(255, 159, 64, 1)', // New border color for Yesterday
        'rgba(54, 162, 235, 1)',
        'rgba(255, 206, 86, 1)',
        'rgba(75, 192, 192, 1)',
        'rgba(153, 102, 255, 1)',
      ],
      borderWidth: 1,
    }],
  };

  const pieChartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Order Count Distribution' },
    },
    onClick: (event, elements) => {
      if (elements.length > 0) {
        const index = elements[0].index;
        const period = pieChartData.labels[index].toLowerCase().replace(' ', '');
        handleShowModal(pieChartData.labels[index], filteredSales[period].orders);
      }
    },
  };

  // Line Chart Data (Daily Sales for This Month)
  const dailySales = filteredSales.thisMonth.orders.reduce((acc, order) => {
    const date = new Date(order.createdAt).toLocaleDateString();
    acc[date] = (acc[date] || 0) + order.finalRevenue;
    return acc;
  }, {});


  // Line Chart Data (Daily Sales for Last Month)
  const PreviousdailySales = filteredSales.lastMonth.orders.reduce((acc, order) => {
    const date = new Date(order.createdAt).toLocaleDateString();
    acc[date] = (acc[date] || 0) + order.finalRevenue;
    return acc;
  }, {});

  const lineChartData = {
    labels: Object.keys(dailySales),
    datasets: [{
      label: 'Daily Sales (₹)',
      data: Object.values(dailySales),
      fill: false,
      borderColor: 'rgba(54, 162, 235, 1)',
      backgroundColor: 'rgba(54, 162, 235, 1)',
      tension: 0.1,
    },
    {
      label: ' previous Daily Sales (₹)',
      data: Object.values(PreviousdailySales),
      fill: false,
      borderColor: 'rgb(149, 247, 37)',
      backgroundColor: 'rgb(102, 235, 54)',
      tension: 0.1,
    }
    ],
  };

  const lineChartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Daily Sales Trend (This Month)' },
    },
  };

  // Status Breakdown Pie Chart
  const statusBreakdown = allOrders.reduce((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {});

  const statusChartData = {
    labels: Object.keys(statusBreakdown),
    datasets: [{
      label: 'Order Status',
      data: Object.values(statusBreakdown),
      backgroundColor: [
        'rgba(54, 162, 235, 0.6)',
        'rgba(255, 206, 86, 0.6)',
        'rgba(153, 102, 255, 0.6)',
        'rgba(255, 99, 132, 0.6)',
        'rgba(75, 192, 192, 0.6)',
      ],
      borderColor: [
        'rgba(54, 162, 235, 1)',
        'rgba(255, 206, 86, 1)',
        'rgba(153, 102, 255, 1)',
        'rgba(255, 99, 132, 1)',
        'rgba(75, 192, 192, 1)',
      ],
      borderWidth: 1,
    }],
  };

  const statusChartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Order Status Breakdown' },
    },
  };

  // ----------


  // Enhanced Filtering Logic
  const filteredOrders = allOrders
    .filter(order =>
      (statusFilter === '' || order.status === statusFilter) &&
      (orderNameFilter === '' || order.orderName.toLowerCase().includes(orderNameFilter.toLowerCase())) &&
      (orderNumberFilter === '' || order.orderNumber.toLowerCase().includes(orderNumberFilter.toLowerCase())) &&
      (addressFilter === '' || (order.Address && order.Address.toLowerCase().includes(addressFilter.toLowerCase()))) &&
      (stateFilter === '' || (order.State && order.State.toLowerCase().includes(stateFilter.toLowerCase()))) &&
      (cityFilter === '' || (order.City && order.City.toLowerCase().includes(cityFilter.toLowerCase())))
    )
    .sort((a, b) => {
      const aValue = a[sortField] || '';
      const bValue = b[sortField] || '';
      if (sortField === 'finalRevenue') {
        return sortDirection === 'asc' ? (aValue || 0) - (bValue || 0) : (bValue || 0) - (aValue || 0);
      }
      if (sortField === 'orderDate') {
        return sortDirection === 'asc'
          ? new Date(aValue) - new Date(bValue)
          : new Date(bValue) - new Date(aValue);
      }
      return sortDirection === 'asc'
        ? aValue.toString().localeCompare(bValue.toString())
        : bValue.toString().localeCompare(aValue.toString());
    });

  // Pagination Logic
  const indexOfLastOrder = currentPage * ordersPerPage;
  const indexOfFirstOrder = indexOfLastOrder - ordersPerPage;
  const currentOrders = filteredOrders.slice(indexOfFirstOrder, indexOfLastOrder);

  // Sorting Handler
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1); // Reset to first page on sort
  };

  // Row Selection Handlers
  const toggleSelectOrder = (orderId) => {
    setSelectedOrders(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedOrders.length === filteredOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(filteredOrders.map(order => order._id));
    }
  };

  // Export Filtered Data to CSV
  const exportFilteredToCSV = () => {
    const csvRows = [];
    const headers = ['Date', 'Order Number', 'Order Name', 'Status', 'Revenue', 'Address', 'State', 'City'];
    csvRows.push(headers.join(','));

    filteredOrders.forEach(order => {
      const row = [
        new Date(order.orderDate).toLocaleDateString(),
        order.orderNumber,
        order.orderName,
        order.status,
        order.finalRevenue || 0,
        order.Address || 'N/A',
        order.State || 'N/A',
        order.City || 'N/A',
      ];
      csvRows.push(row.join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, 'filtered-order-status.csv');
  };

  return (
    // <div className="w-100 mx-3 mt-3">
    <div className="container mt-3">
      <h2>Analytics Dashboard</h2>
      {/* : space-; */}

      <div className="card w-100 p-3 d-flex align-items-center">
        {/* Filters and Controls */}
        {/* <div className="d-flex justify-content-between mb-4 w-100"> */}
        <div className="d-flex justify-content-between flex-wrap gap-2 mb-4 w-100">

          <div className="d-flex gap-2">
            <div className="col-md-4 d-flex flex-column w-auto">
              <label className="form-label">Start Date:</label>
              <DatePicker
                onChange={setStartDate}
                value={startDate}
                className="form-control"
              />
            </div>
            <div className="col-md-4 d-flex flex-column w-auto">
              <label className="form-label">End Date:</label>
              <DatePicker
                onChange={setEndDate}
                value={endDate}
                className="form-control"
              />
            </div>
          </div>

          <div className="col-md-4 d-flex align-items-end">
            <button className="btn btn-primary me-2" onClick={filterByDateRange}>Filter</button>
            <button className="btn btn-success me-2" onClick={exportToCSV}>CSV</button>
            <button className="btn btn-info text-light" onClick={fetchSalesData}>Refresh</button>
          </div>
        </div>

        <div className="w-100 d-flex flex-wrap mb-3">
          <div className="d-flex flex-wrap justify-content-center pe-md-3 w-50 tab-w-100 sm-w-100">
            {/* Summary Cards */}
            <div className="row g-3 p-1">
              {[
                { title: 'Today', data: filteredSales.today },
                { title: 'This Week', data: filteredSales.thisWeek },
                { title: 'This Month', data: filteredSales.thisMonth },
                { title: 'Yesterday', data: filteredSales.yesterday },
                { title: 'Last Week', data: filteredSales.lastWeek },
                { title: 'Last Month', data: filteredSales.lastMonth },
              ].map(item => (
                <div className="col-md-4" key={item.title}>
                  <div className="card">
                    <div className="card-body">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <h5 className="card-title">{item.title}</h5>
                        <div
                          className="btn-sm"
                          onClick={() => handleShowModal(item.title, item.data.orders)}
                        >
                          <img src={infoSVG} alt="info" fill="#fff" />
                          {/* <i className="bi bi-info-circle"></i> */}
                        </div>
                      </div>
                      {/* <p className="card-text">Total Sales: ${item.data.totalSales}</p>
                      <span className="card-text">Order Count: {item.data.orderCount}</span> */}
                      <span className="card-text">Sales: ₹{item.data.totalSales}</span>
                      <br />
                      <span className="card-text">Orders: {item.data.orderCount}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className='w-50 tab-w-100 sm-w-100'>
            {/* Bar graph */}
            <div className="card h-100">
              <div className="card-body"><Bar data={barChartData} options={barChartOptions} /></div>
            </div>
          </div>
        </div>

        {/*  */}
        <div className="d-flex flex-wrap w-100 mb-3">
          {/* Order Count Pie Diagram */}
          {/* <div className="card col-md-3" style={{ height: "fit-content" }}> */}

          {/* <div className="col-md-6 gap-2" style={{ display: "flex" ,flexWrap: "wrap" }}> */}
          <div className="col-md-6 d-flex gap-3 sm-flex-wrap align-items-center tab-w-100 flex-md-nowrap mb-3 mb-md-0" >
            {/* <div className=" "> */}
              <div className="card w-50 sm-w-100" style={{ height: "fit-content" }}>
                <div className="card-body"><Pie data={pieChartData} options={pieChartOptions} /></div>
              </div>
            {/* </div> */}

            {/* <div className="w-50 "> */}
              <div className="card w-50 sm-w-100" style={{ height: "fit-content" }}>
                <div className="card-body"><Pie data={statusChartData} options={statusChartOptions} /></div>
              </div>
            {/* </div> */}
          </div>
          <div className="col-md-6 overflow-hidden p-md-3 pe-0 tab-w-100 sm-w-100 mb-3 mb-md-0" style={{ minHeight: "100px !important" }}>
            {Object.keys(dailySales).length > 0 && (
              // <div className="row">
              // <div className="col-6 mb-6">
              <div className="card sm-w-100">
                <div className="card-body"><Line data={lineChartData} options={lineChartOptions} /></div>
              </div>
              // </div>
              // </div>
            )}
          </div>
        </div>
        {/*  */}

        {/*  */}
        <div className="d-flex tab-flex-wrap sm-flex-wrap w-100 gap-3 pe-md-3">
          <div className="col-md-5 tab-w-100 sm-w-100">
            <div className="card">
              <div className="card-header d-flex justify-content-between align-items-center">
                <h5 className="card-title mb-0">India Sales Map</h5>
                {selectedState && (
                  <button className="btn btn-outline-secondary btn-sm" onClick={resetMap}>
                    Reset Zoom
                  </button>
                )}
              </div>
              <div className="card-body" style={{ background: 'linear-gradient(135deg, #f5f7fa, #c3cfe2)' }}>
                <ComposableMap
                  projection="geoMercator"
                  projectionConfig={{ scale: 310 }}
                  width={200}
                  height={210}
                >
                  <ZoomableGroup
                    center={position.coordinates}
                    // zoom={position.zoom}
                    // onMoveEnd={({ coordinates, zoom }) => {
                    //   setPosition({ coordinates, zoom });
                    // }}
                    disablepanning="false"
                    disablezooming="false"

                  >
                    {/* <ZoomableGroup
                  key={`${position.coordinates[0]}-${position.coordinates[1]}-${position.zoom}`}
                  center={position.coordinates}
                  zoom={position.zoom}
                  onMoveEnd={({ coordinates, zoom }) => {
                    setPosition({ coordinates, zoom });
                  }}
                  disablepanning="false"
                  disablezooming="false"
                > */}
                    <Geographies geography={geoUrl}>
                      {({ geographies }) =>
                        geographies.map(geo => {
                          const stateName = geo.properties.ST_NM;
                          const stateInfo = stateData[stateName] || { orderCount: 0, totalSales: 0 };
                          const isSelected = selectedState === stateName;
                          const fillColor = isSelected
                            ? '#FF4500'
                            : stateInfo.orderCount > 0
                              ? `rgba(75, 192, 192, ${Math.min(0.2 + stateInfo.orderCount * 0.05, 1)})`
                              : '#D3D3D3';

                          return (
                            <Geography
                              key={geo.rsmKey}
                              geography={geo}
                              fill={fillColor}
                              stroke="#FFFFFF"
                              strokeWidth={0.5}
                              style={{
                                default: { outline: 'none' },
                                hover: { fill: '#FFD700', outline: 'none', cursor: 'pointer' },
                                pressed: { outline: 'none' },
                              }}
                              // onDoubleClick={(e) => {
                              onClick={(e) => {
                                e.preventDefault(); // Prevent default behavior
                                e.stopPropagation(); // Stop event bubbling
                                handleStateDoubleClick(geo);
                              }}
                            />
                          );
                        })
                      }
                    </Geographies>
                  </ZoomableGroup>
                </ComposableMap>
                {selectedState && (
                  <div className="mt-3 p-3 bg-light rounded shadow">
                    <h5 className="text-center mb-3">{selectedState} Details</h5>
                    {stateData[selectedState] ? (
                      <table className="table table-striped table-hover">
                        <thead>
                          <tr>
                            <th>City</th>
                            <th>Order Count</th>
                            <th>Total Sales</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(stateData[selectedState].cities || {}).map(([city, count]) => (
                            <tr key={city}>
                              <td>{city || 'Unknown'}</td>
                              <td>{count}</td>
                              <td>
                                ₹{allOrders
                                  .filter(o => o.State === selectedState && o.City === city)
                                  .reduce((sum, o) => sum + (o.finalRevenue || 0), 0)
                                  .toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-center">No data available for {selectedState}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Order Status Overview */}
          <div className="col-md-7 tab-w-100 sm-w-100">
            <div className="card">
              <div className="card-header d-flex justify-content-between align-items-center">
                <h5 className="card-title mb-0">Order Status Overview</h5>
                <button className="btn btn-success btn-sm" onClick={exportFilteredToCSV}>
                  Export Filtered Data
                </button>
              </div>
              <div className="card-body">
                {/* Filters */}
                <div className="row mb-3 g-3">
                  <div className="col-4">
                    {/* <label className="form-label">Status:</label> */}
                    <select
                      className="form-select"
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value)}
                    >
                      <option value="">Statuses</option>
                      <option value="Pending">Pending</option>
                      <option value="In Process">In Process</option>
                      <option value="Completed">Completed</option>
                      <option value="Cancelled">Cancelled</option>
                      <option value="Dispatched">Dispatched</option>
                    </select>
                  </div>
                  {/* <div className="col-md-3">
                    <label className="form-label">Order Name:</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Filter by Order Name"
                      value={orderNameFilter}
                      onChange={e => setOrderNameFilter(e.target.value)}
                    />
                  </div> */}
                  <div className="col-4">
                    {/* <label className="form-label">Bill No.:</label> */}
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Filter by Bill No."
                      value={orderNumberFilter}
                      onChange={e => setOrderNumberFilter(e.target.value)}
                    />
                  </div>
                  <div className="col-4">
                    {/* <label className="form-label">State:</label> */}
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Filter by State"
                      value={stateFilter}
                      onChange={e => setStateFilter(e.target.value)}
                    />
                  </div>
                  {/* <div className="col-md-3">
                    <label className="form-label">City:</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Filter by City"
                      value={cityFilter}
                      onChange={e => setCityFilter(e.target.value)}
                    />
                  </div> */}
                </div>

                {/* Table */}
                <div className="table-responsive">
                  <table className="table table-striped table-hover">
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                            onChange={toggleSelectAll}
                          />
                        </th>
                        <th onClick={() => handleSort('orderDate')} style={{ cursor: 'pointer' }}>
                          Date {sortField === 'orderDate' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        <th onClick={() => handleSort('orderNumber')} style={{ cursor: 'pointer' }}>
                          Bill No. {sortField === 'orderNumber' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        {/* <th onClick={() => handleSort('orderName')} style={{ cursor: 'pointer' }}>
                          Order Name {sortField === 'orderName' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th> */}
                        <th onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>
                          Status {sortField === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        <th onClick={() => handleSort('finalRevenue')} style={{ cursor: 'pointer' }}>
                          Revenue {sortField === 'finalRevenue' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        {/* <th>Address</th> */}
                        <th>State</th>
                        {/* <th>City</th> */}
                      </tr>
                    </thead>
                    <tbody>
                      {currentOrders.length > 0 ? (
                        currentOrders.map(order => (
                          <tr key={order._id}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedOrders.includes(order._id)}
                                onChange={() => toggleSelectOrder(order._id)}
                              />
                            </td>
                            <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                            <td>{order.orderNumber || 'N/A'}</td>
                            {/* <td>{order.orderName || 'N/A'}</td> */}
                            <td>
                              <span
                                className={`badge ${order.status === 'Pending' ? 'bg-warning' :
                                  order.status === 'In Process' ? 'bg-info' :
                                    order.status === 'Completed' ? 'bg-success' :
                                      order.status === 'Cancelled' ? 'bg-danger' :
                                        'bg-primary'
                                  }`}
                              >
                                {order.status}
                              </span>
                            </td>
                            <td>₹{order.finalRevenue || 0}</td>
                            {/* <td>{order.Address || 'N/A'}</td> */}
                            <td>{order.State || 'N/A'}</td>
                            {/* <td>{order.City || 'N/A'}</td> */}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="7" className="text-center">No orders match the filters</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="d-flex justify-content-between align-items-center mt-3">
                  <div>
                    Showing {currentOrders.length} of {filteredOrders.length} orders
                  </div>
                  <nav>
                    <ul className="pagination">
                      <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                        <button className="page-link" onClick={() => setCurrentPage(prev => prev - 1)}>
                          Previous
                        </button>
                      </li>
                      {Array.from({ length: Math.ceil(filteredOrders.length / ordersPerPage) }, (_, i) => (
                        <li key={i} className={`page-item ${currentPage === i + 1 ? 'active' : ''}`}>
                          <button className="page-link" onClick={() => setCurrentPage(i + 1)}>
                            {i + 1}
                          </button>
                        </li>
                      ))}
                      <li className={`page-item ${currentPage === Math.ceil(filteredOrders.length / ordersPerPage) ? 'disabled' : ''}`}>
                        <button className="page-link" onClick={() => setCurrentPage(prev => prev + 1)}>
                          Next
                        </button>
                      </li>
                    </ul>
                  </nav>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/*  */}

      </div>

      {/* Charts */}
      <div className="row">
        <div className="col-md-6 mb-4">
        </div>
      </div>

      {/* Modal */}
      <div className={`modal fade ${showModal ? 'show d-block' : ''}`} tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div className="modal-dialog modal-lg">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{modalData.title} Bill Details</h5>
              <button type="button" className="btn-close" onClick={handleCloseModal}></button>
            </div>
            <div className="modal-body overflow-auto">
              <div className="mb-3">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search by Bill Name or No"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              {modalData.orders.length > 0 ? (
                <table className="table table-striped">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Bill No.</th>
                      <th>Client</th>
                      <th>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalData.orders
                      .filter(order =>
                        // order.orderName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase())
                      )
                      .map(order => (

                        <tr key={order._id}>
                          <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                          <td>{order.orderNumber}</td>
                          <td>{order.companyName}</td>
                          <td>₹{order.finalRevenue}</td>
                        </tr>
                      ))}
                    <tr>
                      <td colSpan={1} className='text-end fw-bold'>Total: </td>
                      <td colSpan={2}></td>
                      <td colSpan={1} className="text-start fw-bold">₹{modalData.orders.filter(order =>
                        order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase())
                      ).reduce((sum, p) => sum + parseFloat(p.finalRevenue), 0)}</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p>No orders available for this period.</p>
              )}
            </div>

          </div>
        </div>
      </div>

    </div>
  );
};

export default SalesAnalytics;