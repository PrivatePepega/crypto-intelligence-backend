import express from "express"
import {massiveMacro, fredMacro} from "../controller/worldController.js"


const router = express.Router()


router.get("/massive", massiveMacro);
router.get("/fred", fredMacro);



export default router;