import express from "express";
import authRoutes from "./authRoutes.js";
import chatbotRoutes from "./chatbotRoutes.js";
import worldRoutes from "./worldRoutes.js";
import { getCurrentUser } from "../controller/authController.js";
import {
  fetchIndicatorData,
  fetchIndicatorDataSchema,
  listIndicators,
} from "../controller/indicatorController.js";
import { getWeatherBrief } from "../controller/weatherController.js";
import { getClimateBrief } from "../controller/climateController.js";
import authMiddleware from "../middleware/auth-middleware.js";
import { validateRequest } from "../middleware/validateRequest.js";

const router = express.Router();

router.use("/auth", authRoutes);
router.get("/authMe", authMiddleware, getCurrentUser);
router.use("/chatbot", chatbotRoutes);
router.use("/world", worldRoutes);

// These indicator routes are public: they expose global data only, never
// user-specific data.
//
// The frontend uses this list to know which names / series ids are available.
router.get("/indicators", listIndicators);

// Generic read endpoint: accepts a list of indicator names (or series ids) and
// returns metadata, current rows, and historical rows for each one.
router.post("/fetchData", validateRequest(fetchIndicatorDataSchema), fetchIndicatorData);

// Public brief endpoints: weather and climate human briefs. No auth required.
router.get("/weather/brief", getWeatherBrief);
router.get("/climate/brief", getClimateBrief);

export default router;
