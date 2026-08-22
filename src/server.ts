import "dotenv/config";

import mongoose from "mongoose";
import app from "./app.js";

const PORT =
  Number(process.env.PORT) || 5000;

const MONGO_URI =
  process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error(
    "❌ MONGO_URI is not defined in .env"
  );
  process.exit(1);
}

const startServer =
  async (): Promise<void> => {
    try {
      await mongoose.connect(
        MONGO_URI
      );

      console.log(
        "✅ MongoDB Connected Successfully"
      );

      app.listen(
        PORT,
        () => {
          console.log(
            `🚀 Server running on port ${PORT}`
          );

          console.log(
            `🌐 http://localhost:${PORT}`
          );
        }
      );
    } catch (error) {
      console.error(
        "❌ Database connection failed:",
        error
      );

      process.exit(1);
    }
  };

startServer();