"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const mongoose_1 = __importDefault(require("mongoose"));
const User_js_1 = require("../models/User.js");
/* =========================================================
   DATABASE URI
========================================================= */
function getMongoUri() {
    const uri = process.env.MONGODB_URI ||
        process.env.MONGO_URI ||
        process.env.MONGO_DB_URI;
    if (!uri) {
        throw new Error("MongoDB URI is missing.");
    }
    return uri;
}
/* =========================================================
   REMOVE LEGACY USER INDEXES
========================================================= */
async function removeLegacyUserIndexes() {
    try {
        console.log("Connecting to database...");
        await mongoose_1.default.connect(getMongoUri());
        console.log("✅ Database connected");
        /* =====================================================
           CURRENT INDEXES
        ====================================================== */
        const indexes = await User_js_1.User.collection.indexes();
        console.log("\nCurrent indexes:");
        for (const index of indexes) {
            console.log(`- ${index.name}`);
        }
        /* =====================================================
           DROP OLD EMAIL INDEX
        ====================================================== */
        const emailIndexExists = indexes.some((index) => index.name ===
            "email_1");
        if (emailIndexExists) {
            await User_js_1.User.collection.dropIndex("email_1");
            console.log("✅ Removed legacy email_1 index");
        }
        else {
            console.log("ℹ️ email_1 index does not exist");
        }
        /* =====================================================
           OPTIONAL LEGACY PHONE INDEX
        ====================================================== */
        const phoneIndexExists = indexes.some((index) => index.name ===
            "phone_1");
        if (phoneIndexExists) {
            await User_js_1.User.collection.dropIndex("phone_1");
            console.log("✅ Removed legacy phone_1 index");
        }
        else {
            console.log("ℹ️ phone_1 index does not exist");
        }
        /* =====================================================
           FINAL INDEXES
        ====================================================== */
        const finalIndexes = await User_js_1.User.collection.indexes();
        console.log("\nFinal indexes:");
        for (const index of finalIndexes) {
            console.log(`- ${index.name}`);
        }
        console.log("\n✅ Legacy index cleanup completed.");
    }
    catch (error) {
        console.error("INDEX CLEANUP ERROR:", error instanceof Error
            ? error.message
            : error);
        process.exitCode =
            1;
    }
    finally {
        await mongoose_1.default.disconnect();
        console.log("Database disconnected.");
    }
}
void removeLegacyUserIndexes();
