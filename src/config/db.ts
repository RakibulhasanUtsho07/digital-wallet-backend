import mongoose from "mongoose";

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
};

const globalWithMongoose =
  global as GlobalWithMongoose;

const cached =
  globalWithMongoose.mongoose ??
  (globalWithMongoose.mongoose = {
    conn: null,
    promise: null,
  });

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  const mongoURI =
    process.env.MONGO_URI;

  if (!mongoURI) {
    throw new Error(
      "MONGO_URI is not defined"
    );
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(mongoURI, {
        bufferCommands: false,
      })
      .then((connection) => {
        console.log(
          `MongoDB Connected Successfully: ${connection.connection.host}`
        );

        return connection;
      });
  }

  try {
    cached.conn =
      await cached.promise;

    return cached.conn;
  } catch (error) {
    cached.promise = null;

    console.error(
      "Database connection error:",
      error
    );

    throw error;
  }
};

export default connectDB;