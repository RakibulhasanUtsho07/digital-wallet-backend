import { v2 as cloudinary } from "cloudinary";

const cloudName =
  process.env.CLOUDINARY_CLOUD_NAME;

const apiKey =
  process.env.CLOUDINARY_API_KEY;

const apiSecret =
  process.env.CLOUDINARY_API_SECRET;

console.log("Cloudinary env check:", {
  cloudName: Boolean(cloudName),
  apiKey: Boolean(apiKey),
  apiSecret: Boolean(apiSecret),
});

if (
  !cloudName ||
  !apiKey ||
  !apiSecret
) {
  throw new Error(
    "Cloudinary environment variables are not configured."
  );
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
});

console.log(
  "✅ Cloudinary configured"
);

export default cloudinary;