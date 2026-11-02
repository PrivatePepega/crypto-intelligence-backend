import express from "express";

import {
  testGetHistory,
  testLogin,
  testSendMessage,
  testGetHistorySchema,
  testLoginSchema,
  testSendMessageSchema,
} from "../controller/chatbotTestController.js";
import { requireTrustedOrigin } from "../middleware/trustedOrigin.js";
import { validateRequest } from "../middleware/validateRequest.js";

const router = express.Router();

// No auth middleware - test endpoints use username in request body/query

// Login or create test user by username
router.post("/login", requireTrustedOrigin, validateRequest(testLoginSchema), testLogin);

// Get chat history for a user by username
router.get("/history", validateRequest(testGetHistorySchema, "query"), testGetHistory);

// Send message and get response for a user by username
router.post(
  "/messages",
  requireTrustedOrigin,
  validateRequest(testSendMessageSchema),
  testSendMessage,
);

export default router;