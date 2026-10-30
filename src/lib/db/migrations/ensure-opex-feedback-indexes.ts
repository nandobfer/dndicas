import { OpexFeedbackUserModel } from "@/features/opex-feedback/api/opex-feedback-user.model"

/** Additive only: do not sync/drop existing indexes or historical feedback collections. */
export async function ensureOpexFeedbackIndexes() {
    await OpexFeedbackUserModel.createIndexes()
}
