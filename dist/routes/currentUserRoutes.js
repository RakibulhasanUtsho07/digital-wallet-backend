"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const currentUserController_1 = require("../controllers/currentUserController");
const userManagementGuards_1 = require("../middlewares/userManagementGuards");
const currentUserRoutes = (0, express_1.Router)();
currentUserRoutes.get("/me", userManagementGuards_1.requireAuthentication, currentUserController_1.getCurrentUser);
exports.default = currentUserRoutes;
