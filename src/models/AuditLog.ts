import mongoose, { Schema, Document } from "mongoose";

export interface IAuditLog extends Document {
  actor: mongoose.Types.ObjectId; // User or Admin ID who performed the action
  action: string; // e.g., "TRANSFER_FUNDS", "LOGIN", "KYC_APPROVED"
  resource?: string; // e.g., "Transaction ID", "KYC ID"
  metadata?: any; // Additional context
  ipAddress?: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true },
    resource: { type: String },
    metadata: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } } // Audit logs should only have createdAt
);

export const AuditLog = mongoose.model<IAuditLog>("AuditLog", auditLogSchema);
export default AuditLog;