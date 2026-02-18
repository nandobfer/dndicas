import mongoose, { Schema, Document } from 'mongoose';

export interface IClient extends Document {
  companyId: string;
  branchId?: string;
  name: string;
  document: string; // CPF ou CNPJ
  documentType: 'cpf' | 'cnpj';
  email: string;
  phone: string;
  mobile?: string;
  address?: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  };
  notes?: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const ClientSchema = new Schema<IClient>(
  {
    companyId: {
      type: String,
      required: true,
      ref: 'Company',
    },
    branchId: {
      type: String,
      ref: 'Branch',
    },
    name: { type: String, required: true },
    document: { type: String, required: true },
    documentType: {
      type: String,
      enum: ['cpf', 'cnpj'],
      required: true,
    },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    mobile: { type: String },
    address: {
      street: { type: String },
      number: { type: String },
      complement: { type: String },
      neighborhood: { type: String },
      city: { type: String },
      state: { type: String },
      zipCode: { type: String },
    },
    notes: { type: String },
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
ClientSchema.index({ name: 'text', document: 'text' });
ClientSchema.index({ companyId: 1 });
ClientSchema.index({ branchId: 1 });
ClientSchema.index({ document: 1 }, { unique: true });

export const Client = mongoose.models.Client || mongoose.model<IClient>('Client', ClientSchema);
