import T "Types";
import { extract_from_entry } "Utils";

module ErrorMessages {
    public func not_found(entry : ?T.Entry) : Text {
        switch (entry) {
            case null "Root not found";
            case (?v) {
                let (kind, path) = extract_from_entry(v);
                debug_show kind # " not found for path: " # path;
            };
        };
    };

    public func bad_entry_args(entry : T.Entry) : Text {
        "Bad entry arguments: " # debug_show entry;
    };

    public func already_exists(entry : T.Entry) : Text {
        let (kind, path) = extract_from_entry(entry) else return "Root already exists";
        debug_show kind # " already exists for path: " # path;
    };

    public func missing_permission(permission : Text) : Text {
        "Caller does not have " # debug_show permission # " permission";
    };
};
