"use client"

import { motion } from "framer-motion"

export function LiquidGlassBackground() {
    return (
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-background">
            {/* Animated Light Beams (Feixes de Luz) */}
            <div className="absolute inset-0 z-10 opacity-100">
                {/* Blue Beam */}
                <motion.div
                    className="absolute top-[-50%] left-[0%] w-[150px] md:w-[300px] h-[200%] bg-blue-500/15 blur-[80px] md:blur-[120px]"
                    style={{ rotate: "35deg" }}
                    animate={{
                        x: ["-100%", "200%", "-100%"],
                    }}
                    transition={{
                        duration: 25,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                />

                {/* Purple Beam */}
                <motion.div
                    className="absolute top-[-50%] left-[20%] w-[200px] md:w-[400px] h-[200%] bg-purple-600/10 blur-[100px] md:blur-[150px]"
                    style={{ rotate: "35deg" }}
                    animate={{
                        x: ["-100%", "200%", "-100%"],
                    }}
                    transition={{
                        duration: 35,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 2,
                    }}
                />

                {/* Counter Beam */}
                <motion.div
                    className="absolute top-[-50%] right-[0%] w-[100px] md:w-[250px] h-[200%] bg-blue-400/10 blur-[60px] md:blur-[100px]"
                    style={{ rotate: "35deg" }}
                    animate={{
                        x: ["100%", "-200%", "100%"],
                    }}
                    transition={{
                        duration: 30,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 5,
                    }}
                />
            </div>

            {/* Glassmorphism Overlay */}
            <div className="absolute inset-0 bg-background/30 backdrop-blur-[60px] md:backdrop-blur-[100px] z-20" />
            
            {/* Subtle Gradient for depth */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 z-30" />
        </div>
    )
}
