import { match, P } from 'ts-pattern';

import { TreeNode as TreeNodeRaw } from '../canisters/encrypted-storage.did';
import { TreeNode } from '../types';

export function convertTreeNodes(
  items: TreeNodeRaw[],
  prefix?: string,
): TreeNode[] {
  return items.map((node) =>
    match(node)
      .returnType<TreeNode>()
      .with(
        {
          name: P.string.select('name'),
          children: [P.array().select('children')],
        },
        ({ name, children }) => {
          const path = prefix ? `${prefix}/${name}` : name;
          return { name, path, children: convertTreeNodes(children, path) };
        },
      )
      .with({ name: P.string.select('name') }, ({ name }) => {
        const path = prefix ? `${prefix}/${name}` : name;
        return { name, path };
      })
      .exhaustive(),
  );
}
