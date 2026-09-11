"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const platformSettingsController_js_1 = require("../controllers/platformSettingsController.js");
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const adminAuthorization_js_1 = require("../middlewares/adminAuthorization.js");
const platformSettingsSecurity_js_1 = require("../middlewares/platformSettingsSecurity.js");
const router = express_1.default.Router();
/*
 * Every endpoint below is authenticated + admin-only.
 */
router.use(authMiddleware_js_1.protect, adminAuthorization_js_1.requireAdmin, platformSettingsSecurity_js_1.noStoreAdminResponse);
/* =========================================================
   READ
========================================================= */
router.get("/", platformSettingsSecurity_js_1.adminSettingsReadLimiter, platformSettingsController_js_1.getPlatformSettings);
router.get("/audit", platformSettingsSecurity_js_1.adminSettingsReadLimiter, platformSettingsController_js_1.getPlatformSettingsAudit);
router.get("/audit/verify", platformSettingsSecurity_js_1.adminSettingsReadLimiter, platformSettingsController_js_1.verifyPlatformSettingsAudit);
/* =========================================================
   PRIVILEGED MUTATIONS

   Additional protections:
   - trusted browser origin
   - JSON-only request
   - dedicated write rate limit
   - current admin password in controller
========================================================= */
router.patch("/", platformSettingsSecurity_js_1.requireTrustedAdminOrigin, platformSettingsSecurity_js_1.requireJsonMutation, platformSettingsSecurity_js_1.adminSettingsWriteLimiter, platformSettingsController_js_1.updatePlatformSettings);
router.post("/reset", platformSettingsSecurity_js_1.requireTrustedAdminOrigin, platformSettingsSecurity_js_1.requireJsonMutation, platformSettingsSecurity_js_1.adminSettingsWriteLimiter, platformSettingsController_js_1.resetPlatformSettings);
exports.default = router;
