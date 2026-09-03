import { Router } from "express";
import {
  bulkUpdateUsers,
  changeUserKyc,
  changeUserRole,
  changeUserWallet,
  createUser,
  deleteUser,
  exportUsers,
  getUser,
  listUserActivity,
  listUserTransactions,
  listUsers,
  suspendUser,
  updateUser,
  userStats,
} from "../controllers/userManagementController";
import { requireAdministrator, requireAuthentication } from "../middlewares/userManagementGuards";


const userManagementRoutes = Router();

userManagementRoutes.use(requireAuthentication!, requireAdministrator!);

userManagementRoutes.get("/stats", userStats);
userManagementRoutes.get("/export", exportUsers);
userManagementRoutes.patch("/bulk", bulkUpdateUsers);
userManagementRoutes.get("/", listUsers);
userManagementRoutes.post("/", createUser);
userManagementRoutes.get("/:id", getUser);
userManagementRoutes.patch("/:id", updateUser);
userManagementRoutes.delete("/:id", deleteUser);
userManagementRoutes.post("/:id/suspend", suspendUser);
userManagementRoutes.patch("/:id/role", changeUserRole);
userManagementRoutes.patch("/:id/kyc", changeUserKyc);
userManagementRoutes.patch("/:id/wallet", changeUserWallet);
userManagementRoutes.get("/:id/transactions", listUserTransactions);
userManagementRoutes.get("/:id/activity", listUserActivity);

export default userManagementRoutes;
