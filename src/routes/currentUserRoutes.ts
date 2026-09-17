import { Router } from "express";
import { getCurrentUser } from "../controllers/currentUserController";
import { requireAuthentication } from "../middlewares/userManagementGuards";


const currentUserRoutes = Router();

currentUserRoutes.get("/me", requireAuthentication!, getCurrentUser);

export default currentUserRoutes;

