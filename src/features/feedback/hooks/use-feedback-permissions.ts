import { useAuth } from '@/core/hooks/useAuth';
import type { Feedback } from '../types/feedback.types';

export function useFeedbackPermissions(feedback?: Feedback | null) {
  const { userId, isAdmin } = useAuth();
  
  // If no feedback is provided, assume it's a new one (full permissions for main fields)
  const isOwner = feedback ? feedback.createdBy === userId : true;
  const canEditMainFields = feedback ? (isAdmin || isOwner) : true;
  const canEditAdminFields = isAdmin;

  return {
    userId,
    isAdmin,
    isOwner,
    canEditMainFields,
    canEditAdminFields,
    canEdit: isAdmin || isOwner
  };
}
