import { currentUser } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { PUSHER_ORIGIN_HEADER } from "@/core/realtime/pusher-origin"
import {
    CreateAttackSchema,
    CreateFeatSchema,
    CreateItemSchema,
    CreateSpellSchema,
    CreateTraitSchema,
    PatchAttackSchema,
    PatchItemSchema,
    PatchSheetSchema,
    PatchSpellSchema,
    type PatchSheetBody,
} from "@/features/character-sheets/types/character-sheet.types"
import {
    applyLongRestWithAccess,
    createAttack,
    createBlankSheet,
    createFeat,
    createItem,
    createSpell,
    createTrait,
    deleteAttack,
    deleteFeat,
    deleteItem,
    deleteSpell,
    deleteTrait,
    getAllUserSheets,
    getAttacks,
    getFeats,
    getItems,
    getSheetById,
    getSpells,
    getTraits,
    patchSheetWithAccess,
    updateAttack,
    updateItem,
    updateSpell,
} from "@/features/character-sheets/api/character-sheets-service"
import { owlbearErrorResponse, requireOwlbearSession, requireOwlbearSheetAccess } from "./auth"

export async function getOwlbearSheets(req: NextRequest) {
    try {
        const session = await requireOwlbearSession(req)
        const url = new URL(req.url)
        const search = url.searchParams.get("search") ?? undefined
        const page = parseInt(url.searchParams.get("page") ?? "1", 10)
        const limit = parseInt(url.searchParams.get("limit") ?? "12", 10)

        const result = await getAllUserSheets(session.userId, search, page, limit)
        return NextResponse.json(result)
    } catch (error) {
        return owlbearErrorResponse(error, "[API] GET /api/owlbear/character-sheets error:")
    }
}

export async function postOwlbearSheet(req: NextRequest) {
    try {
        const session = await requireOwlbearSession(req)
        const user = await currentUser()
        const username = user?.username || user?.firstName?.toLowerCase() || session.userId

        let name: string | undefined
        try {
            const body = await req.json()
            if (typeof body?.name === "string" && body.name.trim()) name = body.name.trim()
        } catch {
            // Ignore empty body.
        }

        const sheet = await createBlankSheet(session.userId, username, name)
        return NextResponse.json(sheet, { status: 201 })
    } catch (error) {
        return owlbearErrorResponse(error, "[API] POST /api/owlbear/character-sheets error:")
    }
}

export async function getOwlbearSheet(req: NextRequest, id: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        const sheet = await getSheetById(id)
        if (!sheet) return NextResponse.json({ error: "Ficha não encontrada" }, { status: 404 })
        return NextResponse.json(sheet)
    } catch (error) {
        return owlbearErrorResponse(error, "[API] GET /api/owlbear/character-sheets/[id] error:")
    }
}

export async function patchOwlbearSheet(req: NextRequest, id: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        const body = await req.json()
        const parsed = PatchSheetSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        const originId = req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        const sheet = await patchSheetWithAccess(id, parsed.data as PatchSheetBody, originId)
        if (!sheet) return NextResponse.json({ error: "Ficha não encontrada" }, { status: 404 })
        return NextResponse.json(sheet)
    } catch (error) {
        return owlbearErrorResponse(error, "[API] PATCH /api/owlbear/character-sheets/[id] error:")
    }
}

export async function postOwlbearLongRest(req: NextRequest, id: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        const originId = req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        const sheet = await applyLongRestWithAccess(id, originId)
        if (!sheet) return NextResponse.json({ error: "Ficha não encontrada" }, { status: 404 })
        return NextResponse.json(sheet)
    } catch (error) {
        return owlbearErrorResponse(error, "[API] POST /api/owlbear/character-sheets/[id]/long-rest error:")
    }
}

export async function getOwlbearItems(req: NextRequest, id: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        return NextResponse.json(await getItems(id))
    } catch (error) {
        return owlbearErrorResponse(error, "[API] GET /api/owlbear/character-sheets/[id]/items error:")
    }
}

export async function postOwlbearItems(req: NextRequest, id: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        const body = await req.json()
        const parsed = CreateItemSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        const originId = req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        return NextResponse.json(await createItem(id, parsed.data, originId), { status: 201 })
    } catch (error) {
        return owlbearErrorResponse(error, "[API] POST /api/owlbear/character-sheets/[id]/items error:")
    }
}

export async function patchOwlbearItem(req: NextRequest, id: string, itemId: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        const body = await req.json()
        const parsed = PatchItemSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        const originId = req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        const item = await updateItem(id, itemId, parsed.data, originId)
        if (!item) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 })
        return NextResponse.json(item)
    } catch (error) {
        return owlbearErrorResponse(error, "[API] PATCH /api/owlbear/character-sheets/[id]/items/[itemId] error:")
    }
}

export async function deleteOwlbearItem(req: NextRequest, id: string, itemId: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        const originId = req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        const ok = await deleteItem(id, itemId, originId)
        if (!ok) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 })
        return NextResponse.json({ success: true })
    } catch (error) {
        return owlbearErrorResponse(error, "[API] DELETE /api/owlbear/character-sheets/[id]/items/[itemId] error:")
    }
}

export async function getOwlbearSpells(req: NextRequest, id: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        return NextResponse.json(await getSpells(id))
    } catch (error) {
        return owlbearErrorResponse(error, "[API] GET /api/owlbear/character-sheets/[id]/spells error:")
    }
}

export async function postOwlbearSpells(req: NextRequest, id: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        const body = await req.json()
        const parsed = CreateSpellSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        const originId = req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        return NextResponse.json(await createSpell(id, parsed.data, originId), { status: 201 })
    } catch (error) {
        return owlbearErrorResponse(error, "[API] POST /api/owlbear/character-sheets/[id]/spells error:")
    }
}

export async function patchOwlbearSpell(req: NextRequest, id: string, spellId: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        const body = await req.json()
        const parsed = PatchSpellSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        const originId = req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        const spell = await updateSpell(id, spellId, parsed.data, originId)
        if (!spell) return NextResponse.json({ error: "Magia não encontrada" }, { status: 404 })
        return NextResponse.json(spell)
    } catch (error) {
        return owlbearErrorResponse(error, "[API] PATCH /api/owlbear/character-sheets/[id]/spells/[spellId] error:")
    }
}

export async function deleteOwlbearSpell(req: NextRequest, id: string, spellId: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        const originId = req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        const ok = await deleteSpell(id, spellId, originId)
        if (!ok) return NextResponse.json({ error: "Magia não encontrada" }, { status: 404 })
        return NextResponse.json({ success: true })
    } catch (error) {
        return owlbearErrorResponse(error, "[API] DELETE /api/owlbear/character-sheets/[id]/spells/[spellId] error:")
    }
}

export async function getOwlbearTraits(req: NextRequest, id: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        return NextResponse.json(await getTraits(id))
    } catch (error) {
        return owlbearErrorResponse(error, "[API] GET /api/owlbear/character-sheets/[id]/traits error:")
    }
}

export async function postOwlbearTraits(req: NextRequest, id: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        const body = await req.json()
        const parsed = CreateTraitSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        const originId = req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        return NextResponse.json(await createTrait(id, parsed.data, originId), { status: 201 })
    } catch (error) {
        return owlbearErrorResponse(error, "[API] POST /api/owlbear/character-sheets/[id]/traits error:")
    }
}

export async function deleteOwlbearTrait(req: NextRequest, id: string, traitId: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        const originId = req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        const ok = await deleteTrait(id, traitId, originId)
        if (!ok) return NextResponse.json({ error: "Traço não encontrado" }, { status: 404 })
        return NextResponse.json({ success: true })
    } catch (error) {
        return owlbearErrorResponse(error, "[API] DELETE /api/owlbear/character-sheets/[id]/traits/[traitId] error:")
    }
}

export async function getOwlbearFeats(req: NextRequest, id: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        return NextResponse.json(await getFeats(id))
    } catch (error) {
        return owlbearErrorResponse(error, "[API] GET /api/owlbear/character-sheets/[id]/feats error:")
    }
}

export async function postOwlbearFeats(req: NextRequest, id: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        const body = await req.json()
        const parsed = CreateFeatSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        const originId = req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        return NextResponse.json(await createFeat(id, parsed.data, originId), { status: 201 })
    } catch (error) {
        return owlbearErrorResponse(error, "[API] POST /api/owlbear/character-sheets/[id]/feats error:")
    }
}

export async function deleteOwlbearFeat(req: NextRequest, id: string, featId: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        const originId = req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        const ok = await deleteFeat(id, featId, originId)
        if (!ok) return NextResponse.json({ error: "Talento não encontrado" }, { status: 404 })
        return NextResponse.json({ success: true })
    } catch (error) {
        return owlbearErrorResponse(error, "[API] DELETE /api/owlbear/character-sheets/[id]/feats/[featId] error:")
    }
}

export async function getOwlbearAttacks(req: NextRequest, id: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        return NextResponse.json(await getAttacks(id))
    } catch (error) {
        return owlbearErrorResponse(error, "[API] GET /api/owlbear/character-sheets/[id]/attacks error:")
    }
}

export async function postOwlbearAttacks(req: NextRequest, id: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        const body = await req.json()
        const parsed = CreateAttackSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        const originId = req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        return NextResponse.json(await createAttack(id, parsed.data, originId), { status: 201 })
    } catch (error) {
        return owlbearErrorResponse(error, "[API] POST /api/owlbear/character-sheets/[id]/attacks error:")
    }
}

export async function patchOwlbearAttack(req: NextRequest, id: string, attackId: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        const body = await req.json()
        const parsed = PatchAttackSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        const originId = req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        const attack = await updateAttack(id, attackId, parsed.data, originId)
        if (!attack) return NextResponse.json({ error: "Ataque não encontrado" }, { status: 404 })
        return NextResponse.json(attack)
    } catch (error) {
        return owlbearErrorResponse(error, "[API] PATCH /api/owlbear/character-sheets/[id]/attacks/[attackId] error:")
    }
}

export async function deleteOwlbearAttack(req: NextRequest, id: string, attackId: string) {
    try {
        await requireOwlbearSheetAccess(req, id)
        const originId = req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        const ok = await deleteAttack(id, attackId, originId)
        if (!ok) return NextResponse.json({ error: "Ataque não encontrado" }, { status: 404 })
        return NextResponse.json({ success: true })
    } catch (error) {
        return owlbearErrorResponse(error, "[API] DELETE /api/owlbear/character-sheets/[id]/attacks/[attackId] error:")
    }
}
