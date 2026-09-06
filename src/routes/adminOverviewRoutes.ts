import { Router } from "express";
import { adminOverview, exportAdminOverview } from "../controllers/adminOverviewController.js";
import { requireAdministrator, requireAuthentication } from "../middlewares/adminOverviewGuards.js";

const router = Router();

router.use(requireAuthentication, requireAdministrator);
router.get("/export", exportAdminOverview);
router.get("/", adminOverview);

export default router;

