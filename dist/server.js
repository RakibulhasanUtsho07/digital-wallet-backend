"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_js_1 = __importDefault(require("./app.js"));
const db_js_1 = __importDefault(require("./config/db.js"));
const paymentSourceSeed_js_1 = require("./seed/paymentSourceSeed.js");
const PORT = Number(process.env.PORT) || 5000;
async function startServer() {
    try {
        /* =====================================================
           DATABASE
        ====================================================== */
        await (0, db_js_1.default)();
        console.log("✅ MongoDB connected successfully.");
        /* =====================================================
           DEMO PAYMENT SOURCES
           
           Creates/updates fake bKash, Nagad, Rocket,
           upay and bank accounts in PaymentSource.
           
           Because the seed uses upsert:true, restarting
           the server will NOT create duplicate records.
        ====================================================== */
        await (0, paymentSourceSeed_js_1.seedPaymentSources)();
        /* =====================================================
           START SERVER
        ====================================================== */
        app_js_1.default.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`🌐 http://localhost:${PORT}`);
        });
    }
    catch (error) {
        console.error("❌ Server startup failed:", error);
        process.exit(1);
    }
}
void startServer();
