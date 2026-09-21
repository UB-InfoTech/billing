import React, { useState, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import axios from "axios";
import { Modal, Button, Form } from "react-bootstrap";
import "./CalendarPage.css"; // Optional: custom CSS for additional tweaks

const Calendar = () => {
    const [events, setEvents] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [modalEvent, setModalEvent] = useState({
        id: null,
        title: "",
        start: "",
        end: "",
        color: "#3788d8", // Default color
        isEdit: false,
    });

    // const linkone = `http://localhost:5000`;
  const linkone = `https://baba.divinesparks.in`;

    // Fetch events from the database
    useEffect(() => {
        axios
            .get(`${linkone}` + "/api/events")
            .then((response) => setEvents(response.data))
            .catch((error) => console.error("Error fetching events:", error));
    }, []);

    // Open modal to create a new event
    const handleDateClick = (info) => {
        setModalEvent({
            title: "",
            start: info.dateStr,
            end: info.dateStr,
            color: "#3788d8", // Default color
            isEdit: false,
        });
        setShowModal(true);
    };

    // Open modal to edit an existing event
    const handleEventClick = (clickInfo) => {

        // id: clickInfo.event._id,
        setModalEvent({
            id: clickInfo.event._def.extendedProps._id,
            title: clickInfo.event.title,
            start: clickInfo.event.startStr,
            end: clickInfo.event.endStr || clickInfo.event.startStr,
            color: clickInfo.event.backgroundColor || "#3788d8",
            isEdit: true,
        });
        setShowModal(true);
    };

    // // Save or update the event
    // const handleSaveEvent = async () => {
    //   const { title, start, end, color, isEdit, id } = modalEvent;

    //   if (title.trim() === '') return alert('Event title is required');

    //   const eventData = { title, start, end, color };

    //   if (isEdit) {
    //     // Update event
    //     await axios.put(`/api/events/${id}`, eventData);
    //     setEvents(events.map(event => (event.id === id ? { ...eventData, id } : event)));
    //   } else {
    //     // Create event
    //     const response = await axios.post('/api/events', eventData);
    //     setEvents([...events, response.data]);
    //   }

    //   setShowModal(false);
    // };

    const handleSaveEvent = async () => {
        const { title, start, end, color, isEdit, id } = modalEvent;

        if (title.trim() === "") return alert("❌ Event title is required");

        const eventData = { title, start, end, color };

        if (isEdit) {
            // Update existing event
            await axios
                .put(`${linkone}/api/events/${id}`, eventData)
                .then((response) => {
                    setEvents(
                        events.map((event) =>
                            event.id === id ? { ...response.data, id } : event
                        )
                    );
                })
                .catch((error) =>
                    alert("❌ Error updating event:", error)
                );
        } else {
            // Create new event
            await axios
                .post(`${linkone}/api/events`, eventData)
                .then((response) => {
                    setEvents([...events, response.data]);
                    alert("✅ Event Created");
                })
                .catch((error) =>
                    alert("❌ Error Creating Event: " + error)
                );
        }

        setShowModal(false);
    };

    // Delete an event
    // const handleEventDelete = async () => {
    //   try {
    //     await axios.delete(`/api/events/${modalEvent.id}`);
    //     setEvents(events.filter(event => event.id !== modalEvent.id)); // Remove event from state
    //     setShowModal(false);
    //   } catch (error) {
    //     console.error('Error deleting event:', error);
    //   }
    // };

    const handleEventDelete = async () => {
        if (!modalEvent.id) {
            alert("❌ No event ID found for deletion!");
            return;
        }

        try {
            await axios.delete(`${linkone}/api/events/${modalEvent.id}`);
            setEvents(events.filter((event) => event.id !== modalEvent.id));
            setShowModal(false);
            alert("✅ Event Deleted Sucessfully");
        } catch (error) {
            alert("❌ Error deleting event: " + error.message);
        }
    };

    // Handle form input changes
    const handleInputChange = (e) => {
        setModalEvent({ ...modalEvent, [e.target.name]: e.target.value });
    };

    const handleEventDrop = async (info) => {
        const { id, startStr, endStr } = info.event;

        try {
            await axios.put(`${linkone}/api/events/${id}`, {
                start: startStr,
                end: endStr || startStr, // Handle case where there's no end date
            });

            // Update the event in the state
            setEvents(
                events.map((event) =>
                    event.id === id
                        ? { ...event, start: startStr, end: endStr || startStr }
                        : event
                )
            );
            alert("✅ Event Update Sucessfully");
        } catch (error) {
            alert("❌ Error updating event after drag:");
            // console.error("Error updating event after drag:", error);
            info.revert(); // Revert to the original date if the update fails
        }
    };

    return (
        <div className="container my-3 w-100 overflow-auto">
            <div className="calendar-header">
                <h2 className="text-center mb-2">Event Calendar</h2>
            </div>

            <div className="calendar-container bg-white rounded p-2 overflow-auto">
                <FullCalendar
                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                    initialView="dayGridMonth"
                    events={events}
                    dateClick={handleDateClick}
                    eventClick={handleEventClick}
                    editable={true}
                    eventDrop={handleEventDrop} // Handle drag & drop event update
                    eventResize={handleEventDrop} // Handle resize event update
                    headerToolbar={{
                        left: "prev,next today",
                        center: "title",
                        right: "dayGridMonth,timeGridWeek,timeGridDay",
                    }}
                    eventContent={(arg) => (
                        <div className="fc-event-content">
                            <span
                                className="event-color-dot"
                                style={{
                                    backgroundColor: arg.event.backgroundColor || "#3788d8",
                                }}
                            ></span>
                            <span>{arg.event.title}</span>
                        </div>
                    )}
                />
            </div>
            {/* Modal for creating/editing events */}
            <Modal show={showModal} onHide={() => setShowModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>
                        {modalEvent.isEdit ? "Edit Event" : "Create Event"}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form>
                        <div className="d-flex gap-5">
                            <Form.Group controlId="formEventTitle">
                                <Form.Label>Event Title</Form.Label>
                                <Form.Control
                                    type="text"
                                    placeholder="Enter event title"
                                    name="title"
                                    value={modalEvent.title}
                                    onChange={handleInputChange}
                                />
                            </Form.Group>

                            <Form.Group controlId="formEventColor" className="">
                                <Form.Label>Event Color</Form.Label>
                                <Form.Control
                                    type="color"
                                    name="color"
                                    value={modalEvent.color}
                                    onChange={handleInputChange}
                                />
                            </Form.Group>
                        </div>

                        <Form.Group controlId="formEventStart" className="mt-3">
                            <Form.Label>Start Time</Form.Label>
                            <Form.Control
                                type="datetime-local"
                                name="start"
                                value={modalEvent.start}
                                onChange={handleInputChange}
                            />
                        </Form.Group>

                        <Form.Group controlId="formEventEnd" className="mt-3">
                            <Form.Label>End Time</Form.Label>
                            <Form.Control
                                type="datetime-local"
                                name="end"
                                value={modalEvent.end}
                                onChange={handleInputChange}
                            />
                        </Form.Group>
                    </Form>
                </Modal.Body>
                <Modal.Footer>
                    {modalEvent.isEdit && (
                        <Button variant="danger" onClick={handleEventDelete}>
                            Delete Event
                        </Button>
                    )}
                    <Button variant="secondary" onClick={() => setShowModal(false)}>
                        Close
                    </Button>
                    <Button variant="primary" onClick={handleSaveEvent}>
                        {modalEvent.isEdit ? "Update Event" : "Create Event"}
                    </Button>
                </Modal.Footer>
            </Modal>

        </div>

    );
};

export default Calendar;