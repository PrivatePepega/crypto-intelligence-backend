import express from "express";

import { googleLogin, googleLoginSchema, signout } from "../controller/authController.js";
import { requireTrustedOrigin } from "../middleware/trustedOrigin.js";
import { validateRequest } from "../middleware/validateRequest.js";

const router = express.Router();

// Creates the account on the first Google login and logs in on later ones.
router.post("/login", requireTrustedOrigin, validateRequest(googleLoginSchema), googleLogin);
router.post("/signout", requireTrustedOrigin, signout);

export default router;
