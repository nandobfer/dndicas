import { FeatsPage } from '@/features/feats/components/feats-page';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Catálogo de Talentos | D&Dicas',
  description: 'Gerencie os talentos disponíveis para personagens D&D 5e.',
};

export default function Page() {
  return <FeatsPage />;
}
