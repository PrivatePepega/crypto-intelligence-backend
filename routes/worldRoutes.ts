import express from "express"
import { fredMacro } from "../controller/fred.controller.js";
import { alphaVantageMacro } from "../controller/alphaVantage.controller.js";


const router = express.Router()


router.get("/fred", fredMacro);
router.get("/alphaVantage", alphaVantageMacro);



export default router;