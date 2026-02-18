import mongoose, { Schema, Document } from 'mongoose';

export interface ICompany extends Document {
  name: string;
  cnpj: string;
  email: string;
  phone?: string;
  website?: string;
  address?: {
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

const CompanySchema = new Schema<ICompany>(
  {
    name: { type: String, required: true },
    cnpj: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    phone: { type: String },
    website: { type: String },
    address: {
      street: { type: String },
      number: { type: String },
      complement: { type: String },
      neighborhood: { type: String },
      city: { type: String },
      state: { type: String },
      zipCode: { type: String },
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
CompanySchema.index({ name: 'text' });

export const Company = mongoose.models.Company || mongoose.model<ICompany>('Company', CompanySchema);
