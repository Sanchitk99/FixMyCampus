import { Notification } from "../models/Notification.js";

export const listMyNotifications = async (req, res) => {
  const list = await Notification.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate("ticket", "title status");
  res.json(list);
};

export const markNotificationRead = async (req, res) => {
  const { id } = req.params;
  const n = await Notification.findOneAndUpdate(
    { _id: id, user: req.user._id },
    { read: true },
    { new: true }
  );
  if (!n) {
    return res.status(404).json({ message: "Notification not found" });
  }
  res.json(n);
};
