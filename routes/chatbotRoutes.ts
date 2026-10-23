import express from "express";

import {
  getChatMessages,
  sendChatMessage,
  sendChatMessageSchema,
} from "../controller/chatbotController.js";
import authMiddleware from "../middleware/auth-middleware.js";
import { requireTrustedOrigin } from "../middleware/trustedOrigin.js";
import { validateRequest } from "../middleware/validateRequest.js";

const router = express.Router();

// Every chatbot route needs a verified database session.
router.use(authMiddleware);

// Loads the requested chat, or the user's latest chat, with its messages.
router.get("/messages", getChatMessages);

// Saves the user message, invokes the chatbot graph, and saves the answer.
router.post(
  "/messages",
  requireTrustedOrigin,
  validateRequest(sendChatMessageSchema),
  sendChatMessage,
);

export default router;
