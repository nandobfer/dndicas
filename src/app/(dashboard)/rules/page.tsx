import { RulesPage } from '@/features/rules/components/rules-page';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Catálogo de Regras | D&Dicas',
  description: 'Gerencie as regras de referência do sistema D&D 5e.',
};

export default function Page() {
  return <RulesPage />;
}
