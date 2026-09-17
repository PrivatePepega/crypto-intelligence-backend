import express from "express"
import { fredMacro } from "../controller/fred.controller.js";
import { alphaVantageMacro } from "../controller/alphaVantage.controller.js";
import { cnnMacro } from "../controller/cnn.controller.js";
import { aaiiSentiment } from "../controller/aaii.controller.js";
import { CFTCMacro } from "../controller/cftc.controller.js";
import { test } from "../controller/worldController.js";


const router = express.Router()


router.get("/fred", fredMacro);
router.get("/alphaVantage", alphaVantageMacro);
router.get("/cnnFearGreed", cnnMacro);
router.get("/aaiiSentiment", aaiiSentiment);
router.get("/CFTC", CFTCMacro);
router.get("/test", test);



export default router;