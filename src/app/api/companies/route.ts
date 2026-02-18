import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/core/auth';
import dbConnect from '@/core/database/db';
import { logAction } from '@/core/database/audit-log';
import { ApiResponse, PaginatedResponse } from '@/core/types';
import { Company } from '@/features/organizations/models/company';

const CreateCompanySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  cnpj: z.string().regex(/^\d{14}$/, 'CNPJ deve ter 14 dígitos'),
  email: z.string().email('Email inválido'),
  phone: z.string().optional(),
  website: z.string().url('Website inválido').optional(),
  address: z
    .object({
      street: z.string(),
      number: z.string(),
      complement: z.string().optional(),
      neighborhood: z.string(),
      city: z.string(),
      state: z.string(),
      zipCode: z.string(),
    })
    .optional(),
});

/**
 * Lista empresas com paginação
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth();
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    const skip = (page - 1) * limit;

    const query = search
      ? { $text: { $search: search } }
      : {};

    const [companies, total] = await Promise.all([
      Company.find(query).skip(skip).limit(limit).sort({ createdAt: -1 }),
      Company.countDocuments(query),
    ]);

    const response: PaginatedResponse<typeof companies[0]> = {
      success: true,
      data: companies,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error fetching companies:', error);

    const response: ApiResponse = {
      success: false,
      error: error instanceof Error && error.message === 'UNAUTHORIZED'
        ? 'Não autenticado'
        : 'Erro ao buscar empresas',
      code: error instanceof Error && error.message === 'UNAUTHORIZED'
        ? 'UNAUTHORIZED'
        : 'FETCH_ERROR',
    };

    const status = error instanceof Error && error.message === 'UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json(response, { status });
  }
}

/**
 * Cria uma nova empresa
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();
    await dbConnect();

    const body = await request.json();
    const validatedData = CreateCompanySchema.parse(body);

    // Verifica duplicatas
    const existing = await Company.findOne({ cnpj: validatedData.cnpj });
    if (existing) {
      const response: ApiResponse = {
        success: false,
        error: 'CNPJ já cadastrado',
        code: 'DUPLICATE_CNPJ',
      };
      return NextResponse.json(response, { status: 400 });
    }

    const company = await Company.create(validatedData);

    await logAction('CREATE', 'Company', company._id.toString(), userId, {
      name: company.name,
      cnpj: company.cnpj,
    });

    const response: ApiResponse<typeof company> = {
      success: true,
      data: company,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Error creating company:', error);

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
      error: error instanceof Error && error.message === 'UNAUTHORIZED'
        ? 'Não autenticado'
        : 'Erro ao criar empresa',
      code: error instanceof Error && error.message === 'UNAUTHORIZED'
        ? 'UNAUTHORIZED'
        : 'CREATE_ERROR',
    };

    const status = error instanceof Error && error.message === 'UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json(response, { status });
  }
}
