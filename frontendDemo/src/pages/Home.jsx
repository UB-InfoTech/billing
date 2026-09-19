import React,{ useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';

const Home = () => {
  const [user, setUser] = useState(null);
  const [notes, setNotes] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    content: ''
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const { title, content } = formData;

  useEffect(() => {
    // Check for error from ProtectedRoute
    if (location.state?.error) {
      setError(location.state.error);
    }
    const token = localStorage.getItem('token');
    if (!token) {
      alert('❌ No token found, please login first');
      throw new Error('No token found');
    }

    const fetchUserAndNotes = async () => {
      try {

       // Fetch user data
        const userRes = await axios.get(`${linkone}/api/auth/user`, {
          headers: {
            'x-auth-token': token
          }
        });
        setUser(userRes.data);

        // Fetch user-specific notes
        const notesRes = await axios.get(`${linkone}/api/notes`, {
          headers: {
            'x-auth-token': token
          }
        });
        setNotes(notesRes.data);
      } catch (err) {
        console.error('Home fetch error:', err.message); // Debug log
        setError(err.response?.data?.msg || 'Please login first');
        navigate('/login', { state: { error: err.response?.data?.msg || 'Please login first' } });
      }
    };
    fetchUserAndNotes();
  }, [navigate, location.state]);

  const onChange = e => 
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const onSubmit = async e => {
    e.preventDefault();
    try {
      
      const res = await axios.post(`${linkone}/api/notes`, {
        title,
        content
      }, {
        headers: {
          'x-auth-token': token
        }
      });
      setNotes([...notes, res.data]);
      setFormData({ title: '', content: '' });
    } catch (err) {
      console.error('Note creation error:', err.message); // Debug log
      setError(err.response?.data?.msg || 'Error creating note');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login', { state: { error: 'Logged out successfully' } });
  };

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-8">
          <div className="card shadow">
            <div className="card-body">
              <h1 className="card-title text-center mb-4">Dashboard</h1>
              
              {error && (
                <div className="alert alert-danger" role="alert">
                  {error}
                </div>
              )}
              
              {user && (
                <>
                  <div className="d-flex justify-content-between align-items-center mb-4">
                    <h2>Welcome, {user.username}</h2>
                    <button 
                      className="btn btn-danger"
                      onClick={handleLogout}
                    >
                      Logout
                    </button>
                  </div>
                  <p className="text-center mb-4">Email: {user.email}</p>

                  {/* Note Creation Form */}
                  <h3 className="mb-3">Create New Note</h3>
                  <form onSubmit={onSubmit}>
                    <div className="mb-3">
                      <label htmlFor="title" className="form-label">
                        Title
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        id="title"
                        name="title"
                        value={title}
                        onChange={onChange}
                        placeholder="Enter note title"
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label htmlFor="content" className="form-label">
                        Content
                      </label>
                      <textarea
                        className="form-control"
                        id="content"
                        name="content"
                        value={content}
                        onChange={onChange}
                        placeholder="Enter note content"
                        rows="4"
                        required
                      ></textarea>
                    </div>
                    <div className="d-grid gap-2">
                      <button type="submit" className="btn btn-primary">
                        Create Note
                      </button>
                    </div>
                  </form>

                  {/* Notes List */}
                  <h3 className="mt-5 mb-3">Your Notes</h3>
                  {notes.length === 0 ? (
                    <p className="text-muted">No notes found. Create one above!</p>
                  ) : (
                    <div className="list-group">
                      {notes.map(note => (
                        <div key={note._id} className="list-group-item">
                          <h5>{note.title}</h5>
                          <p>{note.content}</p>
                          <small className="text-muted">
                            Created: {new Date(note.createdAt).toLocaleDateString()}
                          </small>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;