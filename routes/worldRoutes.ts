import express from "express"
import {fredMacro} from "../controller/worldController.js"


const router = express.Router()


router.get("/fred", fredMacro);



export default router;