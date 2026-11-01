/**
 * @typedef {Object} ElsewhereLink
 * @property {'linkedin' | 'github' | 'x' | 'email'} id
 * @property {'LinkedIn' | 'GitHub' | 'X' | 'Email'} label
 * @property {string} href
 * @property {string} accessibleName
 * @property {number} footerOrder
 */

/** @type {readonly ElsewhereLink[]} */
export const ELSEWHERE_LINKS = [
  {
    id: 'linkedin',
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/kaleb-cole',
    accessibleName: 'Kaleb Cole on LinkedIn, external link',
    footerOrder: 2,
  },
  {
    id: 'github',
    label: 'GitHub',
    href: 'https://github.com/KalebCole',
    accessibleName: 'Kaleb Cole on GitHub, external link',
    footerOrder: 1,
  },
  {
    id: 'x',
    label: 'X',
    href: 'https://x.com/Kalebicole',
    accessibleName: 'Kaleb Cole on X, external link',
    footerOrder: 3,
  },
  {
    id: 'email',
    label: 'Email',
    href: 'mailto:kalebcole2021@gmail.com',
    accessibleName: 'Email Kaleb Cole, opens email client',
    footerOrder: 4,
  },
];
