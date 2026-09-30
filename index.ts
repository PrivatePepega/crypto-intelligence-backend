import "dotenv/config";
import express, { request } from "express";
import cors from "cors";
import mongoose from "mongoose";
import morgan from "morgan";
import type { Request, Response, NextFunction, Errback } from 'express'
import routes from "./routes/index.js"
import cookieParser from "cookie-parser";
import "./config/database.js";
import { connectMarketauxMcp, marketauxClient } from "./mcp/client.js";
import { callMarketauxNews } from "./mcp/marketaux.js";


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





app.use((err: Errback, req:Request, res:Response, next:NextFunction) => {
    res.status(404).json({message: "Not Found"})
})
app.use((err: Errback, req:Request, res:Response, next:NextFunction) => {
  res.status(500).json({message: "Internal Error"})
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


async function main() {
  try {
    await connectMarketauxMcp();

    const tools = await marketauxClient.listTools();

    console.log("\nAvailable MCP tools:");
    console.dir(tools.tools, { depth: null });

    console.log("\nCalling MarketAux news tool...\n");

    const result = await callMarketauxNews();

    console.dir(result, { depth: null });
  } catch (error) {
    console.error("MCP test failed:", error);
  } finally {
    await marketauxClient.close();
  }
}

main();