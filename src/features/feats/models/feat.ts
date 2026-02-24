/**
 * @fileoverview Feat Mongoose model for MongoDB persistence.
 * Represents D&D 5e feats with level-based prerequisites and rich descriptions.
 *
 * @see specs/003-feats-catalog/data-model.md
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Feat document interface extending Mongoose Document.
 */
export interface IFeat extends Document {
  _id: mongoose.Types.ObjectId;
  /** Unique feat name (3-100 chars) */
  name: string;
  /** Rich HTML content with mentions support (10-50000 chars) */
  description: string;
  /** Source reference (e.g., "PHB pg. 168") */
  source: string;
  /** Minimum character level required (1-20) */
  level: number;
  /** Array of prerequisite strings (can be empty) */
  prerequisites: string[];
  /** Feat visibility status */
  status: 'active' | 'inactive';
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
}

const FeatSchema = new Schema<IFeat>(
  {
    name: {
      type: String,
      required: [true, 'Nome é obrigatório'],
      unique: true,
      minlength: [3, 'Nome deve ter no mínimo 3 caracteres'],
      maxlength: [100, 'Nome deve ter no máximo 100 caracteres'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Descrição é obrigatória'],
      minlength: [10, 'Descrição deve ter no mínimo 10 caracteres'],
      maxlength: [50000, 'Descrição deve ter no máximo 50.000 caracteres'],
    },
    source: {
      type: String,
      required: [true, 'Fonte é obrigatória'],
      minlength: [1, 'Fonte deve ter no mínimo 1 caractere'],
      maxlength: [200, 'Fonte deve ter no máximo 200 caracteres'],
      trim: true,
    },
    level: {
      type: Number,
      required: true,
      default: 1,
      min: [1, 'Nível mínimo é 1'],
      max: [20, 'Nível máximo é 20'],
      validate: {
        validator: Number.isInteger,
        message: 'Nível deve ser um número inteiro',
      },
    },
    prerequisites: {
      type: [String],
      default: [],
      validate: {
        validator: function (arr: string[]) {
          return arr.every((item) => item.trim().length > 0);
        },
        message: 'Pré-requisitos não podem ser strings vazias',
      },
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive'],
        message: "Status deve ser 'active' ou 'inactive'",
      },
      default: 'active',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_, ret) => {
        return {
          ...ret,
          id: String(ret._id),
        };
      },
    },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
FeatSchema.index({ name: 'text', description: 'text' }); // Full-text search
FeatSchema.index({ status: 1 }); // Filter by status
FeatSchema.index({ level: 1 }); // Filter/sort by level
FeatSchema.index({ createdAt: -1 }); // Sort by creation date

export const Feat: Model<IFeat> =
  mongoose.models.Feat || mongoose.model<IFeat>('Feat', FeatSchema);
