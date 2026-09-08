import "dotenv/config";

import app from "./app.js";
import connectDB from "./config/db.js";
import { seedPaymentSources } from "./seed/paymentSourceSeed.js";



const PORT =
  Number(process.env.PORT) || 5000;

async function startServer(): Promise<void> {
  try {
    /* =====================================================
       DATABASE
    ====================================================== */

    await connectDB();

    console.log(
      "✅ MongoDB connected successfully."
    );

    /* =====================================================
       DEMO PAYMENT SOURCES
       
       Creates/updates fake bKash, Nagad, Rocket,
       upay and bank accounts in PaymentSource.
       
       Because the seed uses upsert:true, restarting
       the server will NOT create duplicate records.
    ====================================================== */

    await seedPaymentSources();

    /* =====================================================
       START SERVER
    ====================================================== */

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
      "❌ Server startup failed:",
      error
    );

    process.exit(1);
  }
}

void startServer();