"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const globalWithMongoose = global;
const cached = globalWithMongoose.mongoose ??
    (globalWithMongoose.mongoose = {
        conn: null,
        promise: null,
    });
const connectDB = async () => {
    if (cached.conn) {
        return cached.conn;
    }
    const mongoURI = process.env.MONGO_URI;
    if (!mongoURI) {
        throw new Error("MONGO_URI is not defined");
    }
    if (!cached.promise) {
        cached.promise = mongoose_1.default
            .connect(mongoURI, {
            bufferCommands: false,
        })
            .then((connection) => {
            console.log(`MongoDB Connected Successfully: ${connection.connection.host}`);
            return connection;
        });
    }
    try {
        cached.conn =
            await cached.promise;
        return cached.conn;
    }
    catch (error) {
        cached.promise = null;
        console.error("Database connection error:", error);
        throw error;
    }
};
exports.default = connectDB;
