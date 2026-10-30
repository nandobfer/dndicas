"use client"

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, Eye } from 'lucide-react';
import { useViewAs } from '@nandobfer/perfix/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/core/ui/popover';
import { tabSwap } from './motion';
import { cn } from '@/lib/utils';
import { useViewAsRoles } from '../../hooks/useViewAsOptions';
import { ViewAsRoleStep } from './ViewAsRoleStep';
import { ViewAsUserStep } from './ViewAsUserStep';
export function ViewAsSelector() {
  const reduceMotion = useReducedMotion();
  const { state, start, stop } = useViewAs();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'roles' | 'users'>('roles');
  const roles = useViewAsRoles(open);
  return <Popover open={open} onOpenChange={value => { setOpen(value); if (!value) setStep('roles'); }}>
    <PopoverTrigger asChild><button type="button" aria-label={state ? `Visualizando como ${state.label.alvo}. Trocar ou sair da simulação` : 'Visualizar como outro perfil ou usuário'} className={cn(
      'flex h-8 max-w-[220px] items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      state ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200' : 'border-input bg-background text-foreground hover:bg-muted data-[state=open]:bg-muted',
    )}><Eye className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="hidden truncate sm:inline">{state?.label.alvo ?? 'Visualizar como'}</span><ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden /></button></PopoverTrigger>
    <PopoverContent align="end" className="w-[min(320px,calc(100vw-2rem))] overflow-hidden p-0"><AnimatePresence mode="wait" initial={false}>
      <motion.div key={step} variants={reduceMotion ? undefined : tabSwap} initial="hidden" animate="visible" exit="exit">
        {step === 'roles' ? <ViewAsRoleStep roles={roles.data} isLoading={roles.isPending} isError={roles.isError} onRetry={() => void roles.refetch()} activeRoleId={state?.viewAs.tipo === 'cargo' ? state.viewAs.roleId : state ? '__usuario__' : null} onSelectUser={() => setStep('users')} onPickRole={role => {
          if (role.coringa) stop(); else start({ viewAs: { tipo: 'cargo', roleId: role.id }, label: { alvo: role.nome } });
          setOpen(false);
        }} /> : <ViewAsUserStep activeUserId={state?.viewAs.tipo === 'usuario' ? state.viewAs.userId : null} onBack={() => setStep('roles')} onPick={user => {
          start({ viewAs: { tipo: 'usuario', userId: user.id }, label: { alvo: user.nome } }); setOpen(false);
        }} />}
      </motion.div>
    </AnimatePresence></PopoverContent>
  </Popover>;
}
