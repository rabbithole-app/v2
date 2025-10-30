export const idlFactory = ({ IDL }) => {
  const CreateProfileArgs = IDL.Record({
    'username' : IDL.Text,
    'displayName' : IDL.Opt(IDL.Text),
    'inviter' : IDL.Opt(IDL.Principal),
    'avatarUrl' : IDL.Opt(IDL.Text),
  });
  const Time = IDL.Int;
  const Profile = IDL.Record({
    'id' : IDL.Principal,
    'username' : IDL.Text,
    'displayName' : IDL.Opt(IDL.Text),
    'inviter' : IDL.Opt(IDL.Principal),
    'createdAt' : Time,
    'updatedAt' : Time,
    'avatarUrl' : IDL.Opt(IDL.Text),
  });
  const Header = IDL.Tuple(IDL.Text, IDL.Text);
  const RawQueryHttpRequest = IDL.Record({
    'url' : IDL.Text,
    'method' : IDL.Text,
    'body' : IDL.Vec(IDL.Nat8),
    'headers' : IDL.Vec(Header),
    'certificate_version' : IDL.Opt(IDL.Nat16),
  });
  const StreamingToken = IDL.Vec(IDL.Nat8);
  const StreamingCallbackResponse = IDL.Record({
    'token' : IDL.Opt(StreamingToken),
    'body' : IDL.Vec(IDL.Nat8),
  });
  const StreamingCallback = IDL.Func(
      [StreamingToken],
      [StreamingCallbackResponse],
      ['query'],
    );
  const CallbackStreamingStrategy = IDL.Record({
    'token' : StreamingToken,
    'callback' : StreamingCallback,
  });
  const StreamingStrategy = IDL.Variant({
    'Callback' : CallbackStreamingStrategy,
  });
  const RawQueryHttpResponse = IDL.Record({
    'body' : IDL.Vec(IDL.Nat8),
    'headers' : IDL.Vec(Header),
    'upgrade' : IDL.Opt(IDL.Bool),
    'streaming_strategy' : IDL.Opt(StreamingStrategy),
    'status_code' : IDL.Nat16,
  });
  const RawUpdateHttpRequest = IDL.Record({
    'url' : IDL.Text,
    'method' : IDL.Text,
    'body' : IDL.Vec(IDL.Nat8),
    'headers' : IDL.Vec(Header),
  });
  const RawUpdateHttpResponse = IDL.Record({
    'body' : IDL.Vec(IDL.Nat8),
    'headers' : IDL.Vec(Header),
    'streaming_strategy' : IDL.Opt(StreamingStrategy),
    'status_code' : IDL.Nat16,
  });
  const SortDirection = IDL.Variant({
    'Descending' : IDL.Null,
    'Ascending' : IDL.Null,
  });
  const ListOptions = IDL.Record({
    'pagination' : IDL.Record({ 'offset' : IDL.Nat, 'limit' : IDL.Nat }),
    'count' : IDL.Bool,
    'sort' : IDL.Vec(IDL.Tuple(IDL.Text, SortDirection)),
    'filter' : IDL.Record({
      'id' : IDL.Opt(IDL.Vec(IDL.Principal)),
      'username' : IDL.Opt(IDL.Text),
      'displayName' : IDL.Opt(IDL.Text),
      'inviter' : IDL.Opt(IDL.Vec(IDL.Principal)),
      'createdAt' : IDL.Opt(
        IDL.Record({ 'max' : IDL.Opt(IDL.Int), 'min' : IDL.Opt(IDL.Int) })
      ),
      'avatarUrl' : IDL.Opt(IDL.Bool),
    }),
  });
  const GetProfilesResponse = IDL.Record({
    'total' : IDL.Opt(IDL.Nat),
    'data' : IDL.Vec(Profile),
    'instructions' : IDL.Nat,
  });
  const CreateProfileAvatarArgs = IDL.Record({
    'content' : IDL.Vec(IDL.Nat8),
    'contentType' : IDL.Text,
    'filename' : IDL.Text,
  });
  const UpdateProfileArgs = IDL.Record({
    'displayName' : IDL.Opt(IDL.Text),
    'avatarUrl' : IDL.Opt(IDL.Text),
  });
  const Rabbithole = IDL.Service({
    'createProfile' : IDL.Func([CreateProfileArgs], [IDL.Nat], []),
    'deleteProfile' : IDL.Func([], [], []),
    'getProfile' : IDL.Func([], [IDL.Opt(Profile)], ['query']),
    'http_request' : IDL.Func(
        [RawQueryHttpRequest],
        [RawQueryHttpResponse],
        ['query'],
      ),
    'http_request_update' : IDL.Func(
        [RawUpdateHttpRequest],
        [RawUpdateHttpResponse],
        [],
      ),
    'listProfiles' : IDL.Func([ListOptions], [GetProfilesResponse], ['query']),
    'removeAvatar' : IDL.Func([IDL.Text], [], []),
    'saveAvatar' : IDL.Func([CreateProfileAvatarArgs], [IDL.Text], []),
    'updateProfile' : IDL.Func([UpdateProfileArgs], [], []),
    'usernameExists' : IDL.Func([IDL.Text], [IDL.Bool], ['query']),
    'whoami' : IDL.Func([], [IDL.Text], ['query']),
  });
  return Rabbithole;
};
export const init = ({ IDL }) => { return []; };
