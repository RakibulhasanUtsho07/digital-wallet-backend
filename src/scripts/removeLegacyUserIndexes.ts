import "dotenv/config";
import mongoose from "mongoose";

import {
  User,
} from "../models/User.js";

/* =========================================================
   DATABASE URI
========================================================= */

function getMongoUri(): string {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.MONGO_DB_URI;

  if (!uri) {
    throw new Error(
      "MongoDB URI is missing."
    );
  }

  return uri;
}

/* =========================================================
   REMOVE LEGACY USER INDEXES
========================================================= */

async function removeLegacyUserIndexes(): Promise<void> {
  try {
    console.log(
      "Connecting to database..."
    );

    await mongoose.connect(
      getMongoUri()
    );

    console.log(
      "✅ Database connected"
    );

    /* =====================================================
       CURRENT INDEXES
    ====================================================== */

    const indexes =
      await User.collection.indexes();

    console.log(
      "\nCurrent indexes:"
    );

    for (
      const index of indexes
    ) {
      console.log(
        `- ${index.name}`
      );
    }

    /* =====================================================
       DROP OLD EMAIL INDEX
    ====================================================== */

    const emailIndexExists =
      indexes.some(
        (index) =>
          index.name ===
          "email_1"
      );

    if (emailIndexExists) {
      await User.collection.dropIndex(
        "email_1"
      );

      console.log(
        "✅ Removed legacy email_1 index"
      );
    } else {
      console.log(
        "ℹ️ email_1 index does not exist"
      );
    }

    /* =====================================================
       OPTIONAL LEGACY PHONE INDEX
    ====================================================== */

    const phoneIndexExists =
      indexes.some(
        (index) =>
          index.name ===
          "phone_1"
      );

    if (phoneIndexExists) {
      await User.collection.dropIndex(
        "phone_1"
      );

      console.log(
        "✅ Removed legacy phone_1 index"
      );
    } else {
      console.log(
        "ℹ️ phone_1 index does not exist"
      );
    }

    /* =====================================================
       FINAL INDEXES
    ====================================================== */

    const finalIndexes =
      await User.collection.indexes();

    console.log(
      "\nFinal indexes:"
    );

    for (
      const index of finalIndexes
    ) {
      console.log(
        `- ${index.name}`
      );
    }

    console.log(
      "\n✅ Legacy index cleanup completed."
    );
  } catch (error) {
    console.error(
      "INDEX CLEANUP ERROR:",
      error instanceof Error
        ? error.message
        : error
    );

    process.exitCode =
      1;
  } finally {
    await mongoose.disconnect();

    console.log(
      "Database disconnected."
    );
  }
}

void removeLegacyUserIndexes();