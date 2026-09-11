import express from "express"
import worldRoutes from "./worldRoutes.js"


const router = express.Router()


router.use("/world", worldRoutes);



export default router;