import "dotenv/config";
import express, { request } from "express";
import cors from "cors";
import mongoose from "mongoose";
import morgan from "morgan";
import type { Request, Response, NextFunction } from 'express'
import routes from "./routes/index.js"
import cookieParser from "cookie-parser";
import "./config/database.js";
import { mountMcpServer } from "./mcp/index.js";



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





app.get("/", async (req:Request, res:Response) => {
    res.status(200).json({message: "server hit"})
})
app.use("/api-v1", routes);

// Mounted on the same app and port as the REST API, so MCP needs no second
// process. Must come after express.json() (the handler is handed the parsed
// body) and before app.listen(), so a misconfigured provider fails at boot.
// Registered before the error handlers below to keep its errors out of the
// 404/500 fallback.
mountMcpServer(app);





app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: "Not Found" });
});

app.use(
  (
    err: Error & { status?: number; statusCode?: number },
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    const status = err.status ?? err.statusCode ?? 500;

    if (status >= 500) {
      console.error(err);
    }

    res.status(status).json({
      message: status >= 500 ? "Internal Error" : err.message,
    });
  },
);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


