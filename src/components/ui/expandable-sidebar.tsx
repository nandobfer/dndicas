"use client";

/**
 * @fileoverview ExpandableSidebar component with Liquid Glass styling.
 * Animated expand/collapse with smooth transitions under 400ms (SC-002).
 *
 * @example
 * ```tsx
 * <ExpandableSidebar isExpanded={isExpanded} onToggle={toggle}>
 *   <SidebarItem ... />
 * </ExpandableSidebar>
 * ```
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Package2, Home, User, Sparkles, Upload, Mail, Palette, FileText, Users, Scroll } from "lucide-react"
import { cn } from '@/core/utils';
import { glassConfig } from '@/lib/config/glass-config';
import { motionConfig } from "@/lib/config/motion-configs"
import { themeConfig } from '@/lib/config/theme-config';
import { SidebarItem, SidebarSection } from './sidebar-item';
import { TooltipProvider } from '@/core/ui/tooltip';
import { UserButton } from '@clerk/nextjs';
import { APP_VERSION } from '@/lib/config/version';

export interface ExpandableSidebarProps {
  /** Whether sidebar is expanded */
  isExpanded: boolean;
  /** Expand callback */
  onExpand: () => void;
  /** Collapse callback */
  onCollapse: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Navigation items configuration.
 * Updated per T020: renamed "Módulos" to "Cadastros", removed "Empresas", added "Usuários".
 */
const mainItems = [
  { label: 'Início', href: '/', icon: Home },
  { label: 'Perfil', href: '/profile', icon: User },
];

// T020: Renamed from "Módulos" to "Cadastros", removed "Empresas", added "Usuários"
// T032: Added "Habilidades" for traits catalog
const cadastrosItems = [
    { label: "Usuários", href: "/users", icon: Users },
    { label: "Regras", href: "/rules", icon: Scroll },
    { label: "Habilidades", href: "/traits", icon: Sparkles }
]

const adminItems = [{ label: "Logs", href: "/audit-logs", icon: FileText }]

/**
 * Expandable sidebar component with Liquid Glass styling and smooth animations.
 * Sidebar width: 280px expanded, 72px collapsed (per themeConfig.spacing.sidebar).
 */
export const ExpandableSidebar: React.FC<ExpandableSidebarProps> = ({
  isExpanded,
  onExpand,
  onCollapse,
  className,
}) => {
  const pathname = usePathname();

  return (
      <TooltipProvider>
          <motion.aside
              onMouseEnter={onExpand}
              onMouseLeave={onCollapse}
              className={cn(
                  "hidden md:flex flex-col fixed left-0 top-0 h-screen z-40 transition-shadow duration-300",
                  "border-r border-white/5",
                  glassConfig.sidebar.blur,
                  glassConfig.sidebar.background,
                  isExpanded && "shadow-2xl shadow-black/50",
                  className,
              )}
              variants={motionConfig.variants.sidebar}
              initial={false}
              animate={isExpanded ? "expanded" : "collapsed"}
              transition={motionConfig.sidebarTransition}
          >
              {/* Logo/Brand Header Area */}
              <div className={cn("flex h-14 items-center border-b border-white/5 px-2 lg:h-[60px]")}>
                  <Link href="/" className="flex items-center gap-2 font-semibold text-white truncate pl-4">
                      <Package2 className="h-6 w-6 shrink-0" />
                      {isExpanded && (
                          <motion.span
                              className="truncate"
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -10 }}
                              transition={motionConfig.sidebarTransition}
                          >
                              Dungeons & Dicas
                          </motion.span>
                      )}
                  </Link>
              </div>

              {/* Navigation */}
              <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2">
                  <div className="space-y-6">
                      {/* Main Items */}
                      <div className="space-y-1">
                          {mainItems.map((item) => (
                              <SidebarItem
                                  key={item.href}
                                  href={item.href}
                                  icon={item.icon}
                                  label={item.label}
                                  isExpanded={isExpanded}
                                  isActive={pathname === item.href}
                              />
                          ))}
                      </div>

                      {/* Cadastros (formerly Módulos) - T020 */}
                      <SidebarSection isExpanded={isExpanded}>
                          {cadastrosItems.map((item) => (
                              <SidebarItem
                                  key={item.href}
                                  href={item.href}
                                  icon={item.icon}
                                  label={item.label}
                                  isExpanded={isExpanded}
                                  isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                              />
                          ))}
                      </SidebarSection>

                      {/* Admin */}
                      <SidebarSection isExpanded={isExpanded}>
                          {adminItems.map((item) => (
                              <SidebarItem
                                  key={item.href}
                                  href={item.href}
                                  icon={item.icon}
                                  label={item.label}
                                  isExpanded={isExpanded}
                                  isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                              />
                          ))}
                      </SidebarSection>
                  </div>
              </nav>

              {/* User Button Area at the bottom */}
              <div className={cn("border-t border-white/5 flex items-center gap-3 mt-auto py-4 px-2")}>
                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center ml-3">
                      <UserButton afterSignOutUrl="/sign-in" />
                  </div>
                  {isExpanded && (
                      <motion.div
                          className="flex flex-col overflow-hidden"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          transition={motionConfig.sidebarTransition}
                      >
                          <span className="text-sm font-medium text-white truncate">Minha Conta</span>
                          <span className="text-[10px] font-mono tracking-wider text-white/30 uppercase mt-0.5">{APP_VERSION}</span>
                      </motion.div>
                  )}
              </div>
          </motion.aside>
      </TooltipProvider>
  )
};

ExpandableSidebar.displayName = 'ExpandableSidebar';
