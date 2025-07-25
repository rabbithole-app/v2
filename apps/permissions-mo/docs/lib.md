# lib

## Function `new`
``` motoko no-repl
func new(args : T.InitArgs) : T.Store
```

Create a new stable Permissions instance on the heap.
This instance is stable and will not be cleared on canister upgrade.

Example:
```motoko
stable var permissions = Permissions.new({
   rights = ?[(#Admin, [owner, Principal.fromActor(this)])]; // owner is a canister installer principal
});
```

## Function `has_permission`
``` motoko no-repl
func has_permission(self : T.Store, entry : ?T.Entry, caller : Principal, permission : T.Permission) : Bool
```


## Function `grant_permission`
``` motoko no-repl
func grant_permission(self : T.Store, entry : ?T.Entry, principal : Principal, permission : T.Permission) : Result.Result<(), Text>
```

Grants a permission to a principal.

## Function `revoke_permission`
``` motoko no-repl
func revoke_permission(self : T.Store, entry : ?T.Entry, principal : Principal, permission : T.Permission) : Result.Result<(), Text>
```

Revokes a permission from a principal.

## Function `clear`
``` motoko no-repl
func clear(self : T.Store, entry : ?T.Entry, recursive : Bool) : Result.Result<(), {#NotFound}>
```


## Function `delete`
``` motoko no-repl
func delete(self : T.Store, entry : T.Entry, recursive : Bool) : Result.Result<(), {#NotFound; #NotEmpty}>
```


## Function `create`
``` motoko no-repl
func create(self : T.Store, entry : T.Entry) : Result.Result<Nat64, {#AlreadyExists; #IllegalCharacters}>
```


## Function `is_controller`
``` motoko no-repl
func is_controller(canister_id : Principal, caller : Principal) : async* Result.Result<(), Text>
```

Checks if a principal is a controller of the asset canister.

## Function `can_change_permission`
``` motoko no-repl
func can_change_permission(self : T.Store, canister_id : Principal, caller : Principal, entry : ?T.Entry, permission : T.Permission) : async* Result.Result<(), Text>
```


## Function `show_tree_admin`
``` motoko no-repl
func show_tree_admin(self : T.Store, entry : ?T.Entry) : Result.Result<Text, Text>
```


## Function `node_entries`
``` motoko no-repl
func node_entries(self : T.Store) : [(T.NodeKey, Nat64, [(Principal, T.Permission)])]
```

