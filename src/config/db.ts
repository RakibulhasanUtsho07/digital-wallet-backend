import mongoose from "mongoose";

const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGO_URI;

    if (!mongoURI) {
      throw new Error("MONGO_URI is not defined in .env");
    }

    const connection = await mongoose.connect(mongoURI);

    console.log(
      `MongoDB Connected Successfully: ${connection.connection.host}`
    );
  } catch (error) {
    console.error("Database connection error:", error);
    throw error;
  }
};

export default connectDB;