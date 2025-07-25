import Iter "mo:core/Iter";
import Nat64 "mo:core/Nat64";
import Option "mo:core/Option";
import Order "mo:core/Order";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Runtime "mo:core/Runtime";
import Nat "mo:core/Nat";
import Array "mo:core/Array";

import Vector "mo:vector";
import IC "mo:ic";
import Map "mo:map/Map";
import Set "mo:map/Set";
import { repeat } "mo:moh/Text";

import T "Types";
import Path "Path";
import Utils "Utils";
import ErrorMessages "ErrorMessages";

module Permissions {
    let { phash } = Map;
    let {
        hash_nodes;
        permission_compare;
        extract_from_entry;
        extract_from_node_key;
    } = Utils;
    let { ic } = IC;

    /// Create a new stable Permissions instance on the heap.
    /// This instance is stable and will not be cleared on canister upgrade.
    ///
    /// Example:
    /// ```motoko
    /// stable var permissions = Permissions.new({
    ///    rights = ?[(#Admin, [owner, Principal.fromActor(this)])]; // owner is a canister installer principal
    /// });
    /// ```
    public func new(args : T.InitArgs) : T.Store {
        let state : T.Store = {
            var id = 0;
            nodes = Map.new();
            root_permissions = Map.new();
        };

        switch (args.rights) {
            case (?v) {
                for ((permission, principals) in Iter.fromArray(v)) {
                    for (principal in Iter.fromArray(principals)) {
                        ignore grant_permission(state, null, principal, permission);
                    };
                };
            };
            case null {};
        };

        state;
    };

    func find_key_by_entry(self : T.Store, entry : ?T.Entry) : ?T.NodeKey {
        let (kind, path) = switch (entry) {
            case null return null;
            case (?v) extract_from_entry(v);
        };

        let dirnames = Path.normalize(path) |> Text.split(_, #char '/') |> Vector.fromIter<Text>(_);
        let filename : ?Text = if (kind == #Asset) Vector.removeLast(dirnames) else null;

        var parent_id : ?Nat64 = null;
        var current_node_key : ?T.NodeKey = null;
        for (name in Vector.vals(dirnames)) {
            let node_key : T.NodeKey = #Directory(parent_id, name);
            let ?{ id } = Map.get(self.nodes, hash_nodes, node_key) else return null;
            parent_id := ?id;
            current_node_key := ?node_key;
        };

        switch (filename, current_node_key) {
            case (?fname, _) {
                let ?_ = Map.get(self.nodes, hash_nodes, #Asset(parent_id, fname)) else return null;
                ?#Asset(parent_id, fname);
            };
            case (null, ?node_key) ?node_key;
            case _ null;
        };
    };

    func find_node_by_entry(self : T.Store, entry : ?T.Entry) : ?T.PermissionNodeExt {
        let ?node_key = find_key_by_entry(self, entry) else return null;
        let ?node = Map.get(self.nodes, hash_nodes, node_key) else return null;
        let (kind, parent_id, name) = extract_from_node_key(node_key);
        ?{ node and { kind; parent_id; name } };
    };

    func find_nearest_node_by_entry(self : T.Store, entry : T.Entry) : ?T.PermissionNodeExt {
        let (kind, path) = extract_from_entry(entry);
        let dirnames = Path.normalize(path) |> Text.split(_, #char '/') |> Vector.fromIter<Text>(_);
        let filename : ?Text = if (kind == #Asset) Vector.removeLast(dirnames) else null;

        var parent_id : ?Nat64 = null;
        var current_node_key : ?T.NodeKey = null;

        label dirs_loop for (name in Vector.vals(dirnames)) {
            let node_key : T.NodeKey = #Directory(parent_id, name);
            let ?{ id } = Map.get(self.nodes, hash_nodes, node_key) else break dirs_loop;
            parent_id := ?id;
            current_node_key := ?node_key;
        };

        let node_key : T.NodeKey = switch (filename, current_node_key) {
            case (?fname, node_key) switch (Map.get(self.nodes, hash_nodes, #Asset(parent_id, fname)), node_key) {
                case (null, ?node_key) node_key;
                case _ #Asset(parent_id, fname);
            };
            case (null, ?node_key) node_key;
            case _ return null;
        };

        let ?node = Map.get(self.nodes, hash_nodes, node_key) else return null;
        let (_kind, _, name) = extract_from_node_key(node_key);
        ?{ node and { parent_id; name; kind = _kind } };
    };

    func get_permissions(self : T.Store, entry : ?T.Entry) : T.PermissionList {
        switch (find_node_by_entry(self, entry)) {
            case (?node) node.permissions;
            case null self.root_permissions;
        };
    };

    func list_by_parent_id(self : T.Store, id : ?Nat64) : [T.PermissionNodeExt] {
        let vector = Vector.new<T.PermissionNodeExt>();
        for ((node_key, node) in Map.entries(self.nodes)) {
            let (kind, parent_id, name) = extract_from_node_key(node_key);
            if (id == parent_id) Vector.add(vector, { node and { kind; parent_id; name } });
        };
        Vector.toArray(vector);
    };

    public func has_permission(self : T.Store, entry : ?T.Entry, caller : Principal, permission : T.Permission) : Bool {
        let permissions = switch (entry) {
            case (?v) switch (find_nearest_node_by_entry(self, v)) {
                case (?{ permissions }) permissions;
                case null self.root_permissions;
            };
            case null self.root_permissions;
        };
        let set = Map.entries(permissions) |> Iter.filterMap<(Principal, T.Permission), Principal>(
            _,
            func((k, v)) = if (not Order.isLess(permission_compare(v, permission))) ?k else null,
        ) |> Set.fromIter(_, phash);
        var can = Set.has(set, phash, Principal.anonymous()) or Set.has(set, phash, caller);

        switch (can, entry) {
            case (false, ?v) {
                let path = extract_from_entry(v).1;
                let dirname = Path.dirname(path);
                let entry : ?T.Entry = if (Text.equal(dirname, "")) null else ?#Directory(dirname);
                can := has_permission(self, entry, caller, permission);
            };
            case _ {};
        };
        can;
    };

    /// Gets the list of principals with a specific permission.
    func get_permission_list(self : T.Store, entry : ?T.Entry, permission : T.Permission, recursive : Bool) : [Principal] {
        let permissions = get_permissions(self, entry);
        let permission_set = Map.entries(permissions) |> Iter.filterMap<(Principal, T.Permission), Principal>(
            _,
            func(key, value) = if (permission == value) ?key else null,
        ) |> Set.fromIter(_, phash);

        switch (recursive, entry) {
            case (true, ?v) {
                let (_, path) = extract_from_entry(v);
                let dirname = Path.dirname(path);
                let entry : ?T.Entry = if (Text.equal(dirname, "")) null else ?#Directory(dirname);
                let iter = get_permission_list(self, entry, permission, true) |> Iter.fromArray _;
                for (principal in iter) {
                    Set.add(permission_set, phash, principal);
                };
            };
            case _ {};
        };

        Set.toArray(permission_set);
    };

    /// Grants a permission to a principal.
    public func grant_permission(self : T.Store, entry : ?T.Entry, principal : Principal, permission : T.Permission) : Result.Result<(), Text> {
        let permissions = get_permissions(self, entry);
        ignore Map.put(permissions, phash, principal, permission);
        #ok();
    };

    /// Revokes a permission from a principal.
    public func revoke_permission(self : T.Store, entry : ?T.Entry, principal : Principal, permission : T.Permission) : Result.Result<(), Text> {
        let permissions = get_permissions(self, entry);
        Map.delete(permissions, phash, principal);
        #ok();
    };

    public func clear(self : T.Store, entry : ?T.Entry, recursive : Bool) : Result.Result<(), { #NotFound }> {
        let ?node_key = find_key_by_entry(self, entry) else return #err(#NotFound);
        clear_node(self, node_key, recursive);
    };

    func clear_node(self : T.Store, node_key : T.NodeKey, recursive : Bool) : Result.Result<(), { #NotFound }> {
        let ?node = Map.get(self.nodes, hash_nodes, node_key) else return #err(#NotFound);

        // for (set in Map.vals(node.permissions)) Set.clear(set);
        Map.clear(node.permissions);

        if (recursive) {
            let iter = list_by_parent_id(self, ?node.id) |> Iter.fromArray _;
            for (node in iter) {
                switch (node.kind) {
                    case (#Asset) ignore clear_node(self, #Asset(?node.id, node.name), false);
                    case (#Directory) ignore clear_node(self, #Directory(?node.id, node.name), true);
                };
            };
        };

        #ok();
    };

    public func delete(self : T.Store, entry : T.Entry, recursive : Bool) : Result.Result<(), { #NotFound; #NotEmpty }> {
        let ?node_key = find_key_by_entry(self, ?entry) else return #err(#NotFound);
        delete_node(self, node_key, recursive);
    };

    func has_children(self : T.Store, id : Nat64) : Bool {
        label for_loop for ((node_key, node) in Map.entries(self.nodes)) {
            let (_, ?parent_id, _) = extract_from_node_key(node_key) else continue for_loop;
            if (id == parent_id) return true;
        };
        false;
    };

    func delete_node(self : T.Store, node_key : T.NodeKey, recursive : Bool) : Result.Result<(), { #NotFound; #NotEmpty }> {
        let ?node = Map.get(self.nodes, hash_nodes, node_key) else return #err(#NotFound);
        let not_empty = not recursive and has_children(self, node.id);

        if (not_empty) return #err(#NotEmpty);

        switch (node_key) {
            case (#Asset(parent_id, name)) Map.delete(self.nodes, hash_nodes, #Asset(parent_id, name));
            case (#Directory(_, name)) {
                if (recursive) {
                    let iter = list_by_parent_id(self, ?node.id) |> Iter.fromArray _;
                    for (subnode in iter) {
                        ignore delete_node(self, #Directory(?node.id, subnode.name), true);
                    };
                };
            };
        };

        Map.delete(self.nodes, hash_nodes, node_key);

        #ok();
    };

    public func create(self : T.Store, entry : T.Entry) : Result.Result<Nat64, { #AlreadyExists; #IllegalCharacters }> {
        switch (find_node_by_entry(self, ?entry)) {
            case (?_) return #err(#AlreadyExists);
            case null create_path(self, entry);
        };
    };

    func create_path(self : T.Store, entry : T.Entry) : Result.Result<Nat64, { #IllegalCharacters }> {
        let (kind, path) = extract_from_entry(entry);
        let dirnames = Path.normalize(path) |> Text.split(_, #char '/') |> Vector.fromIter<Text>(_);
        let filename : ?Text = if (kind == #Asset) Vector.removeLast(dirnames) else null;

        var parent_id : ?Nat64 = null;

        for (name in Vector.vals(dirnames)) {
            parent_id := switch (Map.get(self.nodes, hash_nodes, #Directory(parent_id, name))) {
                case (?v) ?v.id;
                case null switch (create_node(self, #Directory(parent_id, name))) {
                    case (#ok v) ?v.id;
                    case (#err(#AlreadyExists v)) ?v.id;
                    case (#err(#IllegalCharacters)) return #err(#IllegalCharacters);
                };
            };
        };
        switch (filename) {
            case (?name) {
                parent_id := switch (create_node(self, #Asset(parent_id, name))) {
                    case (#ok v) ?v.id;
                    case (#err(#AlreadyExists v)) ?v.id;
                    case (#err(#IllegalCharacters)) return #err(#IllegalCharacters);
                };
            };
            case null {};
        };
        let ?id = parent_id else Runtime.unreachable();
        #ok id;
    };

    func create_node(self : T.Store, node_key : T.NodeKey) : Result.Result<T.PermissionNodeExt, { #AlreadyExists : T.PermissionNodeExt; #IllegalCharacters }> {
        let (kind, parent_id, name) = extract_from_node_key(node_key);
        switch (Map.get(self.nodes, hash_nodes, node_key)) {
            case (?v) #err(#AlreadyExists({ v and { kind; parent_id; name } }));
            case null {
                let now = Time.now();
                self.id := Nat64.add(self.id, 1);
                let node : T.PermissionNode = {
                    id = self.id;
                    permissions = Map.new();
                    created_at = now;
                    modified_at = ?now;
                };
                ignore Map.put(self.nodes, hash_nodes, node_key, node);
                #ok({ node and { kind; parent_id; name } });
            };
        };
    };

    /// Checks if a principal is a controller of the asset canister.
    public func is_controller(canister_id : Principal, caller : Principal) : async* Result.Result<(), Text> {
        let info = await ic.canister_info({
            canister_id;
            num_requested_changes = ?0;
        });

        let res = Array.find(info.controllers, func(p : Principal) : Bool = p == caller);
        switch (res) {
            case (?_) #ok();
            case (_) #err("Caller is not a controller.");
        };
    };

    public func can_change_permission(self : T.Store, canister_id : Principal, caller : Principal, entry : ?T.Entry, permission : T.Permission) : async* Result.Result<(), Text> {
        var need_permission : T.Permission = #Permissions;

        if (has_permission(self, entry, caller, #Permissions)) {
            switch (get_max_permission(self, entry, caller, null)) {
                case (?v) if (not Order.isLess(permission_compare(v, permission))) return #ok;
                case null {
                    need_permission := #Admin;
                };
            };
        };

        let #err(not_controller_msg) = await* is_controller(canister_id, caller) else return #ok();

        #err(ErrorMessages.missing_permission(debug_show need_permission) # " and " # not_controller_msg);
    };

    func get_max_permission(self : T.Store, entry : ?T.Entry, principal : Principal, last_permission : ?T.Permission) : ?T.Permission {
        let permissions = switch (entry) {
            case (?v) switch (find_nearest_node_by_entry(self, v)) {
                case (?{ permissions }) permissions;
                case null self.root_permissions;
            };
            case null self.root_permissions;
        };

        var permission : ?T.Permission = last_permission;
        switch (permission, Map.get(permissions, phash, principal)) {
            case (?v, ?found) {
                let is_greater = Order.isGreater(permission_compare(v, found));
                if is_greater permission := ?found;
            };
            case (null, ?found) permission := ?found;
            case _ {};
        };

        let is_admin = switch (permission) {
            case (?v) v == #Admin;
            case null false;
        };

        switch (is_admin, entry) {
            case (false, ?v) {
                let path = extract_from_entry(v).1;
                let dirname = Path.dirname(path);
                let entry : ?T.Entry = if (Text.equal(dirname, "")) null else ?#Directory(dirname);
                get_max_permission(self, entry, principal, permission);
            };
            case _ permission;
        };
    };

    // public func rename(entry_from : T.Entry, entry_to : T.Entry) : Result.Result<(), { #NotFound; #BadEntry }> {
    //     switch (entry_from, entry_to) {
    //         case ((#Asset(from), #Asset(to)) or (#Directory(from), #Directory(to))) {

    //         };
    //         case _ return #err(#BadEntry);
    //     };
    // };

    // Tree visualization for debugging
    /* for example,
        .
        ├─crypto [id]
        │ └─nfts
        │   └─punks
        └─images
        └─icons
        */
    public func show_tree_admin(self : T.Store, entry : ?T.Entry) : Result.Result<Text, Text> {
        let content = switch (find_node_by_entry(self, entry)) {
            case (?{ id; name }) {
                let tree_content = show_sub_tree(self, ?id, 0, null, null);
                name # " [" # Nat64.toText(id) # "]" # tree_content;
            };
            case null " ." # show_sub_tree(self, null, 0, null, null);
        };
        #ok("\n" # content # "\n");
    };

    func show_sub_tree(self : T.Store, id : ?Nat64, depth : Nat, prefix_ : ?Text, is_parent_last_ : ?Bool) : Text {
        var output : Text = "";
        var i : Nat = 0;
        var is_parent_last = Option.get(is_parent_last_, true);
        var prefix : Text = Option.get(prefix_, "");
        if (depth > 0) { prefix #= if is_parent_last "░░" else "░│" };

        let items = list_by_parent_id(self, id);
        let count = items.size();
        let prefix_length = prefix.size();
        for ({ id; name } in items.vals()) {
            let is_last : Bool = Nat.equal(i, count - 1);
            let node = if is_last "└─" else "├─";
            output #= "\n" # prefix # repeat("░", depth * 2 - prefix_length) # node # name # "[" # Nat64.toText(id) # "]";
            output #= show_sub_tree(self, ?id, depth + 1, ?prefix, ?is_last);
            i += 1;
        };
        output;
    };

    public func node_entries(self : T.Store) : [(T.NodeKey, Nat64, [(Principal, T.Permission)])] {
        let vector = Vector.new<(T.NodeKey, Nat64, [(Principal, T.Permission)])>();
        for ((node_key, node) in Map.entries(self.nodes)) {
            let permissions = Map.entries(node.permissions) |> Array.fromIter _;
            Vector.add(vector, (node_key, node.id, permissions));
        };
        Vector.toArray(vector);
    };
};
