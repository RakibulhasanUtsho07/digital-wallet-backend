import { Router } from "express";
import {
  createMerchantOrderController,
  getMerchantApiOrderController,
} from "../controllers/merchantOrderController.js";
import { merchantApiAuth } from "../middlewares/merchantAuth.js";

const router = Router();

router.post("/", merchantApiAuth("orders:write"), createMerchantOrderController);
router.get("/:orderId", merchantApiAuth("orders:read"), getMerchantApiOrderController);

export default router;
