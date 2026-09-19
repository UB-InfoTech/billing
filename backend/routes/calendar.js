const express = require('express');
// const Event = require('../models/Event');
const Event = require('../models/Calendar');
const router = express.Router();

// Get all events
router.get('/', async (req, res) => {
  try {
    const events = await Event.find(); // Assuming req.user.id is available from authentication middleware
    res.json(events);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create a new event
router.post('/', async (req, res) => {
  const event = new Event(
    req.body,
    // { ...req.body, createdBy: req.user.id } // Assuming req.user.id is available from authentication middleware
  );

  try {
    const newEvent = await event.save();
    res.status(201).json(newEvent);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// // Update an event
// router.put('/:id', async (req, res) => {
//     try {
//       const updatedEvent = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true });
//       res.json(updatedEvent);
//     } catch (err) {
//       res.status(400).json({ message: err.message });
//     }
//   });
// Update event
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedEvent = await Event.findByIdAndUpdate(id, req.body, { new: true });
    if (!updatedEvent) {
      return res.status(404).json({ message: 'Event not found' });
    }
    res.json(updatedEvent);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

//  // DELETE route for deleting an event by ID
// router.delete('/:id', async (req, res) => {
//   try {
//     // console.log("enter",req);

//     const event = await Event.findByIdAndDelete(req.params.id);
//     console.log("enter event",event);
//     if (!event) {
//       return res.status(404).json({ message: 'Event not found' });
//     }
//     res.json({ message: 'Event deleted' });
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// });

// Delete event
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedEvent = await Event.findByIdAndDelete(id);

    if (!deletedEvent) {
      return res.status(404).json({ message: 'Event not found' });
    }
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});
module.exports = router;
