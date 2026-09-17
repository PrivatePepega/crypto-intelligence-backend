import express from "express"

import { test } from "../controller/worldController.js";


const router = express.Router()



router.get("/test", test);



export default router;