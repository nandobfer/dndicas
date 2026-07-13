import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export async function createPullRequest(input: { cwd: string; branchName: string; title: string; body: string }) {
    const { stdout } = await execFileAsync("gh", ["pr", "create", "--base", "main", "--head", input.branchName, "--title", input.title, "--body", input.body], { cwd: input.cwd })
    const url = stdout.trim().split(/\s+/).find((part) => part.startsWith("http")) ?? stdout.trim()
    const numberMatch = url.match(/\/(\d+)$/)

    return {
        url,
        number: numberMatch ? Number(numberMatch[1]) : undefined,
    }
}

export async function mergePullRequest(input: { cwd: string; pullRequestNumber: number }) {
    await execFileAsync("gh", ["pr", "merge", String(input.pullRequestNumber), "--merge", "--delete-branch"], { cwd: input.cwd })
}
