# Utils

## Value `hash_permissions`
``` motoko no-repl
let hash_permissions : Map.HashUtils<T.Permission>
```


## Value `hash_nodes`
``` motoko no-repl
let hash_nodes : Map.HashUtils<T.NodeKey>
```


## Function `permission_compare`
``` motoko no-repl
func permission_compare(a : T.Permission, b : T.Permission) : Order.Order
```


## Function `extract_from_entry`
``` motoko no-repl
func extract_from_entry(args : T.Entry) : ({#Asset; #Directory}, Text)
```


## Function `extract_from_node_key`
``` motoko no-repl
func extract_from_node_key(node_key : T.NodeKey) : ({#Asset; #Directory}, ?Nat64, Text)
```

