"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const settingsController_js_1 = require("../controllers/settingsController.js");
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const router = express_1.default.Router();
/* =========================================================
   USER SETTINGS
========================================================= */
router.get("/", authMiddleware_js_1.protect, settingsController_js_1.getUserSettings);
router.patch("/preferences", authMiddleware_js_1.protect, settingsController_js_1.updateUserPreferences);
router.patch("/profile", authMiddleware_js_1.protect, settingsController_js_1.updateSettingsProfile);
/* =========================================================
   SESSION
========================================================= */
router.get("/session", authMiddleware_js_1.protect, settingsController_js_1.getCurrentSession);
router.post("/logout-all", authMiddleware_js_1.protect, settingsController_js_1.logoutAllDevices);
/* =========================================================
   EXPORT
========================================================= */
router.get("/export", authMiddleware_js_1.protect, settingsController_js_1.exportUserSettings);
/* =========================================================
   ACCOUNT DELETION
========================================================= */
router.delete("/account", authMiddleware_js_1.protect, settingsController_js_1.deleteUserAccount);
exports.default = router;
