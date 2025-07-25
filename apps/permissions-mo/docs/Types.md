# Types

## Type `NodeKey`
``` motoko no-repl
type NodeKey = {#Directory : (?Nat64, Text); #Asset : (?Nat64, Text)}
```


## Type `Permission`
``` motoko no-repl
type Permission = {#Admin; #Read; #Write; #Permissions}
```


## Type `PermissionList`
``` motoko no-repl
type PermissionList = Map.Map<Principal, Permission>
```


## Type `PermissionNode`
``` motoko no-repl
type PermissionNode = { id : Nat64; created_at : Time.Time; modified_at : ?Time.Time; permissions : PermissionList }
```


## Type `PermissionNodeExt`
``` motoko no-repl
type PermissionNodeExt = PermissionNode and { name : Text; parent_id : ?Nat64; kind : {#Asset; #Directory} }
```


## Type `Store`
``` motoko no-repl
type Store = { var id : Nat64; nodes : Map.Map<NodeKey, PermissionNode>; root_permissions : PermissionList }
```


## Type `Entry`
``` motoko no-repl
type Entry = {#Directory : Text; #Asset : Text}
```


## Type `InitArgs`
``` motoko no-repl
type InitArgs = { rights : ?[(Permission, [Principal])] }
```


## Type `Action`
``` motoko no-repl
type Action = {#Create : Entry; #Delete : (Entry, Bool); #Clear : (Entry, Bool); #GrantPermission : (?Entry, Principal, Permission); #RevokePermission : (?Entry, Principal, Permission)}
```

