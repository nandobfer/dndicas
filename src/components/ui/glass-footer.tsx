"use client";

import React from "react";
import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { cn } from "@/core/utils";
import { APP_VERSION } from "@/lib/config/version";

/**
 * Modern Glass Footer component with discrete design and glassmorphism effects.
 */
export function GlassFooter() {
    return (
        <footer className="w-full py-4 mt-auto border-t border-white/5 bg-black/5 backdrop-blur-sm relative z-10">
            <div className="container mx-auto px-4">
                <div className="flex flex-col items-center justify-center gap-0.5 text-center">
                    {/* Linha 1: Dungeons & Dicas */}
                    <div className="flex items-center justify-center">
                        <span className="font-medium tracking-tight text-white/30 text-[13px] italic">Dungeons & Dicas</span>
                    </div>

                    {/* Linha 2: Desenvolvido por */}
                    <div className="flex items-center gap-1.5 group text-[13px] text-white/40">
                        <span>desenvolvido por</span>
                        <motion.a
                            href="https://nandoburgos.dev"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                                "relative font-semibold text-blue-400/80 transition-all duration-300 flex items-center gap-1",
                                "hover:text-blue-400 hover:drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]",
                                "after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-0 after:h-[1px]",
                                "after:bg-blue-400 after:transition-all after:duration-300 hover:after:w-full"
                            )}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            nandoburgos.dev
                            <ExternalLink className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                        </motion.a>
                    </div>

                    {/* Linha 3: Chip de Versão & Copyright */}
                    <div className="flex items-center justify-center gap-2.5 mt-0.5">
                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 font-mono text-white/40">
                            {APP_VERSION}
                        </span>
                        <div className="text-[11px] font-mono tracking-widest uppercase opacity-20 text-white">
                            &copy; {new Date().getFullYear()}
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}
