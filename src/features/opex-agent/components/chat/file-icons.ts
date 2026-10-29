import { File, FileAudio, FileCode, FileImage, FileText, FileVideo, type LucideIcon } from "lucide-react"
import type { OpexFileKind } from "../../files"

export const OPEX_FILE_ICONS: Record<OpexFileKind, LucideIcon> = {
    image: FileImage,
    pdf: FileText,
    text: FileCode,
    audio: FileAudio,
    video: FileVideo,
    other: File,
}
