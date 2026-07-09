import { describe, expect, it } from "vitest"
import {
    buildClerkCreateUserPayload,
    CLERK_MIGRATION_REMAP_TARGETS,
    isSupportedPasswordImport,
    parseClerkMigrationCsv,
    sanitizeMigrationUsername,
    toMigrationCsv,
    validateClerkMigrationRows,
    type ClerkMigrationCsvRow,
    type ClerkMigrationLocalUser,
} from "../../scripts/clerk-migration-utils"

const baseRow: ClerkMigrationCsvRow = {
    id: "user_dev_123",
    first_name: "Maria",
    last_name: "Silva",
    username: "maria_silva",
    primary_email_address: "Maria@Example.com",
    primary_phone_number: "",
    verified_email_addresses: "Maria@Example.com",
    unverified_email_addresses: "",
    verified_phone_numbers: "",
    unverified_phone_numbers: "",
    totp_secret: "",
    password_digest: "$2a$10$abcdef",
    password_hasher: "bcrypt",
    created_at: "2026-02-18T12:39:14Z",
}

const localUser: ClerkMigrationLocalUser = {
    id: "65f000000000000000000001",
    clerkId: "user_dev_123",
    email: "maria@example.com",
    username: "maria_silva",
    role: "admin",
    status: "active",
    deleted: false,
}

describe("clerk migration utils", () => {
    it("parses Clerk CSV rows with quoted values", () => {
        const csv = [
            "id,first_name,last_name,username,primary_email_address,primary_phone_number,verified_email_addresses,unverified_email_addresses,verified_phone_numbers,unverified_phone_numbers,totp_secret,password_digest,password_hasher,created_at",
            'user_1,"Maria, Ana",Silva,maria,maria@example.com,,maria@example.com,,,,,$2a$10$abc,bcrypt,2026-02-18T12:39:14Z',
        ].join("\n")

        const rows = parseClerkMigrationCsv(csv)

        expect(rows).toHaveLength(1)
        expect(rows[0].first_name).toBe("Maria, Ana")
        expect(rows[0].primary_email_address).toBe("maria@example.com")
    })

    it("validates duplicate emails and invalid emails", () => {
        const rows = [
            { ...baseRow, primary_email_address: "invalid" },
            { ...baseRow, id: "user_dev_456", primary_email_address: "maria@example.com" },
            { ...baseRow, id: "user_dev_789", primary_email_address: "MARIA@example.com" },
        ]

        const errors = validateClerkMigrationRows(rows)

        expect(errors).toEqual(expect.arrayContaining([
            "Linha 2: email inválido (invalid).",
            "Linha 4: email duplicado (maria@example.com).",
        ]))
    })

    it("builds Clerk payload with bcrypt hash import", () => {
        const payload = buildClerkCreateUserPayload(baseRow, localUser)

        expect(payload).toMatchObject({
            emailAddress: ["maria@example.com"],
            username: "maria_silva",
            firstName: "Maria",
            lastName: "Silva",
            publicMetadata: { role: "admin" },
            passwordDigest: "$2a$10$abcdef",
            passwordHasher: "bcrypt",
            skipPasswordChecks: true,
        })
        expect(payload.skipPasswordRequirement).toBeUndefined()
    })

    it("builds Clerk payload without password import when hash is missing", () => {
        const row = { ...baseRow, password_digest: "", password_hasher: "" }

        const payload = buildClerkCreateUserPayload(row, localUser)

        expect(isSupportedPasswordImport(row)).toBe(false)
        expect(payload.passwordDigest).toBeUndefined()
        expect(payload.skipPasswordRequirement).toBe(true)
    })

    it("sanitizes invalid usernames and drops too short usernames", () => {
        expect(sanitizeMigrationUsername("joao-cleber !")).toBe("joao_cleber__")
        expect(sanitizeMigrationUsername("ab")).toBeUndefined()
    })

    it("includes all ownership targets, including historical logs", () => {
        expect(CLERK_MIGRATION_REMAP_TARGETS.map((target) => target.label)).toEqual(expect.arrayContaining([
            "users.clerkId",
            "characterSheets.userId",
            "feedback.createdBy",
            "auditLogs.userId",
            "auditLogs.performedBy",
            "usageLogs.userId",
        ]))
    })

    it("serializes migration map as CSV", () => {
        const csv = toMigrationCsv([
            {
                email: "maria@example.com",
                oldClerkId: "user_dev_123",
                newClerkId: "user_prod_123",
                localUserId: "65f000000000000000000001",
                role: "admin",
                status: "active",
                action: "created",
                needsAccessSetup: false,
                message: "Criado, com sucesso",
            },
        ])

        expect(csv).toContain("email,oldClerkId,newClerkId,localUserId,role,status,action,needsAccessSetup,message")
        expect(csv).toContain('created,false,"Criado, com sucesso"')
    })
})
