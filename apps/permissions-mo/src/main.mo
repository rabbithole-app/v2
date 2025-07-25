import Nat64 "mo:core/Nat64";
import Error "mo:core/Error";
import Principal "mo:core/Principal";
import Result "mo:core/Result";

import Permissions "Permissions";
import Types "Permissions/Types";
import ErrorMessages "Permissions/ErrorMessages";

shared ({ caller = owner }) actor class PermissionsCanister() = this {
    stable var permissions = Permissions.new({
        rights = ?[(#Admin, [owner, Principal.fromActor(this)])];
    });

    public query ({ caller }) func show_tree(entry : ?Types.Entry) : async Text {
        if (not Permissions.has_permission(permissions, entry, caller, #Admin)) {
            throw Error.reject(ErrorMessages.missing_permission(debug_show #Admin));
        };

        let result = Permissions.show_tree_admin(permissions, entry);
        switch (result) {
            case (#ok v) v;
            case (#err message) throw Error.reject(message);
        };
    };

    public shared ({ caller }) func create(entry : Types.Entry) : async Result.Result<Nat64, { #AlreadyExists; #ParentNotFound; #NotAMember; #IllegalCharacters }> {
        if (not Permissions.has_permission(permissions, ?entry, caller, #Write)) return #err(#NotAMember);

        Permissions.create(permissions, entry);
    };

    public shared ({ caller }) func delete(entry : Types.Entry, recursive : Bool) : async Result.Result<(), { #NotFound; #NotAMember; #NotEmpty }> {
        if (not Permissions.has_permission(permissions, ?entry, caller, #Write)) return #err(#NotAMember);

        Permissions.delete(permissions, entry, recursive);
    };

    public shared ({ caller }) func clear(entry : ?Types.Entry, recursive : Bool) : async Result.Result<(), { #NotFound; #NotAMember }> {
        if (not Permissions.has_permission(permissions, entry, caller, #Admin)) return #err(#NotAMember);

        Permissions.clear(permissions, entry, recursive);
    };

    public query ({ caller }) func has_permission(entry : ?Types.Entry, permission : Types.Permission) : async Bool {
        Permissions.has_permission(permissions, entry, caller, permission);
    };

    public shared ({ caller }) func grant_permission(entry : ?Types.Entry, principal : Principal, permission : Types.Permission) : async Result.Result<(), Text> {
        switch (await* Permissions.can_change_permission(permissions, Principal.fromActor(this), caller, entry, permission)) {
            case (#ok) Permissions.grant_permission(permissions, entry, principal, permission);
            case (#err message) throw Error.reject(message);
        };
    };

    public shared ({ caller }) func revoke_permission(entry : ?Types.Entry, principal : Principal, permission : Types.Permission) : async Result.Result<(), Text> {
        let is_caller_trying_to_revoke_their_own_permission = Principal.equal(principal, caller);

        if (is_caller_trying_to_revoke_their_own_permission) {
            // caller does not have said permission
            if (not Permissions.has_permission(permissions, entry, principal, #Permissions)) {
                return #ok();
            };
        };

        if (not is_caller_trying_to_revoke_their_own_permission) {
            switch (await* Permissions.can_change_permission(permissions, Principal.fromActor(this), caller, entry, permission)) {
                case (#ok) {};
                case (#err message) throw Error.reject(message);
            };
        };

        Permissions.revoke_permission(permissions, entry, principal, permission);
    };

    public query func node_entries() : async [(Types.NodeKey, Nat64, [(Principal, Types.Permission)])] {
        Permissions.node_entries(permissions);
    };
};
