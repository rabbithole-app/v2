import { TreeNode } from './tree.model';

export const EXAMPLE_DATA: TreeNode[] = [
  {
    name: 'Company',
    path: 'company',
    children: [
      {
        name: 'Engineering',
        path: 'company/engineering',
        children: [
          {
            name: 'Frontend',
            path: 'company/engineering/frontend',
            children: [
              {
                name: 'Design System',
                path: 'company/engineering/frontend/design-system',
                children: [
                  {
                    name: 'Components',
                    path: 'company/engineering/frontend/design-system/components',
                  },
                  {
                    name: 'Tokens',
                    path: 'company/engineering/frontend/design-system/tokens',
                  },
                  {
                    name: 'Guidelines',
                    path: 'company/engineering/frontend/design-system/guidelines',
                  },
                ],
              },
              {
                name: 'Web Platform',
                path: 'company/engineering/frontend/web-platform',
              },
            ],
          },
          {
            name: 'Backend',
            path: 'company/engineering/backend',
            children: [
              { name: 'APIs', path: 'company/engineering/backend/apis' },
              {
                name: 'Infrastructure',
                path: 'company/engineering/backend/infrastructure',
              },
            ],
          },
          { name: 'Platform Team', path: 'company/engineering/platform-team' },
        ],
      },
      {
        name: 'Marketing',
        path: 'company/marketing',
        children: [
          { name: 'Content', path: 'company/marketing/content' },
          { name: 'SEO', path: 'company/marketing/seo' },
        ],
      },
      {
        name: 'Operations',
        path: 'company/operations',
        children: [
          { name: 'HR', path: 'company/operations/hr' },
          { name: 'Finance', path: 'company/operations/finance' },
        ],
      },
    ],
  },
];
