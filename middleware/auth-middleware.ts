import jwt from "jsonwebtoken";
import User from "../model/user.js";
import type { Request, Response, NextFunction} from 'express'


interface AuthTokenPayload extends jwt.JwtPayload {
    userId: string;
    purpose: string;
  }

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is required");
}


const authMiddleware = async (req:Request, res:Response, next:NextFunction) => {
  try {
    const token = req.cookies.token

    if (!token) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === "string") {
    return res.status(401).json({
        message: "Invalid token",
    });
    }
    
    const payload = decoded as AuthTokenPayload;
    if (payload.purpose !== "login") {
        return res.status(401).json({
          message: "Invalid authentication token",
        });
      }

    const user = await User.findById(payload.userId);

    if (!user) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Internal server error",
    });
  }
};

export default authMiddleware;