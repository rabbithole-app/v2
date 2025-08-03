import { NestedNode } from './tree.model';

export const EXAMPLE_DATA: NestedNode[] = [
  {
    name: 'Company',
    key: 'company',
    children: [
      {
        name: 'Engineering',
        key: 'engineering',
        children: [
          {
            name: 'Frontend',
            key: 'frontend',
            children: [
              {
                name: 'Design System',
                key: 'design-system',
                children: [
                  { name: 'Components', key: 'components' },
                  { name: 'Tokens', key: 'tokens' },
                  { name: 'Guidelines', key: 'guidelines' },
                ],
              },
              { name: 'Web Platform', key: 'web-platform' },
            ],
          },
          {
            name: 'Backend',
            key: 'backend',
            children: [
              { name: 'APIs', key: 'apis' },
              { name: 'Infrastructure', key: 'infrastructure' },
            ],
          },
          { name: 'Platform Team', key: 'platform-team' },
        ],
      },
      {
        name: 'Marketing',
        key: 'marketing',
        children: [
          { name: 'Content', key: 'content' },
          { name: 'SEO', key: 'seo' },
        ],
      },
      {
        name: 'Operations',
        key: 'operations',
        children: [
          { name: 'HR', key: 'hr' },
          { name: 'Finance', key: 'finance' },
        ],
      },
    ],
  },
];
