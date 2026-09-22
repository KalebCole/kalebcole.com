export type LinkDestination = {
  id: 'writing' | 'projects' | 'resume' | 'github' | 'linkedin' | 'email';
  label: string;
  href: string;
  kind: 'internal' | 'external' | 'email';
};

export const linkDestinations: readonly LinkDestination[] = [
  { id: 'writing', label: 'Writing', href: '/blog', kind: 'internal' },
  { id: 'projects', label: 'Projects', href: '/projects', kind: 'internal' },
  { id: 'resume', label: 'Résumé', href: '/resume.pdf', kind: 'internal' },
  { id: 'github', label: 'GitHub', href: 'https://github.com/KalebCole', kind: 'external' },
  { id: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/in/kaleb-cole', kind: 'external' },
  { id: 'email', label: 'Email', href: 'mailto:kalebcole2021@gmail.com', kind: 'email' },
];
