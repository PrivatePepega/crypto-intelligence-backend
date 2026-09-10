import "dotenv/config";
import express, { request } from "express";
import cors from "cors";
import mongoose from "mongoose";
import morgan from "morgan";
import type { Request, Response, NextFunction, Errback } from 'express'
import routes from "./routes/index.js"
import cookieParser from "cookie-parser";



const app = express();
const PORT = process.env.PORT || 5000;



app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ["GET", "POST", "DELETE", "PUT"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));
app.use(cookieParser());
app.use(morgan("dev"));
app.use(express.json());
mongoose.connect(process.env.MONGODB_URI || "")
.then(() => console.log("DB Connected Sucessfully"))
.catch((err) => console.log("Failed to connect to DB:", err))




app.get("/", async (req:Request, res:Response) => {
    res.status(200).json({message: "server hit"})
})
app.use("/api-v1", routes);





app.use((err: Errback, req:Request, res:Response, next:NextFunction) => {
    res.status(404).json({message: "Not Found"})
})
app.use((err: Errback, req:Request, res:Response, next:NextFunction) => {
  res.status(500).json({message: "Internal Error"})
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});