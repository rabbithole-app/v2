import Principal "mo:base/Principal";
import Time "mo:base/Time";
import Map "mo:map/Map";
import Set "mo:map/Set";

module {
    // (parent_id, dirname)
    public type NodeKey = {
        #Directory : (?Nat64, Text);
        #Asset : (?Nat64, Text);
    };

    public type Permission = {
        #Admin; // Full administrative rights, including managing permissions and sublists.
        #Read; // Permission to view the list and its members.
        #Write; // Ability to modify the list, add or remove members.
        #Permissions; // Rights to modify the permissions of other identities in the list.
    };

    public type PermissionList = Map.Map<Principal, Permission>;

    public type PermissionNode = {
        id : Nat64;
        created_at : Time.Time;
        modified_at : ?Time.Time;
        permissions : PermissionList;
    };

    public type PermissionNodeExt = PermissionNode and {
        name : Text;
        parent_id : ?Nat64;
        kind : { #Asset; #Directory };
    };

    public type Store = {
        var id : Nat64;
        nodes : Map.Map<NodeKey, PermissionNode>;
        root_permissions : PermissionList;
    };

    public type Entry = {
        #Directory : Text;
        #Asset : Text;
    };

    public type InitArgs = {
        rights : ?[(Permission, [Principal])];
    };

    public type Action = {
        #Create : Entry;
        #Delete : (Entry, Bool);
        #Clear : (Entry, Bool);
        #GrantPermission : (?Entry, Principal, Permission);
        #RevokePermission : (?Entry, Principal, Permission);
    };
};
