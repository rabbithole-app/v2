export const idlFactory = ({ IDL }) => {
  const Entry = IDL.Variant({ 'Directory' : IDL.Text, 'Asset' : IDL.Text });
  const Result_3 = IDL.Variant({
    'ok' : IDL.Null,
    'err' : IDL.Variant({ 'NotFound' : IDL.Null, 'NotAMember' : IDL.Null }),
  });
  const Result_2 = IDL.Variant({
    'ok' : IDL.Nat64,
    'err' : IDL.Variant({
      'ParentNotFound' : IDL.Null,
      'AlreadyExists' : IDL.Null,
      'IllegalCharacters' : IDL.Null,
      'NotAMember' : IDL.Null,
    }),
  });
  const Result_1 = IDL.Variant({
    'ok' : IDL.Null,
    'err' : IDL.Variant({
      'NotFound' : IDL.Null,
      'NotAMember' : IDL.Null,
      'NotEmpty' : IDL.Null,
    }),
  });
  const Permission = IDL.Variant({
    'Read' : IDL.Null,
    'Write' : IDL.Null,
    'Admin' : IDL.Null,
    'Permissions' : IDL.Null,
  });
  const Result = IDL.Variant({ 'ok' : IDL.Null, 'err' : IDL.Text });
  const NodeKey = IDL.Variant({
    'Directory' : IDL.Tuple(IDL.Opt(IDL.Nat64), IDL.Text),
    'Asset' : IDL.Tuple(IDL.Opt(IDL.Nat64), IDL.Text),
  });
  const PermissionsCanister = IDL.Service({
    'clear' : IDL.Func([IDL.Opt(Entry), IDL.Bool], [Result_3], []),
    'create' : IDL.Func([Entry], [Result_2], []),
    'delete' : IDL.Func([Entry, IDL.Bool], [Result_1], []),
    'grant_permission' : IDL.Func(
        [IDL.Opt(Entry), IDL.Principal, Permission],
        [Result],
        [],
      ),
    'has_permission' : IDL.Func(
        [IDL.Opt(Entry), Permission],
        [IDL.Bool],
        ['query'],
      ),
    'node_entries' : IDL.Func(
        [],
        [
          IDL.Vec(
            IDL.Tuple(
              NodeKey,
              IDL.Nat64,
              IDL.Vec(IDL.Tuple(IDL.Principal, Permission)),
            )
          ),
        ],
        ['query'],
      ),
    'revoke_permission' : IDL.Func(
        [IDL.Opt(Entry), IDL.Principal, Permission],
        [Result],
        [],
      ),
    'show_tree' : IDL.Func([IDL.Opt(Entry)], [IDL.Text], ['query']),
  });
  return PermissionsCanister;
};
export const init = ({ IDL }) => { return []; };
