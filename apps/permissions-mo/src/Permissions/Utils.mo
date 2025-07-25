import Text "mo:base/Text";
import Order "mo:base/Order";
import { Tuple2 } "mo:core/Tuples";
import Nat64 "mo:core/Nat64";
import Option "mo:core/Option";

import Map "mo:map/Map";

import T "Types";

module {
    let { hashText; hashNat64 } = Map;

    public let hash_permissions : Map.HashUtils<T.Permission> = (
        func k = hashText(convert_permission_to_text k),
        func(a, b) = a == b,
    );

    public let hash_nodes : Map.HashUtils<T.NodeKey> = (
        func(key) = switch (extract_from_node_key(key)) {
            case (kind, ?parent_id, name) (hashText(debug_show kind # name) +% hashNat64(parent_id)) & 0x3fffffff;
            case (kind, null, name) hashText(debug_show kind # name);
        },
        func(a, b) = switch (a, b) {
            case ((#Asset(apid, aname), #Asset(bpid, bname)) or (#Directory(apid, aname), #Directory(bpid, bname))) Option.equal(apid, bpid, Nat64.equal) and aname == bname;
            case (_, _) false;
        },
    );

    func convert_permission_to_text(permission : T.Permission) : Text = switch (permission) {
        case (#Admin) "Admin";
        case (#Read) "Read";
        case (#Write) "Write";
        case (#Permissions) "Permissions";
    };

    public func permission_compare(a : T.Permission, b : T.Permission) : Order.Order {
        switch ((a, b)) {
            case ((#Admin, #Admin) or (#Permissions, #Permissions) or (#Write, #Write) or (#Read, #Read)) #equal;
            case ((#Admin, _) or (#Permissions, #Write or #Read) or (#Write, #Read)) #greater;
            case ((#Read, _) or (#Permissions, #Admin) or (#Write, #Admin or #Permissions)) #less;
        };
    };

    public func extract_from_entry(args : T.Entry) : ({ #Asset; #Directory }, Text) {
        switch (args) {
            case (#Asset path) (#Asset, path);
            case (#Directory path) (#Directory, path);
        };
    };

    public func extract_from_node_key(node_key : T.NodeKey) : ({ #Asset; #Directory }, ?Nat64, Text) {
        switch (node_key) {
            case (#Asset(parent_id, name)) (#Asset, parent_id, name);
            case (#Directory(parent_id, name)) (#Directory, parent_id, name);
        };
    };
};
