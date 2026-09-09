import { usePageTitle } from '@/hooks/usePageTitle';
import { DeveloperHub } from '@/features/developer/components/DeveloperHub';

export default function DeveloperPage() {
  usePageTitle('Developer');
  return <DeveloperHub />;
}
