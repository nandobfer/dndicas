/**
 * @fileoverview Glass-styled status toggler for active/inactive states.
 * Wraps GlassSwitch with specific labeling for entity status management.
 *
 * @see specs/004-spells-catalog/plan.md - UI Component Architecture
 */

"use client";

import { GlassSwitch } from './glass-switch';
import { cn } from '@/core/utils';

export interface GlassStatusTogglerProps {
  /** Current status value */
  status: 'active' | 'inactive';
  /** Callback when status changes */
  onStatusChange: (status: 'active' | 'inactive') => void;
  /** Entity name for label (e.g., "magia", "talento", "regra") */
  entityName?: string;
  /** Whether the toggler is disabled */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
  /** Show status label */
  showLabel?: boolean;
}

/**
 * Glass Status Toggler Component
 *
 * Form input for toggling entity status between active and inactive.
 * Uses GlassSwitch with semantic labeling.
 *
 * - Checked (ON) = Active status (green)
 * - Unchecked (OFF) = Inactive status (gray)
 *
 * @example
 * ```tsx
 * // Basic usage
 * const [status, setStatus] = useState<'active' | 'inactive'>('active');
 *
 * <GlassStatusToggler
 *   status={status}
 *   onStatusChange={setStatus}
 * />
 *
 * // With entity name
 * <GlassStatusToggler
 *   status={spell.status}
 *   onStatusChange={(newStatus) => updateSpell({ status: newStatus })}
 *   entityName="magia"
 * />
 *
 * // With custom label
 * <GlassStatusToggler
 *   status={status}
 *   onStatusChange={setStatus}
 *   showLabel
 *   entityName="talento"
 * />
 * ```
 */
export function GlassStatusToggler({
  status,
  onStatusChange,
  entityName = 'item',
  disabled = false,
  className,
  showLabel = true,
}: GlassStatusTogglerProps) {
  const isActive = status === 'active';

  const handleToggle = (checked: boolean) => {
    onStatusChange(checked ? 'active' : 'inactive');
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {showLabel && (
        <label className="text-sm font-medium text-white/90">
          Status do {entityName}
        </label>
      )}

      <GlassSwitch
        checked={isActive}
        onCheckedChange={handleToggle}
        disabled={disabled}
        label={isActive ? 'Ativo' : 'Inativo'}
        description={
          isActive
            ? `Este ${entityName} está visível para todos os usuários`
            : `Este ${entityName} está oculto e visível apenas para administradores`
        }
      />
    </div>
  );
}
