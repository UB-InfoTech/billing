import React, { useState, useEffect } from 'react';
import axios from 'axios';

function Profile() {
    const [profile, setProfile] = useState({
        headerTitle: '',
        companyName: '',
        companyAddress: '',
        phoneNumber1: '',
        phoneNumber2: '',
        gstin: '',
        pan: '',
        bankName: '',
        accountNo: '',
        branchName: '',
        ifsc: '',
        pinCode: '',
        stateCode: '',
        billNoPrefix: '',
        billNoSequence: '',
        billNoSuffix: '',
        eWayUserName: '',
        eWayPassword: '',
    });
    //  const linkone = `http://localhost:5000`;
     const linkone = `https://baba.divinesparks.in`;


    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            setLoading(true);
            const response = await axios.get(`${linkone}/api/profile`, {
                headers: {
                    'x-auth-token': localStorage.getItem('token'),
                },
            }
            );
            if (response.data) {
                setProfile(response.data);
            } else {
                setError('No profile data available.');
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
            setError('Failed to load profile. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setProfile({ ...profile, [name]: value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await axios.put(`${linkone}/api/profile`, profile, {
                headers: {
                    'x-auth-token': localStorage.getItem('token'),
                },
            }
            );
            setProfile(response.data);
            setIsEditing(false);
            setError(null);
        } catch (error) {
            console.error('Error updating profile:', error);
            setError('Failed to update profile. Please try again.');
        }
    };

    if (loading) {
        return (
            <div className="container py-4 text-center">
                <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="container py-4">
                <div className="alert alert-danger" role="alert">
                    {error}
                </div>
            </div>
        );
    }

    return (
        <div className="container py-4">
            <div className="card shadow-sm mx-auto" style={{ maxWidth: '600px' }}>
                <div className="card-body">
                    <h1 className="card-title text-center mb-4">
                        {profile.headerTitle || 'Company Profile'}
                    </h1>
                    {isEditing ? (
                        <form onSubmit={handleSubmit}>
                            <div className="mb-3">
                                <label htmlFor="headerTitle" className="form-label">
                                    Header Title
                                </label>
                                <input
                                    type="text"
                                    className="form-control"
                                    id="headerTitle"
                                    name="headerTitle"
                                    value={profile.headerTitle}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="companyName" className="form-label">
                                    Company Name
                                </label>
                                <input
                                    type="text"
                                    className="form-control"
                                    id="companyName"
                                    name="companyName"
                                    value={profile.companyName}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="companyAddress" className="form-label">
                                    Company Address
                                </label>
                                <textarea
                                    className="form-control"
                                    id="companyAddress"
                                    name="companyAddress"
                                    value={profile.companyAddress}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="phoneNumber1" className="form-label">
                                    Phone Number 1
                                </label>
                                <input
                                    type="tel"
                                    className="form-control"
                                    id="phoneNumber1"
                                    name="phoneNumber1"
                                    value={profile.phoneNumber1}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="phoneNumber2" className="form-label">
                                    Phone Number 2
                                </label>
                                <input
                                    type="tel"
                                    className="form-control"
                                    id="phoneNumber2"
                                    name="phoneNumber2"
                                    value={profile.phoneNumber2}
                                    onChange={handleInputChange}
                                />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="gstin" className="form-label">
                                    GSTIN
                                </label>
                                <input
                                    type="text"
                                    className="form-control"
                                    id="gstin"
                                    name="gstin"
                                    value={profile.gstin}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="pan" className="form-label">
                                    PAN
                                </label>
                                <input
                                    type="text"
                                    className="form-control"
                                    id="pan"
                                    name="pan"
                                    value={profile.pan}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="bankName" className="form-label">
                                    Bank Name
                                </label>
                                <input
                                    type="text"
                                    className="form-control"
                                    id="bankName"
                                    name="bankName"
                                    value={profile.bankName}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="accountNo" className="form-label">
                                    Account Number
                                </label>
                                <input
                                    type="text"
                                    className="form-control"
                                    id="accountNo"
                                    name="accountNo"
                                    value={profile.accountNo}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="branchName" className="form-label">
                                    Branch Name
                                </label>
                                <input
                                    type="text"
                                    className="form-control"
                                    id="branchName"
                                    name="branchName"
                                    value={profile.branchName}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="ifsc" className="form-label">
                                    IFSC
                                </label>
                                <input
                                    type="text"
                                    className="form-control"
                                    id="ifsc"
                                    name="ifsc"
                                    value={profile.ifsc}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>

                            <div className="mb-3">
                                <label htmlFor="pinCode" className="form-label">
                                    Pin Code
                                </label>
                                <input
                                    type="text"
                                    className="form-control"
                                    id="pinCode"
                                    name="pinCode"
                                    value={profile.pinCode}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="stateCode" className="form-label">
                                    State Code
                                </label>
                                <input
                                    type="number"
                                    className="form-control"
                                    id="stateCode"
                                    name="stateCode"
                                    value={profile.stateCode}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                            <div className="d-flex">
                                <div className="mb-3">
                                    <label htmlFor="billNoPrefix" className="form-label">
                                        Bill No. Prefix
                                    </label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        id="billNoPrefix"
                                        name="billNoPrefix"
                                        value={profile.billNoPrefix}
                                        onChange={handleInputChange}
                                    />
                                </div>
                                <div className="mb-3">
                                    <label htmlFor="billNoSequence" className="form-label">
                                        Bill Sequence
                                    </label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        id="billNoSequence"
                                        name="billNoSequence"
                                        value={profile.billNoSequence}
                                        onChange={handleInputChange}
                                    />
                                </div>
                                <div className="mb-3">
                                    <label htmlFor="billNoSuffix" className="form-label">
                                        Bill No Suffix
                                    </label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        id="billNoSuffix"
                                        name="billNoSuffix"
                                        value={profile.billNoSuffix}
                                        onChange={handleInputChange}
                                    />
                                </div>
                            </div>
                            <div className="mb-3">
                                <label htmlFor="eWayUserName" className="form-label">
                                    E-Way Bill User Name
                                </label>
                                <input
                                    type="text"
                                    className="form-control"
                                    id="eWayUserName"
                                    name="eWayUserName"
                                    value={profile.eWayUserName}
                                    onChange={handleInputChange}
                                />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="eWayPassword" className="form-label">
                                    E-Way Bill Password
                                </label>
                                <input
                                    type="password"
                                    className="form-control"
                                    id="eWayPassword"
                                    name="eWayPassword"
                                    value={profile.eWayPassword}
                                    onChange={handleInputChange}
                                />
                            </div>



                            <div className="d-flex justify-content-end gap-2">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setIsEditing(false)}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    Save
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div>
                            <p className="card-text">
                                <strong>Company Name:</strong> {profile.companyName || 'N/A'}
                            </p>
                            <p className="card-text">
                                <strong>Company Address:</strong> {profile.companyAddress || 'N/A'}
                            </p>
                            <p className="card-text">
                                <strong>Phone Number 1:</strong> {profile.phoneNumber1 || 'N/A'}
                            </p>
                            <p className="card-text">
                                <strong>Phone Number 2:</strong> {profile.phoneNumber2 || 'N/A'}
                            </p>
                            <p className="card-text">
                                <strong>GSTIN:</strong> {profile.gstin || 'N/A'}
                            </p>
                            <p className="card-text">
                                <strong>PAN:</strong> {profile.pan || 'N/A'}
                            </p>
                            <p className="card-text">
                                <strong>Bank Name:</strong> {profile.bankName || 'N/A'}
                            </p>
                            <p className="card-text">
                                <strong>Account Number:</strong> {profile.accountNo || 'N/A'}
                            </p>
                            <p className="card-text">
                                <strong>Branch Name:</strong> {profile.branchName || 'N/A'}
                            </p>
                            <p className="card-text">
                                <strong>IFSC:</strong> {profile.ifsc || 'N/A'}
                            </p>
                            <p className="card-text">
                                <strong>Pin Code:</strong> {profile.pinCode || 'N/A'}
                            </p>
                            <p className="card-text">
                                <strong>State Code:</strong> {profile.stateCode || 'N/A'}
                            </p>
                            <p className='card-text'>
                                <strong>Bill Sequence:</strong> {(profile.billNoPrefix || '') + profile.billNoSequence + (profile.billNoSuffix || '')}
                            </p>
                            <p className="card-text">
                                <strong>E-Way Bill User Name:</strong> {profile.eWayUserName || 'N/A'}
                            </p>
                            <p className="card-text">
                                <strong>E-Way Bill Password:</strong> {profile.eWayPassword || 'N/A'}
                            </p>

                            <button
                                className="btn btn-primary mt-3"
                                onClick={() => setIsEditing(true)}
                            >
                                Edit Profile
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Profile;