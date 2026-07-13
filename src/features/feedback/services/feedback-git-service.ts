import { execFile } from "node:child_process"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const WORKTREES_ROOT = process.env.FEEDBACK_WORKTREES_ROOT ?? "/home/burgos/dndicas/worktrees"
const REPOSITORY_ROOT = process.env.FEEDBACK_REPOSITORY_ROOT ?? process.cwd()

function slugify(value: string) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "feedback"
}

export function getFeedbackBranchName(input: { feedbackId: string; title: string }) {
    return `agent/feedback-${input.feedbackId}-${slugify(input.title)}`
}

export function getFeedbackWorktreePath(input: { feedbackId: string; title: string }) {
    return path.join(WORKTREES_ROOT, `feedback-${input.feedbackId}-${slugify(input.title)}`)
}

export async function ensureFeedbackWorktree(input: { feedbackId: string; title: string }) {
    const branchName = getFeedbackBranchName(input)
    const worktreePath = getFeedbackWorktreePath(input)

    await mkdir(WORKTREES_ROOT, { recursive: true })
    await execFileAsync("git", ["fetch", "origin", "main"], { cwd: REPOSITORY_ROOT })

    try {
        await execFileAsync("git", ["worktree", "add", worktreePath, "-b", branchName, "origin/main"], { cwd: REPOSITORY_ROOT })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes("already exists") && !message.includes("is already checked out")) throw error
    }

    return { branchName, worktreePath }
}

export async function hasWorktreeChanges(worktreePath: string) {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd: worktreePath })
    return stdout.trim().length > 0
}

export async function getWorktreeStatusSnapshot(worktreePath: string) {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd: worktreePath })
    return stdout.trim()
}

export async function commitAllChanges(input: { worktreePath: string; message: string }) {
    await execFileAsync("git", ["add", "-A"], { cwd: input.worktreePath })
    await execFileAsync("git", ["commit", "-m", input.message], { cwd: input.worktreePath })
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: input.worktreePath })
    return stdout.trim()
}

export async function pushBranch(input: { worktreePath: string; branchName: string }) {
    await execFileAsync("git", ["push", "-u", "origin", input.branchName], { cwd: input.worktreePath })
}

export async function removeWorktree(worktreePath: string) {
    await execFileAsync("git", ["worktree", "remove", worktreePath, "--force"], { cwd: REPOSITORY_ROOT })
}
