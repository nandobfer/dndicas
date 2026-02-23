import { TraitsPage } from '@/features/traits';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Catálogo de Habilidades | D&Dicas',
  description: 'Gerencie habilidades e traits do sistema D&D 5e.',
};

export default function Page() {
  return <TraitsPage />;
}
