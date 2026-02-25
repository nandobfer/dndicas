/**
 * @fileoverview Spells catalog page route.
 * User Story 1: View & Search spells.
 *
 * @see specs/004-spells-catalog/spec.md - FR-004, FR-005
 */

import { SpellsPage } from '@/features/spells/components/spells-page';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Catálogo de Magias | D&Dicas',
  description: 'Explore as magias disponíveis para conjuradores D&D 5e.',
};

export default function Page() {
  return <SpellsPage />;
}
