import mongoose, { Schema, Document } from 'mongoose';

export interface IBranch extends Document {
  companyId: string;
  name: string;
  code: string;
  email: string;
  phone?: string;
  address: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  };
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const BranchSchema = new Schema<IBranch>(
  {
    companyId: {
      type: String,
      required: true,
      ref: 'Company',
    },
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    phone: { type: String },
    address: {
      street: { type: String, required: true },
      number: { type: String, required: true },
      complement: { type: String },
      neighborhood: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zipCode: { type: String, required: true },
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

// Index para busca
BranchSchema.index({ name: 'text', code: 'text' });
BranchSchema.index({ companyId: 1 });

export const Branch = mongoose.models.Branch || mongoose.model<IBranch>('Branch', BranchSchema);
