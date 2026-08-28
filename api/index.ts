import "dotenv/config";

import app from "../src/app.js";
import connectDB from "../src/config/db.js";

let dbConnected = false;

export default async function handler(
  req: any,
  res: any
) {
  try {
    if (!dbConnected) {
      await connectDB();
      dbConnected = true;
    }

    return app(req, res);
  } catch (error) {
    console.error(
      "API initialization error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Server initialization failed",
    });
  }
}