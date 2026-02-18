import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/core/auth';
import dbConnect from '@/core/database/db';
import { logAction } from '@/core/database/audit-log';
import { ApiResponse } from '@/core/types';
import { Company } from '@/features/organizations/models/company';

const UpdateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  address: z.object({
    street: z.string(),
    number: z.string(),
    complement: z.string().optional(),
    neighborhood: z.string(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
  }).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    await dbConnect();

    const { id } = await params;
    const company = await Company.findById(id);

    if (!company) {
      const response: ApiResponse = {
        success: false,
        error: 'Empresa não encontrada',
        code: 'NOT_FOUND',
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiResponse<typeof company> = {
      success: true,
      data: company,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: 'Erro ao buscar empresa',
      code: 'FETCH_ERROR',
    };
    return NextResponse.json(response, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    await dbConnect();

    const { id } = await params;
    const body = await request.json();
    const validatedData = UpdateCompanySchema.parse(body);

    const company = await Company.findByIdAndUpdate(
      id,
      validatedData,
      { new: true }
    );

    if (!company) {
      const response: ApiResponse = {
        success: false,
        error: 'Empresa não encontrada',
        code: 'NOT_FOUND',
      };
      return NextResponse.json(response, { status: 404 });
    }

    await logAction('UPDATE', 'Company', company._id.toString(), userId);

    const response: ApiResponse<typeof company> = {
      success: true,
      data: company,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const response: ApiResponse = {
        success: false,
        error: 'Dados inválidos',
        code: 'VALIDATION_ERROR',
        details: error.issues,
      };
      return NextResponse.json(response, { status: 400 });
    }

    const response: ApiResponse = {
      success: false,
      error: 'Erro ao atualizar empresa',
      code: 'UPDATE_ERROR',
    };
    return NextResponse.json(response, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    await dbConnect();

    const { id } = await params;
    const company = await Company.findByIdAndDelete(id);

    if (!company) {
      const response: ApiResponse = {
        success: false,
        error: 'Empresa não encontrada',
        code: 'NOT_FOUND',
      };
      return NextResponse.json(response, { status: 404 });
    }

    await logAction('DELETE', 'Company', company._id.toString(), userId);

    const response: ApiResponse = {
      success: true,
      data: { message: 'Empresa excluída com sucesso' },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: 'Erro ao excluir empresa',
      code: 'DELETE_ERROR',
    };
    return NextResponse.json(response, { status: 500 });
  }
}
