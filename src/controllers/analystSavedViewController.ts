import type { Response } from "express";
import type { AuthRequest } from "../middlewares/authMiddleware.js";
import { createAnalystSavedView, deleteAnalystSavedView, listAnalystSavedViews, updateAnalystSavedView } from "../services/analystSavedViewService.js";

const uid = (req: AuthRequest) => req.user?._id ?? null;
const item = (v: any) => ({ id: String(v._id), name: v.name, route: v.route, filters: v.filters ?? {}, isDefault: Boolean(v.isDefault), createdAt: v.createdAt, updatedAt: v.updatedAt });

export async function listAnalystSavedViewsController(req: AuthRequest, res: Response): Promise<void> {
  const userId = uid(req); if (!userId) { res.status(401).json({ success: false, message: "Authentication is required." }); return; }
  const views = await listAnalystSavedViews(userId);
  res.status(200).json({ success: true, views: views.map(item) });
}
export async function createAnalystSavedViewController(req: AuthRequest, res: Response): Promise<void> {
  const userId = uid(req); if (!userId) { res.status(401).json({ success: false, message: "Authentication is required." }); return; }
  try {
    const view = await createAnalystSavedView({ userId, name: req.body?.name, route: req.body?.route, filters: req.body?.filters, isDefault: req.body?.isDefault });
    res.status(201).json({ success: true, view: item(view) });
  } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to save analyst view." }); }
}
export async function updateAnalystSavedViewController(req: AuthRequest, res: Response): Promise<void> {
  const userId = uid(req); if (!userId) { res.status(401).json({ success: false, message: "Authentication is required." }); return; }
  try {
    const view = await updateAnalystSavedView({ userId, id: String(req.params.id ?? ""), name: req.body?.name, route: req.body?.route, filters: req.body?.filters, isDefault: req.body?.isDefault });
    if (!view) { res.status(404).json({ success: false, message: "Saved view not found." }); return; }
    res.status(200).json({ success: true, view: item(view) });
  } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to update saved view." }); }
}
export async function deleteAnalystSavedViewController(req: AuthRequest, res: Response): Promise<void> {
  const userId = uid(req); if (!userId) { res.status(401).json({ success: false, message: "Authentication is required." }); return; }
  const deleted = await deleteAnalystSavedView({ userId, id: String(req.params.id ?? "") });
  if (!deleted) { res.status(404).json({ success: false, message: "Saved view not found." }); return; }
  res.status(200).json({ success: true, message: "Saved view deleted." });
}
